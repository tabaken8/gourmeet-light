// src/components/PostImageCarousel.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

function preloadImage(url: string) {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
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

  const isPostDetailPage = pathname === `/posts/${postId}`;
  const shouldSyncUrl = syncUrl ?? isPostDetailPage;

  useEffect(() => {
    setIndex((i) => clamp(i));
  }, [clamp]);

  useEffect(() => {
    if (!preloadNeighbors) return;
    if (total <= 1) return;

    const next = index + 1;
    const prev = index - 1;
    if (next < total) preloadImage(imageUrls[next]);
    if (prev >= 0) preloadImage(imageUrls[prev]);
  }, [index, imageUrls, preloadNeighbors, total]);

  useEffect(() => {
    if (!shouldSyncUrl) return;
    if (total <= 0) return;
    const url = `/posts/${postId}?img_index=${index + 1}`;
    router.replace(url, { scroll: false });
  }, [index, postId, router, shouldSyncUrl, total]);

  if (total === 0) return null;

  const canPrev = total > 1 && index > 0;
  const canNext = total > 1 && index < total - 1;

  const prev = () => setIndex((i) => (i > 0 ? i - 1 : i));
  const next = () => setIndex((i) => (i < total - 1 ? i + 1 : i));

  const stopNav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ⚠️ eager ?? isPostDetailPage の優先順位事故防止
  const loadingMode: "eager" | "lazy" = (eager ?? isPostDetailPage) ? "eager" : "lazy";
  const fitCls = fit === "contain" ? "object-contain" : "object-cover";

  // ✅ square モード（タイムライン用）：必ず正方形枠
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

        {total > 1 && (
          <>
            {canPrev && (
              <button
                type="button"
                onClick={(e) => {
                  stopNav(e);
                  prev();
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                aria-label="Next image"
              >
                <ChevronRight size={20} />
              </button>
            )}

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {imageUrls.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    stopNav(e);
                    setIndex(i);
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

  // ✅ auto（詳細ページなど互換）
  return (
    <div className="relative w-full overflow-hidden bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrls[index]}
        alt=""
        className="block w-full max-h-[600px] object-cover"
        loading={loadingMode}
        decoding="async"
        fetchPriority={loadingMode === "eager" ? "high" : "auto"}
        draggable={false}
      />

      {total > 1 && (
        <>
          {canPrev && (
            <button
              type="button"
              onClick={(e) => {
                stopNav(e);
                prev();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
              aria-label="Next image"
            >
              <ChevronRight size={20} />
            </button>
          )}

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {imageUrls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  stopNav(e);
                  setIndex(i);
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
