"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Props = {
  refs: string[];
  placeName?: string | null;
  attributionsHtml?: string; // Googleの要件により表示推奨（必須になり得る）
};

export default function PlacePhotoGallery({ refs, placeName, attributionsHtml }: Props) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const urls = useMemo(
    () => refs.map((ref) => `/api/places/photo?ref=${encodeURIComponent(ref)}&w=1400`),
    [refs]
  );

  const openAt = (i: number) => {
    setIdx(i);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const prev = () => setIdx((v) => (v - 1 + urls.length) % urls.length);
  const next = () => setIdx((v) => (v + 1) % urls.length);

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
  }, [open, urls.length]);

  if (!refs?.length) return null;

  return (
    <>
      {/* サムネ：大きめのグリッド */}
      <div className="space-y-2">
        {placeName ? (
          <div className="text-xs font-medium text-slate-700 truncate">
            {placeName} の写真
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {urls.slice(0, 8).map((src, i) => (
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

        {/* attribution（Googleの要件で必要なことがあるので表示枠を用意） */}
        {/* {attributionsHtml ? (
          <div
            className="text-[10px] leading-snug text-slate-500 [&_a]:underline [&_a]:text-slate-600"
            dangerouslySetInnerHTML={{ __html: attributionsHtml }}
          />
        ) : null} */}
      </div>

      {/* モーダル */}
      {open ? (
        <div className="fixed inset-0 z-[100]">
          {/* backdrop */}
          <button
            className="absolute inset-0 bg-black/70"
            onClick={close}
            aria-label="close"
          />

          {/* content */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-xl">
              {/* header */}
              <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-3">
                <div className="text-xs text-white/80">
                  {placeName ? placeName : "Place photos"}{" "}
                  <span className="text-white/50">
                    {idx + 1}/{urls.length}
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
                <img
                  src={urls[idx]}
                  alt=""
                  className="max-h-[82vh] w-full object-contain"
                />
              </div>

              {/* controls */}
              {urls.length > 1 ? (
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
              {/* {attributionsHtml ? (
                <div
                  className="p-3 text-[10px] leading-snug text-white/70 [&_a]:underline [&_a]:text-white"
                  dangerouslySetInnerHTML={{ __html: attributionsHtml }}
                />
              ) : null} */}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
