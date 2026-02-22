"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Tag, Clock, Sparkles } from "lucide-react";

type PlaceRow = {
  place_id: string;
  name: string | null;
  address?: string | null;
  primary_genre: string | null;
  area_label_ja?: string | null;
};

export type MiniPost = {
  id: string;
  place_id: string | null;
  created_at?: string | null;
  visited_on?: string | null;
  recommend_score?: number | string | null;
  image_urls?: string[] | null;
  image_variants?: any[] | null;
  places?: PlaceRow | null;
  place_name?: string | null;
  place_address?: string | null;
};

type Tab = "genre" | "recent";

function toScore(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
}

function getThumbUrl(p: MiniPost): string | null {
  const v = p?.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;
  const urls = p?.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];
  return null;
}

function placeTitle(p: MiniPost): string {
  return (p.places?.name ?? p.place_name ?? "Unknown").trim() || "Unknown";
}

function miniMeta(p: MiniPost): string {
  const area = (p.places?.area_label_ja ?? "").trim();
  const g = (p.places?.primary_genre ?? "").trim();
  const parts = [area, g].filter(Boolean);
  return parts.join(" / ");
}

export default function UserOtherPostsStrip({
  title,
  currentPostId, // 現状未使用だけど残してOK
  initialTab,
  genreLabel,
  recent,
  sameGenre,
}: {
  title: string;
  currentPostId: string;
  initialTab: Tab;
  genreLabel: string | null;
  recent: MiniPost[];
  sameGenre: MiniPost[];
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const items = useMemo(() => {
    if (tab === "genre") return sameGenre;
    return recent;
  }, [tab, sameGenre, recent]);

  const tabChip = (id: Tab, label: string, icon: React.ReactNode, disabled?: boolean) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => !disabled && setTab(id)}
        disabled={!!disabled}
        className={[
          // ✅ 折り返し禁止 & 縮まない
          "shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
          disabled
            ? "border-slate-200 bg-white text-slate-300"
            : active
              ? "border-orange-200 bg-orange-50 text-orange-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        ].join(" ")}
      >
        {/* アイコンも縮まない */}
        <span className="shrink-0">{icon}</span>
        <span className="whitespace-nowrap">{label}</span>
      </button>
    );
  };

  return (
    <section className="gm-card overflow-hidden">
      <div className="border-b border-black/[.06] bg-white px-4 py-3">
        {/* ✅ 左は省略、右は死守 */}
        <div className="flex items-center gap-3">
          {/* ✅ min-w-0 + truncate で「左が伸びても右を圧迫しない」 */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold text-slate-900">{title}</div>
          </div>

          {/* ✅ 右側は縮まない。入り切らなければ横スクロール */}
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
            {tabChip("genre", "同じジャンル", <Tag size={14} />, !genreLabel)}
            {tabChip("recent", "最近", <Clock size={14} />)}
          </div>
        </div>

        {tab === "genre" && genreLabel ? (
          <div className="mt-1 truncate text-[12px] text-slate-500">ジャンル: {genreLabel}</div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-[12px] text-slate-500">まだ表示できる投稿がありません。</div>
      ) : (
        <div className="px-4 py-4">
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {items.map((p) => {
              const thumb = getThumbUrl(p);
              const name = placeTitle(p);
              const meta = miniMeta(p);
              const score = toScore(p.recommend_score);

              return (
                <Link
                  key={p.id}
                  href={`/posts/${encodeURIComponent(p.id)}`}
                  className="shrink-0 w-[180px] rounded-2xl border border-slate-200 bg-white hover:bg-slate-50/40"
                >
                  <div className="relative aspect-square overflow-hidden rounded-t-2xl bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : null}
                    {score != null ? (
                      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-orange-200 bg-white/95 px-2 py-1 text-[11px] font-extrabold text-orange-700">
                        <Sparkles size={12} />
                        {score.toFixed(1)}
                      </div>
                    ) : null}
                  </div>

                  <div className="px-3 py-2">
                    <div className="truncate text-[13px] font-extrabold text-slate-900">{name}</div>
                    {meta ? <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-600">{meta}</div> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}