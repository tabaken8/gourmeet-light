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

// ── Spring config ──
const SPRING_SLIDE = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };
const SPRING_SNAP = { type: "spring" as const, stiffness: 400, damping: 35, mass: 0.6 };

// ── 角度判定の閾値 ──
// タッチ初動の角度が水平から ±30° 以内のときだけ横スワイプとして認識
const ANGLE_THRESHOLD_DEG = 30;
// 角度判定に必要な最小移動距離（px）— これ以下だとまだ方向不明
const MIN_MOVE_PX = 8;

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

  const prevSlide = useCallback(() => goto(index - 1), [goto, index]);
  const nextSlide = useCallback(() => goto(index + 1), [goto, index]);

  // ==== 自前タッチハンドリング（角度判定付き） ====
  const touchRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    decided: boolean;    // 方向が決まったか
    isHorizontal: boolean; // 横ドラッグとして認識されたか
    tracking: boolean;   // タッチ中か
  } | null>(null);

  // index を最新値で参照するための ref
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);
  const wrapWRef = useRef(wrapW);
  useEffect(() => { wrapWRef.current = wrapW; }, [wrapW]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (total <= 1) return;
    const t = e.touches[0];
    touchRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      startTime: Date.now(),
      decided: false,
      isHorizontal: false,
      tracking: true,
    };
  }, [total]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const state = touchRef.current;
    if (!state || !state.tracking) return;

    const t = e.touches[0];
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // まだ方向が決まっていない
    if (!state.decided) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN_MOVE_PX) return; // まだ動き足りない

      // 角度判定: atan2 で角度を計算
      const angleDeg = Math.atan2(absDy, absDx) * (180 / Math.PI);
      state.decided = true;

      if (angleDeg <= ANGLE_THRESHOLD_DEG) {
        // 横方向 → カルーセルスワイプとして奪う
        state.isHorizontal = true;
      } else {
        // 縦方向 → スクロールに任せる。タッチ追跡を止める
        state.isHorizontal = false;
        state.tracking = false;
        return;
      }
    }

    if (!state.isHorizontal) return;

    // 横スワイプ中: ブラウザのスクロールを抑止 & x を追従
    e.preventDefault();
    const baseX = -indexRef.current * wrapWRef.current;
    // ゴムバンド効果: 端で引っ張ると抵抗感
    const i = indexRef.current;
    const maxI = total - 1;
    let offset = dx;
    if ((i === 0 && dx > 0) || (i === maxI && dx < 0)) {
      offset = dx * 0.2; // 端は 20% だけ動く
    }
    x.set(baseX + offset);
  }, [total, x]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const state = touchRef.current;
    touchRef.current = null;
    if (!state || !state.isHorizontal) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - state.startX;
    const elapsed = Date.now() - state.startTime;
    const vx = dx / Math.max(elapsed, 1) * 1000; // px/s

    const w = wrapWRef.current;
    const th = w * 0.15;
    const i = indexRef.current;
    const canNext = i < total - 1;
    const canPrev = i > 0;

    if ((dx < -th || vx < -250) && canNext) {
      goto(i + 1);
    } else if ((dx > th || vx > 250) && canPrev) {
      goto(i - 1);
    } else {
      // スナップバック
      animate(x, -i * w, SPRING_SNAP);
    }
  }, [total, goto, x]);

  if (total === 0) return null;

  const canPrev = total > 1 && index > 0;
  const canNext = total > 1 && index < total - 1;

  const stopNav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 前後2枚レンダー
  const renderWindow = 2;

  const inner = (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      // touch-action: pan-y をデフォルトにしつつ、
      // 横スワイプ検知後に e.preventDefault() で制御
      style={{ touchAction: "pan-y" }}
    >
      <motion.div
        className="absolute inset-0 flex"
        style={{ x }}
      >
        {urls.map((u, i) => {
          const isNearby = Math.abs(i - index) <= renderWindow;
          const isActive = i === index;

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
                prevSlide();
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
                nextSlide();
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
