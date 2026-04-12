"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  reveal?: boolean;
  revealDurationMs?: number;
  revealDelayMs?: number;
  revealOncePerImage?: boolean;
  revealOnlyWhenActive?: boolean;
  revealStyle?: "wipe" | "clip";
};

function preloadImage(url: string) {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
}

function normalizeUrls(urls: string[]): string[] {
  const cleaned = (urls ?? []).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  return Array.from(new Set(cleaned));
}

// ── Shimmer placeholder ──
function ShimmerPlaceholder() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-100 dark:bg-[#1e2026]">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/40 dark:via-white/[.06] to-transparent" />
    </div>
  );
}

// ── Image with fade-in on load ──
function FadeImage({
  src,
  alt,
  fitCls,
  loading,
  fetchPriority,
}: {
  src: string;
  alt: string;
  fitCls: string;
  loading: "eager" | "lazy";
  fetchPriority: "high" | "auto";
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // 既にキャッシュ済みなら即表示
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <>
      {!loaded && <ShimmerPlaceholder />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={[
          "absolute inset-0 h-full w-full",
          fitCls,
          "transition-opacity duration-300 ease-out",
          loaded ? "opacity-100" : "opacity-0",
        ].join(" ")}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        draggable={false}
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}

// ── Spring config for slide animations ──
// Instagram/TikTok 風: ほどよくバネ感があり、素早く収束
const SPRING_SLIDE = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };
// スナップバック（元の位置に戻る）はもう少し速い
const SPRING_SNAP = { type: "spring" as const, stiffness: 400, damping: 35, mass: 0.6 };

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

  const revealedRef = useRef<Record<number, boolean>>({});
  const [revealTick, setRevealTick] = useState(0);

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

  // index変更時の整合
  useEffect(() => {
    setIndex((prev) => clamp(prev));
  }, [clamp, total]);

  // 近傍プリロード — 前後2枚
  useEffect(() => {
    if (!preloadNeighbors) return;
    if (total <= 1) return;

    for (let delta = 1; delta <= 2; delta++) {
      const ni = index + delta;
      const pi = index - delta;
      if (ni < total) preloadImage(urls[ni]);
      if (pi >= 0) preloadImage(urls[pi]);
    }
  }, [index, urls, preloadNeighbors, total]);

  // URL同期
  useEffect(() => {
    if (!shouldSyncUrl) return;
    if (total <= 0) return;
    const url = `/posts/${postId}?img_index=${index + 1}`;
    router.replace(url, { scroll: false });
  }, [index, postId, router, shouldSyncUrl, total]);

  // index が変わったらスプリングアニメーションで合わせる
  useEffect(() => {
    const target = -index * wrapW;
    animate(x, target, SPRING_SLIDE);
  }, [index, wrapW, x]);

  // reveal 制御
  useEffect(() => {
    if (!reveal) return;
    if (revealOnlyWhenActive) {
      if (revealOncePerImage && revealedRef.current[index]) return;
      setRevealTick((t) => t + 1);
    } else {
      setRevealTick((t) => t + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, index, revealOnlyWhenActive]);

  // 楽観的にindex即切替
  const goto = useCallback(
    (target: number) => {
      const to = clamp(target);
      if (to === index) return;
      setIndex(to);
      if (reveal) setRevealTick((t) => t + 1);
    },
    [clamp, index, reveal],
  );

  const prev = useCallback(() => goto(index - 1), [goto, index]);
  const next = useCallback(() => goto(index + 1), [goto, index]);

  if (total === 0) return null;

  const canPrev = total > 1 && index > 0;
  const canNext = total > 1 && index < total - 1;

  const stopNav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ==== swipe end判定 ====
  const onDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (total <= 1) return;

    const dx = info.offset.x;
    const vx = info.velocity.x;
    // 閾値: 15%の移動 or 速度250px/s以上（少し軽くして反応良くする）
    const th = wrapW * 0.15;

    if ((dx < -th || vx < -250) && canNext) {
      goto(index + 1);
    } else if ((dx > th || vx > 250) && canPrev) {
      goto(index - 1);
    } else {
      // スナップバック — キビキビ戻る
      animate(x, -index * wrapW, SPRING_SNAP);
    }
  };

  // 前後2枚レンダー（スムーズなスワイプのため）
  const renderWindow = 2;

  const inner = (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <motion.div
        className="absolute inset-0 flex"
        style={{ x, touchAction: "pan-y" }}
        drag={total > 1 ? "x" : false}
        dragConstraints={{ left: -wrapW * (total - 1), right: 0 }}
        dragElastic={0.12}
        onDragEnd={onDragEnd}
        dragMomentum={false}
      >
        {urls.map((u, i) => {
          const isNearby = Math.abs(i - index) <= renderWindow;
          const isActive = i === index;

          // reveal判定
          const shouldRevealThis =
            reveal &&
            isActive &&
            (!revealOncePerImage || !revealedRef.current[i]);

          if (shouldRevealThis && revealOncePerImage) {
            revealedRef.current[i] = true;
          }

          return (
            <div key={`${postId}-${i}`} className="relative h-full w-full shrink-0 bg-slate-100 dark:bg-[#1e2026]">
              {isNearby ? (
                <>
                  <FadeImage
                    src={u}
                    alt=""
                    fitCls={fitCls}
                    loading={isActive ? loadingMode : "lazy"}
                    fetchPriority={isActive && loadingMode === "eager" ? "high" : "auto"}
                  />

                  {shouldRevealThis && revealStyle === "wipe" ? (
                    <>
                      <motion.div
                        key={`wipe-${i}-${revealTick}`}
                        className="absolute inset-0 z-[2] pointer-events-none bg-white"
                        initial={{ x: "0%" }}
                        animate={{ x: "110%" }}
                        transition={{
                          duration: Math.max(0.2, revealDurationMs / 1000),
                          delay: Math.max(0, revealDelayMs / 1000),
                          ease: [0.2, 0.9, 0.2, 1],
                        }}
                      />
                      <motion.div
                        key={`shadow-${i}-${revealTick}`}
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
                      key={`clip-${i}-${revealTick}`}
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
                </>
              ) : (
                <ShimmerPlaceholder />
              )}
            </div>
          );
        })}
      </motion.div>

      {total > 1 && (
        <>
          {canPrev && (
            <button
              type="button"
              onClick={(e) => {
                stopNav(e);
                prev();
              }}
              className="absolute left-0 top-1/2 z-20 -translate-y-1/2 flex items-center justify-center w-10 h-16 text-white/70 hover:text-white transition"
              aria-label="Previous image"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
          )}

          {canNext && (
            <button
              type="button"
              onClick={(e) => {
                stopNav(e);
                next();
              }}
              className="absolute right-0 top-1/2 z-20 -translate-y-1/2 flex items-center justify-center w-10 h-16 text-white/70 hover:text-white transition"
              aria-label="Next image"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
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
                className="p-0.5"
                aria-label={`Go to image ${i + 1}`}
              >
                <span className={["block h-2 w-2 rounded-full transition-colors duration-200", i === index ? "bg-white" : "bg-white/50"].join(" ")} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (aspect === "square") {
    return <div className="relative w-full aspect-square bg-slate-100 dark:bg-[#1e2026]">{inner}</div>;
  }

  return <div className="relative w-full bg-slate-100 dark:bg-[#1e2026] max-h-[600px]">{inner}</div>;
}
