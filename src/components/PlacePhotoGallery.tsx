"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Props = {
  placeId: string;                 // ★ refs ではなく placeId
  placeName?: string | null;
  per?: number;                    // 取得枚数（最大10）
  maxThumbs?: number;              // サムネ表示枚数（UI用）
};

type ApiResp = {
  refs: string[];
  attributionsHtml: string;
  source?: "cache" | "google";
  error?: string;
};

const mem = new Map<string, { refs: string[]; attributionsHtml: string; ts: number }>();
const MEM_TTL_MS = 10 * 60 * 1000; // 10分

export default function PlacePhotoGallery({
  placeId,
  placeName,
  per = 8,
  maxThumbs = 8,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [inView, setInView] = useState(false);
  const [refs, setRefs] = useState<string[]>([]);
  const [attributionsHtml, setAttributionsHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // IntersectionObserver：画面に入ったらだけ refs を取りに行く
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  async function ensureLoaded() {
    if (!placeId) return;
    if (loading) return;
    if (loadedOnce && refs.length > 0) return;

    // memory cache
    const k = `${placeId}__${per}`;
    const m = mem.get(k);
    if (m && Date.now() - m.ts < MEM_TTL_MS) {
      setRefs(m.refs);
      setAttributionsHtml(m.attributionsHtml);
      setLoadedOnce(true);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const q = new URLSearchParams();
      q.set("place_id", placeId);
      q.set("per", String(per));

      const res = await fetch(`/api/places/photos?${q.toString()}`);
      const data: ApiResp = await res.json().catch(() => ({} as any));

      if (!res.ok) throw new Error(data?.error ?? `failed (${res.status})`);

      const newRefs = Array.isArray(data.refs) ? data.refs : [];
      setRefs(newRefs);
      setAttributionsHtml(data.attributionsHtml ?? "");
      setLoadedOnce(true);

      mem.set(k, { refs: newRefs, attributionsHtml: data.attributionsHtml ?? "", ts: Date.now() });
    } catch (e: any) {
      setErr(e?.message ?? "写真を取得できませんでした");
      setLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }

  // inView になったら取得
  useEffect(() => {
    if (!inView) return;
    ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, placeId, per]);

  const thumbUrls = useMemo(
    () => refs.map((r) => `/api/places/photo?ref=${encodeURIComponent(r)}&w=480`),
    [refs]
  );
  const fullUrls = useMemo(
    () => refs.map((r) => `/api/places/photo?ref=${encodeURIComponent(r)}&w=1600`),
    [refs]
  );

  const openAt = async (i: number) => {
    // クリック時点で未取得なら先に取る
    if (!loadedOnce || refs.length === 0) {
      await ensureLoaded();
    }
    setIdx(i);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const prev = () => setIdx((v) => (v - 1 + fullUrls.length) % fullUrls.length);
  const next = () => setIdx((v) => (v + 1) % fullUrls.length);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fullUrls.length]);

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-700 truncate">
          Googleマップからの写真
        </div>
        {loading ? (
          <div className="text-[11px] text-slate-400">読み込み中…</div>
        ) : null}
      </div>

      {err ? <div className="text-xs text-slate-400">{err}</div> : null}

      {!loading && loadedOnce && thumbUrls.length === 0 && !err ? (
        <div className="text-xs text-slate-400">写真を取得できませんでした</div>
      ) : null}

      {thumbUrls.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {thumbUrls.slice(0, maxThumbs).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              onClick={() => openAt(i)}
              className="h-44 w-full cursor-pointer object-cover rounded-lg bg-slate-100 hover:opacity-95"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      {/* attribution（返ってきた場合は表示推奨/必要になり得る） */}
      {attributionsHtml ? (
        <div
          className="text-[10px] leading-snug text-slate-500 [&_a]:underline [&_a]:text-slate-600"
          dangerouslySetInnerHTML={{ __html: attributionsHtml }}
        />
      ) : null}

      {/* モーダル */}
      {open && fullUrls.length > 0 ? (
        <div className="fixed inset-0 z-[100]">
          {/* backdrop */}
          <button className="absolute inset-0 bg-black/70" onClick={close} aria-label="close" />

          {/* content */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-xl">
              {/* header */}
              <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-3">
                <div className="text-xs text-white/80">
                  {placeName ? placeName : "Place photos"}{" "}
                  <span className="text-white/50">
                    {idx + 1}/{fullUrls.length}
                  </span>
                </div>
                <button
                  onClick={close}
                  className="rounded-full bg-white/10 p-2 text-white hover:bg-white/15"
                  aria-label="close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* image */}
              <div className="flex items-center justify-center bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fullUrls[idx]} alt="" className="max-h-[82vh] w-full object-contain" />
              </div>

              {/* controls */}
              {fullUrls.length > 1 ? (
                <>
                  <button
                    onClick={prev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/15"
                    aria-label="prev"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    onClick={next}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/15"
                    aria-label="next"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              ) : null}

              {/* attribution */}
              {attributionsHtml ? (
                <div
                  className="p-3 text-[10px] leading-snug text-white/70 [&_a]:underline [&_a]:text-white"
                  dangerouslySetInnerHTML={{ __html: attributionsHtml }}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
