"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

type Props = {
  postId: string;
  imageUrls: string[];
  initialIndex?: number;
  syncUrl?: boolean; // 明示指定もできる（既定は「投稿詳細ページなら同期」）
};

export default function PostImageCarousel({
  postId,
  imageUrls,
  initialIndex = 0,
  syncUrl,
}: Props) {
  // ✅ Hooks は early return より前に必ず呼ぶ
  const router = useRouter();
  const pathname = usePathname();

  const total = imageUrls.length;

  const clamp = useMemo(() => {
    return (n: number) => Math.max(0, Math.min(n, Math.max(0, total - 1)));
  }, [total]);

  const [index, setIndex] = useState(() => clamp(initialIndex));

  // ✅ URL同期は「投稿詳細ページならデフォルトON」(timelineで誤爆しない)
  const isPostDetailPage = pathname === `/posts/${postId}`;
  const shouldSyncUrl = syncUrl ?? isPostDetailPage;

  // ✅ 画像枚数が変わったら index を範囲内に戻す
  useEffect(() => {
    setIndex((i) => clamp(i));
  }, [clamp]);

  const canPrev = total > 1 && index > 0;
  const canNext = total > 1 && index < total - 1;

  const prev = () => setIndex((i) => (i > 0 ? i - 1 : i));
  const next = () => setIndex((i) => (i < total - 1 ? i + 1 : i));

  // ✅ 親が Link / onClick で遷移してても、矢印・ドット押下で遷移しない
  const stopNav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ✅ URL同期（投稿詳細ページのみ、または syncUrl=true 明示時）
  useEffect(() => {
    if (!shouldSyncUrl) return;
    if (total <= 0) return;
    const url = `/posts/${postId}?img_index=${index + 1}`;
    router.replace(url, { scroll: false });
  }, [index, postId, router, shouldSyncUrl, total]);

  // ✅ early return は Hooks の後
  if (total === 0) return null;

  return (
    <div className="relative w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrls[index]}
        alt=""
        className="w-full max-h-[600px] object-cover"
        onClick={(e) => {
          // 親がLinkなら画像クリックで遷移させたいケースもあるので止めない
          // 止めたいなら下2行を有効化
          // e.preventDefault();
          // e.stopPropagation();
        }}
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
                  className={`block h-2 w-2 rounded-full ${
                    i === index ? "bg-white" : "bg-white/50"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
