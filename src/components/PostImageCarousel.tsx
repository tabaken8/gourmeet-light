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

  /**
   * ✅ LPっぽい “演出としての” reveal
   * - 画像の読み込みとは独立して、見せ方として端からwipeで出す
   */
  reveal?: boolean; // /searchなどで true にする
  revealDurationMs?: number; // 例: 900〜1600
  revealDelayMs?: number; // 例: 0〜300
  revealOncePerImage?: boolean; // trueなら同じ画像に2回目以降は演出しない
  revealOnlyWhenActive?: boolean; // trueなら「現在表示中のindex」だけ演出
  revealStyle?: "wipe" | "clip"; // wipe=幕スライド / clip=clip-path
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
 * ✅ 同一画像が複数ルートから混入しても壊れないように
 * - null/空を除去
 * - 文字列でユニーク化（署名URLのqueryは落とさない）
 */
function normalizeUrls(urls: string[]): string[] {
  const cleaned = (urls ?? []).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  return Array.from(new Set(cleaned));
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

  reveal = false,
  revealDurationMs = 1200,
  revealDelayMs = 120,
  revealOncePerImage = true,
  revealOnlyWhenActive = true,
  revealStyle = "wipe",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const urls = useMemo(() => normalizeUrls(imageUrls), [imageUrls]);
  const total = urls.length;

  const clamp = useMemo(() => {
    return (n: number) => Math.max(0, Math.min(n, Math.max(0, total - 1)));
  }, [total]);

  const [index, setIndex] = useState(() => clamp(initialIndex));
  const [viewIndex, setViewIndex] = useState(() => clamp(initialIndex));

  // “押した瞬間に反応”させるための pending
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const reqIdRef = useRef(0);
  const overlayTimerRef = useRef<number | null>(null);

  // ✅ reveal済み管理（画像ごとに一回だけ、など）
  const revealedRef = useRef<Record<number, boolean>>({});
  const [revealTick, setRevealTick] = useState(0); // 強制再描画トリガ（reveal開始を確実に反映）

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

  // ✅ viewIndex が変わったら x をスッと合わせる
  useEffect(() => {
    const target = -viewIndex * wrapW;
    animate(x, target, { type: "tween", duration: 0.22, ease: [0.2, 0.9, 0.2, 1] });
  }, [viewIndex, wrapW, x]);

  // ✅ 現在表示中画像の reveal 状態を更新（activeになった瞬間に「未revealなら演出」）
  useEffect(() => {
    if (!reveal) return;
    const active = pendingIndex != null ? pendingIndex : index;
    if (revealOnlyWhenActive) {
      if (revealOncePerImage && revealedRef.current[active]) return;
      // “activeになった”ことを契機に、revealを開始させるためtickを動かす
      setRevealTick((t) => t + 1);
    } else {
      // 全画像に演出したいなら、ここでまとめてtick
      setRevealTick((t) => t + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, index, pendingIndex, revealOnlyWhenActive]);

  if (total === 0) return null;

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

    // ✅ 見た目はすぐ動かす
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

        // ✅ ページングでも「activeになった」扱いで演出開始できるようtick
        if (reveal) setRevealTick((t) => t + 1);
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
      setViewIndex(index);
    }
  };

  const dotsActive = pendingIndex != null ? pendingIndex : index;

  // ✅ reveal用：active index を決める
  const activeIndex = dotsActive;

  // =========
  // 描画
  // =========
  const inner = (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <motion.div
        className="absolute inset-0 flex"
        style={{ x, touchAction: "pan-y" }}
        drag={total > 1 ? "x" : false}
        dragConstraints={{ left: -wrapW * (total - 1), right: 0 }}
        dragElastic={0.08}
        onDragEnd={onDragEnd}
      >
        {urls.map((u, i) => {
          const isActive = i === activeIndex;

          // ✅ この画像はreveal対象？
          const shouldRevealThis =
            reveal &&
            (!revealOnlyWhenActive || isActive) &&
            (!revealOncePerImage || !revealedRef.current[i]);

          // reveal開始時に「この画像は見せた」扱いにする（onceの場合）
          // ※ revealTick を depsに含めて、activeになった瞬間に発火
          // eslint-disable-next-line react-hooks/rules-of-hooks
          useEffect(() => {
            if (!shouldRevealThis) return;
            // activeになった「直後」に一度だけマーク（演出自体はmotionが走る）
            revealedRef.current[i] = true;
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [revealTick]);

          return (
            <div key={`${postId}-${i}`} className="relative h-full w-full shrink-0 bg-slate-100">
              {/* ======= 画像本体 ======= */}
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

              {/* ======= LPっぽい演出（reveal） ======= */}
              {shouldRevealThis && revealStyle === "wipe" ? (
                <>
                  {/* 白い“幕”が左→右にスーッと流れて画像を見せる */}
                  <motion.div
                    className="absolute inset-0 z-[2] pointer-events-none bg-white"
                    initial={{ x: "0%" }}
                    animate={{ x: "110%" }}
                    transition={{
                      duration: Math.max(0.2, revealDurationMs / 1000),
                      delay: Math.max(0, revealDelayMs / 1000),
                      ease: [0.2, 0.9, 0.2, 1],
                    }}
                  />
                  {/* うっすら影（ちょいLPっぽく） */}
                  <motion.div
                    className="absolute inset-0 z-[1] pointer-events-none"
                    initial={{ opacity: 0.0 }}
                    animate={{ opacity: 0.12 }}
                    transition={{ duration: 0.35, delay: Math.max(0, revealDelayMs / 1000) }}
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.00) 35%, rgba(0,0,0,0.00) 100%)",
                    }}
                  />
                </>
              ) : null}

              {shouldRevealThis && revealStyle === "clip" ? (
                <motion.div
                  className="absolute inset-0 z-[2] pointer-events-none"
                  initial={{ clipPath: "inset(0 100% 0 0)" }}
                  animate={{ clipPath: "inset(0 0% 0 0)" }}
                  transition={{
                    duration: Math.max(0.2, revealDurationMs / 1000),
                    delay: Math.max(0, revealDelayMs / 1000),
                    ease: [0.2, 0.9, 0.2, 1],
                  }}
                />
              ) : null}
            </div>
          );
        })}
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
