// src/components/search/MapPostCard.tsx
"use client";

import React from "react";
import { Utensils, X } from "lucide-react";
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

export default function MapPostCard({
  post,
  onClose,
}: {
  post: PostRow;
  onClose: () => void;
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
    <div className="relative mx-2 mb-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <a
        href={`/posts/${post.id}`}
        className="block rounded-xl bg-white shadow-md border border-slate-100 overflow-hidden no-underline"
        style={{ color: "inherit", textDecoration: "none" }}
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

          <div className="flex-1 min-w-0 p-2.5 flex flex-col justify-between">
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

      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
        className="absolute top-1.5 right-3.5 w-5 h-5 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-slate-400 hover:text-slate-600 shadow-sm border border-slate-100"
        aria-label="close"
      >
        <X size={10} />
      </button>
    </div>
  );
}
