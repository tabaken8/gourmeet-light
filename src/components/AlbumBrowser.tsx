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
  if (typeof x === "string" && Number.isFinite(Number(x))) return Number(x);
  return null;
}

function getThumbUrl(p: AlbumPost): string | null {
  const v = p?.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;
  const urls = p?.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];
  return null;
}

function fmtVisited(d?: string | null) {
  return d ? String(d) : "日付なし";
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

  // ✅ エリア/ジャンルボタンは「偶数回で全体に戻る」(= toggle)
  const toggleArea = () => setView((cur) => (cur === "area" ? "all" : "area"));
  const toggleGenre = () => setView((cur) => (cur === "genre" ? "all" : "genre"));

  // 検索（店名 / search_text / エリア / ジャンル）
  const filtered = useMemo(() => {
    const key = normSpace(q).toLowerCase();
    if (!key) return posts;

    return posts.filter((p) => {
      const place = p.places;
      const name = (place?.name ?? "").toLowerCase();
      const area = areaLabel(place).toLowerCase();
      const genre = genreLabel(place).toLowerCase();
      const st = (place?.search_text ?? "").toLowerCase();
      return name.includes(key) || area.includes(key) || genre.includes(key) || st.includes(key);
    });
  }, [posts, q]);

  // ---------------------
  // sort helper (posts)
  // ---------------------
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

  // ---------------------
  // ✅ pin-rule: 無選択(all)の時だけ pinned place の投稿を最上部に固定
  //    - pinned内 / unpinned内の並びは sortedPosts の順序を維持
  // ---------------------
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

  // ---------------------
  // pin toggle (place_pins)
  // ---------------------
  const togglePin = async (placeId: string) => {
    if (!isOwner) return;

    const already = pinnedSet.has(placeId);

    // UI先行
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
          throw new Error(
            `delete failed: ${error.message} (status=${status ?? "?"} ${statusText ?? ""})`
          );
        }
      } else {
        const { error, status, statusText } = await supabase
          .from("place_pins")
          .upsert({ user_id: uid, place_id: placeId, sort_order: 0 }, { onConflict: "user_id,place_id" });

        if (error) {
          throw new Error(
            `upsert failed: ${error.message} (status=${status ?? "?"} ${statusText ?? ""})`
          );
        }
      }
    } catch (e: any) {
      // 巻き戻し
      setPinned((prev) => (already ? [placeId, ...prev] : prev.filter((x) => x !== placeId)));

      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      console.error("togglePin error:", msg, e);
    }
  };

  // ---------------------
  // blocks (area/genre): 「区分 -> posts[]」
  // pinnedは "並びに影響しない"（要件）
  // ---------------------
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
  // UI: Post Card (square) + pin button in info area (not overlay)
  // ---------------------
  function PostGrid({ items }: { items: AlbumPost[] }) {
    return (
      <div className="grid grid-cols-3 gap-0">
        {items.map((p) => {
          const place = p.places;
          const pid = p.place_id ?? place?.place_id ?? null;
          const pinnedHere = !!(pid && pinnedSet.has(pid));

          const name = place?.name ?? "Unknown";
          const genre = genreLabel(place);
          const visited = fmtVisited(p.visited_on);
          const score = toScore(p.recommend_score);
          const scoreText = score == null ? "おすすめ: -" : `おすすめ: ${score.toFixed(1)}`;

          const thumb = getThumbUrl(p);

          return (
            <div key={p.id} className="overflow-hidden border border-orange-100 bg-white shadow-sm" style={{ borderRadius: 0 }}>
              <Link href={`/posts/${encodeURIComponent(String(p.id))}`} className="block">
                <div className="relative aspect-square bg-orange-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : null}
                </div>
              </Link>

              {/* info */}
              <div className="px-3 py-2">
                <div className="truncate text-sm font-semibold text-slate-900">{name}</div>

                <div className="mt-0.5 truncate text-[12px] font-semibold text-slate-600">
                  {genre || "未分類"}
                </div>

                <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-slate-500">
                  <span className="truncate">{visited}</span>
                  <span className="shrink-0 font-semibold text-slate-700">{scoreText}</span>
                </div>

                {/* ✅ pin UI: 本人のみ。無選択(all)で最上部固定される */}
                {isOwner && pid ? (
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
                      {pinnedHere ? "" : "ピン"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
function TileGrid({ items }: { items: AlbumPost[] }) {
  return (
    <div className="grid grid-cols-3 gap-0">
      {items.map((p) => {
        const thumb = getThumbUrl(p);
        return (
          <Link
            key={p.id}
            href={`/posts/${encodeURIComponent(String(p.id))}`}
            className="relative block aspect-square bg-orange-50"
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

  // ---------------------
  // header controls
  // ---------------------
  const sortSelect = (
    <select
      value={sort}
      onChange={(e) => setSort(e.target.value as SortKey)}
      className="rounded-full border border-orange-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-orange-200"
      aria-label="並び替え"
    >
      <option value="score">おすすめ度順</option>
      <option value="visited">来店日順</option>
      <option value="created">投稿日時順</option>
    </select>
  );

  const chipBase =
    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold";
  const chipActive = "border-orange-200 bg-orange-50 text-slate-900";
  const chipIdle = "border-orange-100 bg-white text-slate-600 hover:bg-orange-50/40";

  return (
    <section className="border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
      {/* top row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          {/* search */}
          <div className="relative w-full md:w-80">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="店名・エリア・ジャンルで検索"
              className="w-full rounded-full border border-orange-100 bg-white px-9 py-2 text-sm outline-none focus:border-orange-200"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 md:justify-end">
          {/* view toggles */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={toggleArea}
              className={[chipBase, view === "area" ? chipActive : chipIdle].join(" ")}
              aria-pressed={view === "area"}
            >
              <MapPin size={14} />
              エリア
            </button>

            <button
              type="button"
              onClick={toggleGenre}
              className={[chipBase, view === "genre" ? chipActive : chipIdle].join(" ")}
              aria-pressed={view === "genre"}
            >
              <Tag size={14} />
              ジャンル
            </button>
          </div>

          {/* sort */}
          <div className="shrink-0">{sortSelect}</div>
        </div>
      </div>

      {/* body */}
      <div className="mt-4 space-y-6">
        {posts.length === 0 ? (
          <div className="border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
            投稿はまだありません。
          </div>
        ) : view === "all" ? (
          // ✅ 無選択（全体）: pin固定が効く
          <PostGrid items={postsWithPinTop} />
        ) : view === "area" ? (
          areaBlocks.map((b) => (
            <section key={b.key} className="space-y-3">
              {/* 区分ラベルを目立たせる */}
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2">
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
