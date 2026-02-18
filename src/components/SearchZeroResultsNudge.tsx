// src/components/SearchZeroResultsNudge.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, TrainFront, Sparkles, User2 } from "lucide-react";

type Suggestion = {
  kind: "nearby" | "hub";
  station_place_id: string;
  station_name: string | null;
  reason: string;
  approx_shared_places?: number | null;

  sample_friend?: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;

  sample_post?: {
    id: string;
    recommend_score: number | null;
    place_name?: string | null;

    cover_square_url?: string | null;
    cover_full_url?: string | null;
    cover_pin_url?: string | null;
    image_variants?: any[] | null;
    image_urls?: string[] | null;
  } | null;
};

type Nudge = {
  type: "zero_results_suggestions";
  origin?: { station_name?: string | null } | null;
  suggestions: Suggestion[];
  note?: string | null;
};

function getThumbUrl(p: any): string | null {
  if (!p) return null;

  if (typeof p.cover_square_url === "string" && p.cover_square_url) return p.cover_square_url;

  const v = p.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string" && v[0].thumb) return v[0].thumb;

  const urls = p.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string" && urls[0]) return urls[0];

  if (typeof p.cover_full_url === "string" && p.cover_full_url) return p.cover_full_url;
  if (typeof p.cover_pin_url === "string" && p.cover_pin_url) return p.cover_pin_url;

  return null;
}

function fmtScore(x: any): string | null {
  if (typeof x === "number" && Number.isFinite(x)) return x.toFixed(1);
  return null;
}

/**
 * 「ボタンに駅名を入れると長すぎて崩れる」問題を避けるため、
 * ボタンは短い固定ラベルにして、駅名は文面側で表現する。
 */
function SearchButtonLabel() {
  return (
    <>
      <TrainFront size={14} className="opacity-75" />
      駅で探す
    </>
  );
}

function SuggestionCard({
  s,
  onSearchStation,
}: {
  s: Suggestion;
  onSearchStation: (stationPlaceId: string, stationName: string | null) => void;
}) {
  const post = s.sample_post ?? null;
  const friend = s.sample_friend ?? null;

  const thumb = useMemo(() => getThumbUrl(post), [post]);
  const scoreText = useMemo(() => fmtScore(post?.recommend_score), [post?.recommend_score]);

  const stationName = (s.station_name ?? "").trim() || "近くの駅";
  const placeName = (post?.place_name ?? "").trim() || "おすすめのお店";
  const friendName = (friend?.display_name ?? "").trim() || "フォロー中ユーザー";

  if (!post?.id) return null;

  return (
    <div className="w-[320px] shrink-0 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
      {/* header */}
      <div className="border-b border-black/5 bg-gradient-to-b from-orange-50/60 to-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* 文章で“推薦”する */}
            <div className="text-sm font-extrabold text-slate-900">
              <span className="truncate align-middle">{stationName}</span>
              <span className="ml-1 align-middle">なら見つかるかも</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11px] font-semibold text-slate-600">{s.reason}</div>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="px-4 py-4">
        <div className="flex gap-3">
          {/* thumb */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-black/10 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumb ? (
              <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="grid h-full w-full place-items-center text-[11px] font-semibold text-slate-400">No image</div>
            )}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-black/5" />
          </div>

          {/* text */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold text-slate-900">{placeName}</div>

            {/* “yyy駅なら、xxxさんはこのお店を高く評価しています” の形 */}
            <div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-slate-700">
              <span className="inline-flex items-center gap-1 text-slate-700">
                <User2 size={14} className="opacity-70" />
                <span className="truncate">{friendName}</span>
              </span>

              {scoreText ? (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-extrabold text-orange-800">
                  おすすめ {scoreText}
                </span>
              ) : null}
            </div>

            <div className="mt-1 text-[11px] font-semibold text-slate-500">
              <span className="font-extrabold text-slate-700">{stationName}</span>
              <span> 周辺で見つかりやすい投稿です</span>
            </div>
          </div>
        </div>

        {/* actions: 2カラム固定で崩れを止める */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href={`/posts/${encodeURIComponent(String(post.id))}`}
            className={[
              "gm-press inline-flex min-w-0 items-center justify-center gap-2",
              "rounded-full border border-slate-200 bg-white px-3 py-2",
              "text-xs font-extrabold text-slate-800 hover:bg-slate-50",
              "whitespace-nowrap",
            ].join(" ")}
            title="投稿を見る"
          >
            <span className="truncate">投稿を見る</span>
            <ArrowRight size={14} className="opacity-70 shrink-0" />
          </Link>

          <button
            type="button"
            onClick={() => onSearchStation(String(s.station_place_id), s.station_name ?? null)}
            className={[
              "gm-press inline-flex min-w-0 items-center justify-center gap-2",
              "rounded-full border border-orange-200 bg-orange-50 px-3 py-2",
              "text-xs font-extrabold text-orange-800 hover:bg-orange-100/60",
              "whitespace-nowrap",
            ].join(" ")}
            title={`${stationName}で探す`}
          >
            <span className="truncate inline-flex items-center gap-2">
              <SearchButtonLabel />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SearchZeroResultsNudge({
  nudge,
  onSearchStation,
  className,
}: {
  nudge: Nudge | null;
  onSearchStation: (stationPlaceId: string, stationName: string | null) => void;
  className?: string;
}) {
  if (!nudge || nudge.type !== "zero_results_suggestions") return null;

  const suggestions = Array.isArray(nudge.suggestions) ? nudge.suggestions : [];
  const usable = suggestions.filter((s) => s?.station_place_id && s?.sample_post?.id);
  if (usable.length === 0) return null;

  return (
    <div className={["gm-card overflow-hidden border border-black/10 bg-white", className ?? ""].join(" ")}>
      {/* header */}
      <div className="border-b border-black/5 bg-gradient-to-b from-orange-50/60 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-orange-100 text-orange-700">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-slate-900">検索結果が0件でした</div>
            <div className="mt-0.5 text-[12px] font-semibold text-slate-600">
              近い駅・主要駅から、候補をいくつか出しました
            </div>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="px-4 py-4">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {usable.map((s, i) => (
            <SuggestionCard key={`${s.station_place_id}-${i}`} s={s} onSearchStation={onSearchStation} />
          ))}
        </div>

        <div className="mt-2 text-[11px] font-semibold text-slate-500">
          ※ {nudge.note ?? "フォロー中ユーザーの投稿のみから提案しています"}
        </div>
      </div>
    </div>
  );
}
