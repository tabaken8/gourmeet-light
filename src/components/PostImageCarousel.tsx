// src/components/PostImageCarousel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

type Props = {
  postId: string;
  imageUrls: string[];
  initialIndex?: number;
  syncUrl?: boolean; // 既定: 投稿詳細ページなら同期
  eager?: boolean; // 詳細などで eager にしたい時
  preloadNeighbors?: boolean; // 近傍プリロード（timelineで true 推奨）
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

  const total = imageUrls.length;

  const clamp = useMemo(() => {
    return (n: number) => Math.max(0, Math.min(n, Math.max(0, total - 1)));
  }, [total]);

  const [index, setIndex] = useState(() => clamp(initialIndex));

  // ✅ “押した瞬間に反応”させるための pending
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const reqIdRef = useRef(0);
  const overlayTimerRef = useRef<number | null>(null);

  const isPostDetailPage = pathname === `/posts/${postId}`;
  const shouldSyncUrl = syncUrl ?? isPostDetailPage;

  // ⚠️ eager ?? isPostDetailPage の優先順位事故防止
  const loadingMode: "eager" | "lazy" =
    (eager ?? isPostDetailPage) ? "eager" : "lazy";
  const fitCls = fit === "contain" ? "object-contain" : "object-cover";

  useEffect(() => {
    setIndex((i) => clamp(i));
    // imageUrls が変わった時に pending が範囲外ならキャンセル
    setPendingIndex((p) => (p == null ? null : clamp(p)));
  }, [clamp]);

  useEffect(() => {
    if (!preloadNeighbors) return;
    if (total <= 1) return;

    const next = index + 1;
    const prev = index - 1;
    if (next < total) preloadImage(imageUrls[next]);
    if (prev >= 0) preloadImage(imageUrls[prev]);
  }, [index, imageUrls, preloadNeighbors, total]);

  // ✅ URL同期は “確定した index” のみ（pending中は動かさない）
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

  if (total === 0) return null;

  const canPrev = total > 1 && index > 0;
  const canNext = total > 1 && index < total - 1;

  const stopNav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ✅ “押した瞬間に反応”しつつ、150ms以上遅い時だけ overlay 表示
  const goto = (target: number) => {
    const to = clamp(target);
    if (to === index) return;

    // すでに同じ pending があるなら何もしない
    if (pendingIndex === to) return;

    // 新リクエスト
    reqIdRef.current += 1;
    const reqId = reqIdRef.current;

    setLoadError(false);
    setPendingIndex(to);

    // 150ms超えたら overlay を見せる（速い時は出さない）
    if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    setShowOverlay(false);
    overlayTimerRef.current = window.setTimeout(() => {
      // このリクエストがまだ最新なら表示
      if (reqIdRef.current === reqId) setShowOverlay(true);
    }, 150);

    // 先に読み込んでから確定
    const url = imageUrls[to];
    loadImage(url)
      .catch(() => {
        // 読み込み失敗しても “固まったまま” が最悪なので、とりあえず進める
        if (reqIdRef.current === reqId) setLoadError(true);
      })
      .finally(() => {
        if (reqIdRef.current !== reqId) return; // 古いリクエストは捨てる
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
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[1px]"
      aria-hidden
    >
      <div className="rounded-xl bg-black/45 px-3 py-2 text-white shadow">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          <div className="text-xs">
            {loadError ? "読み込みに失敗（再試行OK）" : "読み込み中…"}
          </div>
        </div>
      </div>
    </div>
  );

  // ✅ square モード（タイムライン用）
  if (aspect === "square") {
    return (
      <div className="relative w-full aspect-square overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrls[index]}
          alt=""
          className={["absolute inset-0 h-full w-full", fitCls].join(" ")}
          loading={loadingMode}
          decoding="async"
          fetchPriority={loadingMode === "eager" ? "high" : "auto"}
          draggable={false}
        />

        {/* ✅ 遅い時だけ overlay（クリック即反応） */}
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
                className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
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
                className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                aria-label="Next image"
              >
                <ChevronRight size={20} />
              </button>
            )}

            <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 flex gap-1">
              {imageUrls.map((_, i) => (
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
                  <span
                    className={[
                      "block h-2 w-2 rounded-full",
                      i === index ? "bg-white" : "bg-white/50",
                    ].join(" ")}
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ✅ auto（詳細ページなど）
  return (
    <div className="relative w-full overflow-hidden bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrls[index]}
        alt=""
        className={["block w-full max-h-[600px]", fitCls].join(" ")}
        loading={loadingMode}
        decoding="async"
        fetchPriority={loadingMode === "eager" ? "high" : "auto"}
        draggable={false}
      />

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
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
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
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
              aria-label="Next image"
            >
              <ChevronRight size={20} />
            </button>
          )}

          <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 flex gap-1">
            {imageUrls.map((_, i) => (
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
                <span
                  className={[
                    "block h-2 w-2 rounded-full",
                    i === index ? "bg-white" : "bg-white/50",
                  ].join(" ")}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
