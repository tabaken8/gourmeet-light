"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useMotionValue, animate } from "framer-motion";

type Props = {
  postId: string;
  imageUrls: string[];
  initialIndex?: number;
  syncUrl?: boolean;
  eager?: boolean;
  preloadNeighbors?: boolean;
  fit?: "cover" | "contain";
  aspect?: "auto" | "square";
};

// 近傍プリロード（現状維持）
function preloadImage(url: string) {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
}

// “次の画像を先に読み込んでから” index を確定する用
function loadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!url) return resolve();
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });
}

/**
 * ✅ ここが重要：同一画像が複数ルートから混入しても壊れないように
 * - null/空を除去
 * - 文字列でユニーク化
 *
 * NOTE: signed URL が微妙に違う問題は、ここで query を落とすと強いが
 * 署名URLだと query 落とすと壊れる場合があるので、まずは “完全一致” のみ重複排除。
 */
function normalizeUrls(urls: string[]): string[] {
  const cleaned = (urls ?? []).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  const uniq = Array.from(new Set(cleaned));
  return uniq;
}

export default function PostImageCarousel({
  postId,
  imageUrls,
  initialIndex = 0,
  syncUrl,
  eager,
  preloadNeighbors = true,
  fit = "cover",
  aspect = "auto",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // ✅ まずここで “必ず” 正規化（1枚が2枚になる問題を根絶）
  const urls = useMemo(() => normalizeUrls(imageUrls), [imageUrls]);
  const total = urls.length;

  const clamp = useMemo(() => {
    return (n: number) => Math.max(0, Math.min(n, Math.max(0, total - 1)));
  }, [total]);

  const [index, setIndex] = useState(() => clamp(initialIndex));

  // ✅ スワイプ中/アニメ中に「見た目のindex」を先に動かす
  const [viewIndex, setViewIndex] = useState(() => clamp(initialIndex));

  // “押した瞬間に反応”させるための pending
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const reqIdRef = useRef(0);
  const overlayTimerRef = useRef<number | null>(null);

  const isPostDetailPage = pathname === `/posts/${postId}`;
  const shouldSyncUrl = syncUrl ?? isPostDetailPage;

  const loadingMode: "eager" | "lazy" = (eager ?? isPostDetailPage) ? "eager" : "lazy";
  const fitCls = fit === "contain" ? "object-contain" : "object-cover";

  // ==== swipe: 幅計測 & x制御 ====
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(1);
  const x = useMotionValue(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 1;
      setWrapW(w);
    });
    ro.observe(el);
    setWrapW(el.clientWidth || 1);

    return () => ro.disconnect();
  }, []);

  // index / viewIndex の整合
  useEffect(() => {
    const ci = clamp(index);
    setIndex(ci);

    const cvi = clamp(viewIndex);
    setViewIndex(cvi);

    setPendingIndex((p) => (p == null ? null : clamp(p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamp, total]);

  // 近傍プリロード
  useEffect(() => {
    if (!preloadNeighbors) return;
    if (total <= 1) return;

    const next = index + 1;
    const prev = index - 1;
    if (next < total) preloadImage(urls[next]);
    if (prev >= 0) preloadImage(urls[prev]);
  }, [index, urls, preloadNeighbors, total]);

  // URL同期は “確定した index” のみ（pending中は動かさない）
  useEffect(() => {
    if (!shouldSyncUrl) return;
    if (total <= 0) return;
    if (pendingIndex != null) return;
    const url = `/posts/${postId}?img_index=${index + 1}`;
    router.replace(url, { scroll: false });
  }, [index, postId, router, shouldSyncUrl, total, pendingIndex]);

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    };
  }, []);

  // ✅ viewIndex が変わったら x をスッと合わせる（ボタン・ドット押下も含む）
  useEffect(() => {
    // drag中は framer が直接 x を動かすので、ここは「確定後にスナップ」用途
    const target = -viewIndex * wrapW;
    animate(x, target, { type: "tween", duration: 0.22, ease: [0.2, 0.9, 0.2, 1] });
  }, [viewIndex, wrapW, x]);

  if (total === 0) return null;

  // total==1 はカルーセルUIを完全に出さない（誤検知を抑える）
  const canPrev = total > 1 && index > 0;
  const canNext = total > 1 && index < total - 1;

  const stopNav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // “押した瞬間に反応”しつつ、150ms以上遅い時だけ overlay 表示
  const goto = (target: number) => {
    const to = clamp(target);
    if (to === index && pendingIndex == null) return;
    if (pendingIndex === to) return;

    reqIdRef.current += 1;
    const reqId = reqIdRef.current;

    setLoadError(false);
    setPendingIndex(to);

    // ✅ 見た目はすぐ動かす（スワイプ感）
    setViewIndex(to);

    if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    setShowOverlay(false);
    overlayTimerRef.current = window.setTimeout(() => {
      if (reqIdRef.current === reqId) setShowOverlay(true);
    }, 150);

    const url = urls[to];
    loadImage(url)
      .catch(() => {
        if (reqIdRef.current === reqId) setLoadError(true);
      })
      .finally(() => {
        if (reqIdRef.current !== reqId) return;
        if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;

        setIndex(to);
        setPendingIndex(null);
        setShowOverlay(false);
      });
  };

  const prev = () => goto(index - 1);
  const next = () => goto(index + 1);

  const Overlay = (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[1px]" aria-hidden>
      <div className="rounded-xl bg-black/45 px-3 py-2 text-white shadow">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          <div className="text-xs">{loadError ? "読み込みに失敗（再試行OK）" : "読み込み中…"}</div>
        </div>
      </div>
    </div>
  );

  // ==== swipe end判定 ====
  const onDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (total <= 1) return;
    if (pendingIndex != null) {
      // pending中は元に戻す
      setViewIndex(index);
      return;
    }

    const dx = info.offset.x;
    const th = wrapW * 0.18;

    if (dx < -th && canNext) {
      goto(index + 1);
    } else if (dx > th && canPrev) {
      goto(index - 1);
    } else {
      // スナップバック
      setViewIndex(index);
    }
  };

  // ==== 描画 ====
  const dotsActive = pendingIndex != null ? pendingIndex : index;

  const inner = (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      {/* track */}
      <motion.div
        className="absolute inset-0 flex"
        style={{ x }}
        drag={total > 1 ? "x" : false}
        dragConstraints={{ left: -wrapW * (total - 1), right: 0 }}
        dragElastic={0.08}
        onDragEnd={onDragEnd}
        // 縦スクロールは生かす（横ドラッグだけ取る）
        // framer-motion なので touchAction を指定
        // @ts-ignore
        style={{ x, touchAction: "pan-y" }}
      >
        {urls.map((u, i) => (
          <div key={`${postId}-${i}`} className="relative h-full w-full shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt=""
              className={["absolute inset-0 h-full w-full", fitCls].join(" ")}
              loading={i === index ? loadingMode : "lazy"}
              decoding="async"
              fetchPriority={i === index && loadingMode === "eager" ? "high" : "auto"}
              draggable={false}
            />
          </div>
        ))}
      </motion.div>

      {pendingIndex != null && showOverlay && Overlay}

      {total > 1 && (
        <>
          {canPrev && (
            <button
              type="button"
              onClick={(e) => {
                stopNav(e);
                prev();
              }}
              disabled={pendingIndex != null}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 disabled:opacity-50"
              aria-label="Previous image"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {canNext && (
            <button
              type="button"
              onClick={(e) => {
                stopNav(e);
                next();
              }}
              disabled={pendingIndex != null}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 disabled:opacity-50"
              aria-label="Next image"
            >
              <ChevronRight size={20} />
            </button>
          )}

          <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 flex gap-1">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  stopNav(e);
                  goto(i);
                }}
                disabled={pendingIndex != null}
                className="p-0.5 disabled:opacity-60"
                aria-label={`Go to image ${i + 1}`}
              >
                <span className={["block h-2 w-2 rounded-full", i === dotsActive ? "bg-white" : "bg-white/50"].join(" ")} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (aspect === "square") {
    return <div className="relative w-full aspect-square bg-slate-100">{inner}</div>;
  }

  return <div className="relative w-full bg-slate-100 max-h-[600px]">{inner}</div>;
}
