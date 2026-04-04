// src/components/search/MapPostCard.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Utensils, X, ChevronLeft, ChevronRight, MapPin, Sparkles, ExternalLink } from "lucide-react";
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
      "1000-1999": "\u00A51,000\u301C",
      "2000-2999": "\u00A52,000\u301C",
      "3000-3999": "\u00A53,000\u301C",
      "4000-4999": "\u00A54,000\u301C",
      "5000-6999": "\u00A55,000\u301C",
      "7000-9999": "\u00A57,000\u301C",
      "10000+": "\u00A510,000\u301C",
    };
    return m[p.price_range] ?? p.price_range;
  }
  return null;
}

function extractPrefCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const s = address.replace(/^日本[、,\s]*/u, "").replace(/〒\s*\d{3}-?\d{4}\s*/u, "").trim();
  const match = s.match(/(東京都|北海道|大阪府|京都府|.{2,3}県)([^0-9\s,、]{1,20}?(市|区|町|村))/u);
  if (!match) return null;
  return `${match[1]}${match[2]}`;
}

/** Single enriched card */
function CardItem({
  post,
  rank,
  active,
  onTap,
}: {
  post: PostRow;
  rank?: number;
  active?: boolean;
  onTap: () => void;
}) {
  const img = getSquareImageUrl(post);
  const prof = post.profile;
  const name = prof?.display_name ?? "\u30E6\u30FC\u30B6\u30FC";
  const avatar = prof?.avatar_url ?? null;
  const initial = (name || "U").slice(0, 1).toUpperCase();
  const score = typeof post.recommend_score === "number" ? post.recommend_score : null;
  const price = formatPrice(post);
  const genre = post.place_genre ?? null;
  const area = extractPrefCity(post.place_address);
  const nearestStation = post.nearest_station_name ?? null;
  const nearestMin = typeof post.nearest_station_distance_m === "number"
    ? Math.max(1, Math.ceil(post.nearest_station_distance_m / 80))
    : null;

  const contentSnippet = (post.content ?? "").trim().split("\n")[0]?.slice(0, 50) || null;

  // Location parts
  const locParts: string[] = [];
  if (area) locParts.push(area);
  if (nearestStation && nearestMin) locParts.push(`${nearestStation} 徒歩${nearestMin}分`);
  const locLine = locParts.join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === "Enter") onTap(); }}
      className={[
        "group relative rounded-2xl overflow-hidden shrink-0 transition-all duration-200 cursor-pointer",
        "bg-white dark:bg-[#16181e] border shadow-sm",
        active
          ? "border-orange-400 dark:border-orange-500/60 ring-2 ring-orange-100 dark:ring-orange-500/20 scale-[1.02]"
          : "border-slate-200/80 dark:border-white/[.08] hover:border-slate-300 dark:hover:border-white/15",
      ].join(" ")}
      style={{ width: 260 }}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-[#1e2026]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Utensils size={24} className="text-slate-300 dark:text-gray-600" />
          </div>
        )}

        {/* Rank badge */}
        {rank != null && (
          <div className={[
            "absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold",
            rank === 1
              ? "bg-orange-500 text-white"
              : rank <= 3
              ? "bg-white/90 dark:bg-black/60 text-orange-600 dark:text-orange-400"
              : "bg-white/90 dark:bg-black/60 text-slate-500 dark:text-gray-400",
          ].join(" ")}>
            {rank}位
          </div>
        )}

        {/* Score overlay */}
        {score !== null && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-black/50 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-bold text-white">
            <Sparkles size={9} />
            {score.toFixed(1)}
          </div>
        )}

        {/* Gradient overlay at bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/30 to-transparent" />

        {/* Place name on image */}
        <div className="absolute inset-x-2 bottom-1.5 flex items-end justify-between gap-2">
          <div className="truncate text-[12px] font-bold text-white drop-shadow-sm">
            {post.place_name ?? "お店"}
          </div>
          {price && (
            <span className="shrink-0 text-[10px] font-semibold text-white/80">{price}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {/* Location + genre */}
        <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-gray-500 truncate">
          {genre && <span className="font-medium text-slate-600 dark:text-gray-400">{genre}</span>}
          {genre && locLine && <span>·</span>}
          {locLine && (
            <>
              <MapPin size={9} className="shrink-0 opacity-60" />
              <span className="truncate">{locLine}</span>
            </>
          )}
        </div>

        {/* Content snippet */}
        {contentSnippet && (
          <p className="mt-1 text-[11px] leading-snug text-slate-700 dark:text-gray-300 line-clamp-2">
            {contentSnippet}
          </p>
        )}

        {/* Footer: user + detail link */}
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="h-4 w-4 rounded-full overflow-hidden bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-[7px] font-semibold text-orange-700 dark:text-orange-400 shrink-0">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-4 w-4 object-cover" loading="lazy" />
              ) : initial}
            </div>
            <span className="truncate text-[10px] text-slate-400 dark:text-gray-500">{name}</span>
          </div>

          {/* Detail link — only show when active */}
          {active && (
            <Link
              href={`/posts/${post.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full bg-orange-600 hover:bg-orange-700 px-2.5 py-1 text-[10px] font-bold !text-white transition"
            >
              詳細 <ExternalLink size={9} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Horizontal carousel of post cards */
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
    const cardWidth = 268; // 260px card + 8px gap
    const targetScroll = idx * cardWidth - (el.clientWidth - 260) / 2;
    requestAnimationFrame(() => {
      el.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
    });
  }, [selectedPostId, posts]);

  const scrollBy = (dir: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 268, behavior: "smooth" });
  };

  if (posts.length === 0) return null;

  return (
    <div className="relative mx-1 mb-2 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Close button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
        className="absolute -top-1.5 right-1 z-10 w-5 h-5 rounded-full bg-white/90 dark:bg-[#1e2026] backdrop-blur flex items-center justify-center text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 shadow-sm border border-slate-100 dark:border-white/10"
        aria-label="close"
      >
        <X size={10} />
      </button>

      {/* Left arrow */}
      {posts.length > 1 && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 dark:bg-[#1e2026]/90 backdrop-blur flex items-center justify-center text-slate-500 dark:text-gray-400 shadow border border-slate-100 dark:border-white/10 hover:bg-white dark:hover:bg-[#1e2026]"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Right arrow */}
      {posts.length > 1 && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 dark:bg-[#1e2026]/90 backdrop-blur flex items-center justify-center text-slate-500 dark:text-gray-400 shadow border border-slate-100 dark:border-white/10 hover:bg-white dark:hover:bg-[#1e2026]"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* Scrollable card strip */}
      <style>{`.map-card-strip::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={scrollRef}
        className="map-card-strip flex gap-2 overflow-x-auto px-2 py-1.5"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        {posts.map((post, i) => (
          <div key={post.id} style={{ scrollSnapAlign: "center" }}>
            <CardItem
              post={post}
              rank={i + 1}
              active={selectedPostId === post.id}
              onTap={() => onSelect(post)}
            />
          </div>
        ))}
      </div>

      {/* Result count */}
      <div className="text-center text-[10px] text-slate-400 dark:text-gray-600 mt-0.5 pb-0.5">
        {posts.length}件
      </div>
    </div>
  );
}
