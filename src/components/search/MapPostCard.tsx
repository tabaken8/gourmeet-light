// src/components/search/MapPostCard.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { Utensils, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { PostRow } from "./SearchPostList";

function getSquareImageUrl(p: PostRow): string | null {
  if (p.cover_square_url) return p.cover_square_url;
  if (p.image_assets?.[0]?.square) return p.image_assets[0].square;
  if (p.image_variants?.[0]?.thumb) return p.image_variants[0].thumb;
  return null;
}

function formatPrice(p: PostRow): string | null {
  if (typeof p.price_yen === "number" && Number.isFinite(p.price_yen)) {
    return `\u00A5${new Intl.NumberFormat("ja-JP").format(Math.max(0, Math.floor(p.price_yen)))}`;
  }
  if (p.price_range) {
    const m: Record<string, string> = {
      "~999": "\u301C\u00A5999",
      "1000-1999": "\u00A51,000\u301C\u00A51,999",
      "2000-2999": "\u00A52,000\u301C\u00A52,999",
      "3000-3999": "\u00A53,000\u301C\u00A53,999",
      "4000-4999": "\u00A54,000\u301C\u00A54,999",
      "5000-6999": "\u00A55,000\u301C\u00A56,999",
      "7000-9999": "\u00A57,000\u301C\u00A59,999",
      "10000+": "\u00A510,000\u301C",
    };
    return m[p.price_range] ?? p.price_range;
  }
  return null;
}

/** Single compact card (used inside carousel) */
function CardItem({
  post,
  rank,
  active,
}: {
  post: PostRow;
  rank?: number;
  active?: boolean;
}) {
  const img = getSquareImageUrl(post);
  const prof = post.profile;
  const name = prof?.display_name ?? "\u30E6\u30FC\u30B6\u30FC";
  const avatar = prof?.avatar_url ?? null;
  const initial = (name || "U").slice(0, 1).toUpperCase();
  const score = typeof post.recommend_score === "number" ? post.recommend_score : null;
  const price = formatPrice(post);
  const genre = post.place_genre ?? null;
  const nearestStation = post.nearest_station_name ?? null;
  const nearestMin = typeof post.nearest_station_distance_m === "number"
    ? Math.max(1, Math.ceil(post.nearest_station_distance_m / 80))
    : null;

  return (
    <a
      href={`/posts/${post.id}`}
      className={`block rounded-xl bg-white shadow-md border overflow-hidden no-underline shrink-0 transition-all duration-200 ${
        active ? "border-orange-300 ring-2 ring-orange-100" : "border-slate-100"
      }`}
      style={{ color: "inherit", textDecoration: "none", width: 280 }}
    >
      <div className="flex gap-0">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt=""
            className="w-[88px] h-[88px] object-cover shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-[88px] h-[88px] bg-slate-100 shrink-0 flex items-center justify-center">
            <Utensils size={20} className="text-slate-300" />
          </div>
        )}

        <div className="flex-1 min-w-0 p-2.5 flex flex-col justify-between relative">
          {rank != null && (
            <div className="absolute -top-0.5 -left-0.5 bg-orange-500 text-white text-[9px] font-bold rounded-br-lg rounded-tl-lg px-1.5 py-0.5">
              {rank}位
            </div>
          )}
          <div>
            <div className="font-bold text-[13px] text-slate-900 leading-tight truncate">
              {post.place_name ?? "\u304A\u5E97"}
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500 truncate">
              {genre && <span>{genre}</span>}
              {genre && nearestStation && <span className="text-slate-300">{"\u00B7"}</span>}
              {nearestStation && nearestMin && (
                <span>{nearestStation} {"\u5F92\u6B69"}{nearestMin}{"\u5206"}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              {score !== null && (
                <span
                  className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-bold"
                  style={{
                    background: score >= 8 ? "#fff7ed" : "#f8fafc",
                    color: score >= 8 ? "#ea580c" : "#64748b",
                  }}
                >
                  {score}{" / 10"}
                </span>
              )}
              {price && <span className="text-[11px] text-slate-500">{price}</span>}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-slate-400 truncate max-w-[50px]">{name}</span>
              <div className="h-5 w-5 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center text-[8px] font-semibold text-orange-700 shrink-0">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-5 w-5 object-cover" loading="lazy" />
                ) : (
                  initial
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}

/** Horizontal carousel of post cards with auto-select #1 */
export default function MapPostCardCarousel({
  posts,
  selectedPostId,
  onSelect,
  onClose,
}: {
  posts: PostRow[];
  selectedPostId: string | null;
  onSelect: (post: PostRow) => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-select first post on mount if nothing is selected
  useEffect(() => {
    if (posts.length > 0 && !selectedPostId) {
      onSelect(posts[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  // Scroll to selected card when selection changes
  useEffect(() => {
    if (!scrollRef.current || !selectedPostId) return;
    const idx = posts.findIndex((p) => p.id === selectedPostId);
    if (idx < 0) return;
    const el = scrollRef.current;
    const cardWidth = 288; // 280px card + 8px gap
    const targetScroll = idx * cardWidth - (el.clientWidth - 280) / 2;
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      el.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
    });
  }, [selectedPostId, posts]);

  const scrollBy = (dir: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 288, behavior: "smooth" });
  };

  if (posts.length === 0) return null;

  return (
    <div className="relative mx-1 mb-2 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Close button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
        className="absolute -top-1 right-1 z-10 w-5 h-5 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-slate-400 hover:text-slate-600 shadow-sm border border-slate-100"
        aria-label="close"
      >
        <X size={10} />
      </button>

      {/* Left arrow */}
      {posts.length > 1 && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-slate-500 shadow border border-slate-100 hover:bg-white"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Right arrow */}
      {posts.length > 1 && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-slate-500 shadow border border-slate-100 hover:bg-white"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* Scrollable card strip */}
      <style>{`.map-card-strip::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={scrollRef}
        className="map-card-strip flex gap-2 overflow-x-auto px-2 py-1"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        {posts.map((post, i) => (
          <div
            key={post.id}
            style={{ scrollSnapAlign: "center" }}
            onClick={(e) => {
              // Don't prevent navigation, but also select the card on click
              onSelect(post);
            }}
          >
            <CardItem
              post={post}
              rank={i + 1}
              active={selectedPostId === post.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
