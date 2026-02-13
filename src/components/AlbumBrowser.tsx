// src/components/AlbumBrowser.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search, Tag, Pin } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// ---------------------
// types
// ---------------------
type PlaceRow = {
  place_id: string;
  name: string | null;
  address?: string | null;
  primary_genre: string | null;
  area_label_ja?: string | null;
  search_text?: string | null;
};

export type AlbumPost = {
  id: string;
  place_id: string | null;
  created_at?: string | null;
  visited_on?: string | null;
  recommend_score?: number | string | null;
  image_urls?: string[] | null;
  image_variants?: any[] | null;
  places?: PlaceRow | null;
};

type View = "all" | "area" | "genre";
type SortKey = "score" | "visited" | "created";

// ---------------------
// helpers
// ---------------------
function toScore(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
}

function getThumbUrl(p: AlbumPost): string | null {
  const v = p?.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;
  const urls = p?.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];
  return null;
}

function areaLabel(place: PlaceRow | null | undefined): string {
  const ja = (place?.area_label_ja ?? "").trim();
  return ja || "不明";
}

function genreLabel(place: PlaceRow | null | undefined): string {
  const g = (place?.primary_genre ?? "").trim();
  return g || "未分類";
}

function normSpace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function stableId(p: AlbumPost) {
  const pid = p.place_id ?? p.places?.place_id ?? "no-place";
  return `${String(p.id)}::${pid}`;
}

function buildMapUrl(p: AlbumPost): string | null {
  const place = p.places;
  const placeName = place?.name ?? null;
  const placeAddress = place?.address ?? null;

  const mapUrl = p.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        placeName ?? "place"
      )}&query_place_id=${encodeURIComponent(p.place_id)}`
    : placeAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeAddress)}`
      : null;

  return mapUrl;
}

// ---------------------
// main
// ---------------------
export default function AlbumBrowser({
  posts,
  pinnedPlaceIdsInitial,
  isOwner,
}: {
  posts: AlbumPost[];
  pinnedPlaceIdsInitial: string[];
  isOwner: boolean;
}) {
  const supabase = createClientComponentClient();

  // ✅ デフォルトは「無選択 = 全体」
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("score");

  // pins
  const [pinned, setPinned] = useState<string[]>(pinnedPlaceIdsInitial ?? []);
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  // ✅ エリア/ジャンルボタンは「偶数回で全体に戻る」
  const toggleArea = () => setView((cur) => (cur === "area" ? "all" : "area"));
  const toggleGenre = () => setView((cur) => (cur === "genre" ? "all" : "genre"));

  // 検索（店名 / search_text / エリア / ジャンル / 住所）
  const filtered = useMemo(() => {
    const key = normSpace(q).toLowerCase();
    if (!key) return posts;

    return posts.filter((p) => {
      const place = p.places;
      const name = (place?.name ?? "").toLowerCase();
      const area = areaLabel(place).toLowerCase();
      const genre = genreLabel(place).toLowerCase();
      const st = (place?.search_text ?? "").toLowerCase();
      const addr = (place?.address ?? "").toLowerCase();
      return name.includes(key) || area.includes(key) || genre.includes(key) || st.includes(key) || addr.includes(key);
    });
  }, [posts, q]);

  // sort
  const sortedPosts = useMemo(() => {
    const arr = filtered.slice();
    arr.sort((a, b) => {
      const sa = toScore(a.recommend_score);
      const sb = toScore(b.recommend_score);

      if (sort === "score") {
        const d = (sb ?? -Infinity) - (sa ?? -Infinity);
        if (d !== 0) return d;
      }

      if (sort === "visited") {
        const da = a.visited_on ?? "";
        const db = b.visited_on ?? "";
        if (da !== db) return da < db ? 1 : -1;
      }

      const ca = a.created_at ?? "";
      const cb = b.created_at ?? "";
      if (ca !== cb) return ca < cb ? 1 : -1;

      return String(a.id) < String(b.id) ? 1 : -1;
    });
    return arr;
  }, [filtered, sort]);

  // ✅ all の時だけ pinned place の投稿を最上部に固定
  const postsWithPinTop = useMemo(() => {
    if (view !== "all") return sortedPosts;

    const pinnedArr: AlbumPost[] = [];
    const restArr: AlbumPost[] = [];

    for (const p of sortedPosts) {
      const pid = p.place_id ?? p.places?.place_id ?? null;
      if (pid && pinnedSet.has(pid)) pinnedArr.push(p);
      else restArr.push(p);
    }
    return [...pinnedArr, ...restArr];
  }, [sortedPosts, view, pinnedSet]);

  // pin toggle
  const togglePin = async (placeId: string) => {
    if (!isOwner) return;

    const already = pinnedSet.has(placeId);
    setPinned((prev) => (already ? prev.filter((x) => x !== placeId) : [placeId, ...prev]));

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(`auth.getUser error: ${authErr.message}`);
      const uid = authData.user?.id;
      if (!uid) throw new Error("not logged in");

      if (already) {
        const { error, status, statusText } = await supabase
          .from("place_pins")
          .delete()
          .eq("user_id", uid)
          .eq("place_id", placeId);

        if (error) {
          throw new Error(`delete failed: ${error.message} (status=${status ?? "?"} ${statusText ?? ""})`);
        }
      } else {
        const { error, status, statusText } = await supabase
          .from("place_pins")
          .upsert({ user_id: uid, place_id: placeId, sort_order: 0 }, { onConflict: "user_id,place_id" });

        if (error) {
          throw new Error(`upsert failed: ${error.message} (status=${status ?? "?"} ${statusText ?? ""})`);
        }
      }
    } catch (e: any) {
      // 巻き戻し
      setPinned((prev) => (already ? [placeId, ...prev] : prev.filter((x) => x !== placeId)));
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      console.error("togglePin error:", msg, e);
    }
  };

  // blocks
  const areaBlocks = useMemo(() => {
    const m = new Map<string, AlbumPost[]>();
    for (const p of sortedPosts) {
      const key = areaLabel(p.places);
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    const out = Array.from(m.entries()).map(([k, arr]) => ({ key: k, posts: arr }));
    out.sort((a, b) => b.posts.length - a.posts.length || a.key.localeCompare(b.key, "ja"));
    return out;
  }, [sortedPosts]);

  const genreBlocks = useMemo(() => {
    const m = new Map<string, AlbumPost[]>();
    for (const p of sortedPosts) {
      const key = genreLabel(p.places);
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    const out = Array.from(m.entries()).map(([k, arr]) => ({ key: k, posts: arr }));
    out.sort((a, b) => b.posts.length - a.posts.length || a.key.localeCompare(b.key, "ja"));
    return out;
  }, [sortedPosts]);

  // ---------------------
  // UI: Post Card
  // ---------------------
  function PostGrid({ items }: { items: AlbumPost[] }) {
    return (
      <div className="grid grid-cols-2 gap-0 md:grid-cols-3 md:gap-[2px]">
        {items.map((p) => {
          const place = p.places;
          const pid = p.place_id ?? place?.place_id ?? null;
          const pinnedHere = !!(pid && pinnedSet.has(pid));

          const name = place?.name ?? "Unknown";
          const genre = genreLabel(place);
          const score = toScore(p.recommend_score);
          const scoreText = score == null ? "おすすめ: -" : `おすすめ: ${score.toFixed(1)}`;

          const thumb = getThumbUrl(p);
          const mapUrl = buildMapUrl(p);

          return (
            <div
              key={stableId(p)}
              className="overflow-hidden border border-orange-100 bg-white shadow-sm"
              style={{ borderRadius: 0 }}
            >
              <Link href={`/posts/${encodeURIComponent(String(p.id))}`} className="block">
                <div className="relative aspect-square bg-orange-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                </div>
              </Link>

              {/* info */}
              <div className="px-3 py-2">
                <div className="truncate text-sm font-semibold text-slate-900">{name}</div>

                <div className="mt-0.5 truncate text-[12px] font-semibold text-slate-600">
                  {genre || "未分類"}
                </div>

                <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-slate-500">
                  <span className="shrink-0 font-semibold text-slate-700">{scoreText}</span>
                </div>

                {/* ✅ Google Maps button */}
                {mapUrl ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      title="Google Mapsで開く"
                    >
                      <MapPin size={12} />
                      Google Maps
                    </a>

                    {/* ✅ pin UI: 本人のみ */}
                    {isOwner && pid ? (
                      <button
                        type="button"
                        onClick={() => togglePin(pid)}
                        className={[
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          pinnedHere
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        ].join(" ")}
                        title="ピン（全体表示の最上部に固定）"
                      >
                        <Pin size={12} />
                        {pinnedHere ? "固定中" : "ピン"}
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ) : (
                  // mapsが無い時でも pin は右寄せで出す
                  isOwner && pid ? (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => togglePin(pid)}
                        className={[
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          pinnedHere
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        ].join(" ")}
                        title="ピン（全体表示の最上部に固定）"
                      >
                        <Pin size={12} />
                        {pinnedHere ? "固定中" : "ピン"}
                      </button>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // header controls
  const sortSelect = (
    <select
      value={sort}
      onChange={(e) => setSort(e.target.value as SortKey)}
      className="rounded-full border border-orange-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-orange-200"
      aria-label="並び替え"
    >
      <option value="score">おすすめ度順</option>
      <option value="created">投稿日時順</option>
    </select>
  );

  const chipBase = "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold";
  const chipActive = "border-orange-200 bg-orange-50 text-slate-900";
  const chipIdle = "border-orange-100 bg-white text-slate-600 hover:bg-orange-50/40";

  return (
    <section className="border border-orange-100 bg-white/95 px-0 py-4 shadow-sm backdrop-blur md:px-5 md:py-5">
      {/* header row */}
      <div className="px-4 md:px-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* ✅ LEFT: エリア/ジャンル */}
          <div className="flex items-center gap-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={toggleArea}
                className={[chipBase, view === "area" ? chipActive : chipIdle].join(" ")}
                aria-pressed={view === "area"}
              >
                <MapPin size={14} />
                エリア別
              </button>

              <button
                type="button"
                onClick={toggleGenre}
                className={[chipBase, view === "genre" ? chipActive : chipIdle].join(" ")}
                aria-pressed={view === "genre"}
              >
                <Tag size={14} />
                ジャンル別
              </button>
            </div>
          </div>

          {/* ✅ RIGHT: 検索 + sort */}
          <div className="flex items-center justify-between gap-2 md:justify-end">
            <div className="relative w-full md:w-80">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="店名・エリア・ジャンルで検索"
                className="w-full rounded-full border border-orange-100 bg-white px-9 pr-9 py-2 text-base md:text-sm outline-none focus:border-orange-200"
              />
            </div>

            <div className="shrink-0">{sortSelect}</div>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="mt-4 space-y-6">
        {posts.length === 0 ? (
          <div className="mx-4 md:mx-0 border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
            投稿はまだありません。
          </div>
        ) : view === "all" ? (
          <PostGrid items={postsWithPinTop} />
        ) : view === "area" ? (
          areaBlocks.map((b) => (
            <section key={b.key} className="space-y-3">
              <div className="px-4 md:px-0 flex items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-slate-900">
                  {b.key}
                </div>
                <div className="text-xs font-semibold text-slate-500">{b.posts.length} posts</div>
              </div>
              <PostGrid items={b.posts} />
            </section>
          ))
        ) : (
          genreBlocks.map((b) => (
            <section key={b.key} className="space-y-3">
              <div className="px-4 md:px-0 flex items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-slate-900">
                  {b.key}
                </div>
                <div className="text-xs font-semibold text-slate-500">{b.posts.length} posts</div>
              </div>
              <PostGrid items={b.posts} />
            </section>
          ))
        )}
      </div>
    </section>
  );
}
