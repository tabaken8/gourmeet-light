"use client";

import { useEffect, useState } from "react";
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
  const total = imageUrls.length;
  if (total === 0) return null;

  const clamp = (n: number) => Math.max(0, Math.min(n, total - 1));
  const [index, setIndex] = useState(() => clamp(initialIndex));

  const router = useRouter();
  const pathname = usePathname();

  // デフォルトは「投稿詳細ページのときだけ URL 同期」
  // ※タイムラインで誤爆しない
  const isPostDetailPage = pathname === `/posts/${postId}`;
  const shouldSyncUrl = syncUrl ?? isPostDetailPage;

  // 画像枚数が変わって index が範囲外にならないようにする
  useEffect(() => {
    setIndex((i) => clamp(i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const canPrev = index > 0;
  const canNext = index < total - 1;

  const prev = () => setIndex((i) => (i > 0 ? i - 1 : i));
  const next = () => setIndex((i) => (i < total - 1 ? i + 1 : i));

  // 親が Link / onClick 遷移してても矢印クリックで遷移しないように止める
  const stopNav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // URL同期（投稿詳細ページのみ、もしくは明示 syncUrl=true のとき）
  useEffect(() => {
    if (!shouldSyncUrl) return;
    const url = `/posts/${postId}?img_index=${index + 1}`;
    router.replace(url, { scroll: false });
  }, [index, postId, router, shouldSyncUrl]);

  return (
    <div className="relative w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrls[index]}
        alt=""
        className="w-full max-h-[600px] object-cover"
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
