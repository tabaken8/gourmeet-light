// src/components/AlbumBrowser.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search, Tag, MoreHorizontal, Sparkles } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

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
  return String(p.id); // ✅ post_idで一意
}

function buildMapUrl(p: AlbumPost): string | null {
  const place = p.places;
  const placeName = place?.name ?? null;
  const placeAddress = place?.address ?? null;

  const mapUrl = p.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName ?? "place")}&query_place_id=${encodeURIComponent(
        p.place_id
      )}`
    : placeAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeAddress)}`
      : null;

  return mapUrl;
}

function comparePosts(a: AlbumPost, b: AlbumPost) {
  const sa = toScore(a.recommend_score);
  const sb = toScore(b.recommend_score);
  const d = (sb ?? -Infinity) - (sa ?? -Infinity);
  if (d !== 0) return d;

  const va = a.visited_on ?? "";
  const vb = b.visited_on ?? "";
  if (va !== vb) return va < vb ? 1 : -1;

  const ca = a.created_at ?? "";
  const cb = b.created_at ?? "";
  if (ca !== cb) return ca < cb ? 1 : -1;

  return String(a.id) < String(b.id) ? 1 : -1;
}

export default function AlbumBrowser({
  posts,
  pinnedPostIdsInitial,
  isOwner,
}: {
  posts: AlbumPost[];
  pinnedPostIdsInitial: string[]; // ✅ place → post
  isOwner: boolean;
}) {
  const supabase = createClientComponentClient();

  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("score");

  const [pinned, setPinned] = useState<string[]>(pinnedPostIdsInitial ?? []);
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  const toggleArea = () => setView((cur) => (cur === "area" ? "all" : "area"));
  const toggleGenre = () => setView((cur) => (cur === "genre" ? "all" : "genre"));

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

  const sortedPosts = useMemo(() => {
    const arr = filtered.slice();
    arr.sort((a, b) => {
      if (sort === "score") return comparePosts(a, b);
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

  // ✅ all view: HRを分離
  const { hrPosts, restPosts } = useMemo(() => {
    const hr: AlbumPost[] = [];
    const rest: AlbumPost[] = [];
    for (const p of sortedPosts) {
      const isHR = pinnedSet.has(p.id); // ✅ post_id
      (isHR ? hr : rest).push(p);
    }
    hr.sort(comparePosts);
    return { hrPosts: hr, restPosts: rest };
  }, [sortedPosts, pinnedSet]);

  // ✅ ジャンル代表HR（イタリアンならこれ）
  const hrPickByGenre = useMemo(() => {
    const m = new Map<string, AlbumPost[]>();
    for (const p of hrPosts) {
      const key = genreLabel(p.places);
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    const pick = new Map<string, AlbumPost>();
    for (const [k, arr] of m.entries()) {
      arr.sort(comparePosts);
      pick.set(k, arr[0]);
    }
    return pick;
  }, [hrPosts]);

  // ✅ post_pins toggle
  const toggleHighlyRecommended = async (postId: string) => {
    if (!isOwner) return;

    const already = pinnedSet.has(postId);
    setPinned((prev) => (already ? prev.filter((x) => x !== postId) : [postId, ...prev]));

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(`auth.getUser error: ${authErr.message}`);
      const uid = authData.user?.id;
      if (!uid) throw new Error("not logged in");

      if (already) {
        const { error, status, statusText } = await supabase
          .from("post_pins")
          .delete()
          .eq("user_id", uid)
          .eq("post_id", postId);

        if (error) throw new Error(`delete failed: ${error.message} (status=${status ?? "?"} ${statusText ?? ""})`);
      } else {
        const { error, status, statusText } = await supabase
          .from("post_pins")
          .upsert({ user_id: uid, post_id: postId, sort_order: 0 }, { onConflict: "user_id,post_id" });

        if (error) throw new Error(`upsert failed: ${error.message} (status=${status ?? "?"} ${statusText ?? ""})`);
      }
    } catch (e: any) {
      setPinned((prev) => (already ? [postId, ...prev] : prev.filter((x) => x !== postId)));
      console.error("toggleHighlyRecommended error:", e);
    } finally {
      setMenuOpenFor(null);
    }
  };

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

  function MoreMenu({ post, isHR, mapUrl }: { post: AlbumPost; isHR: boolean; mapUrl: string | null }) {
    const id = stableId(post);
    const open = menuOpenFor === id;

    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpenFor((cur) => (cur === id ? null : id));
          }}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          aria-haspopup="menu"
          aria-expanded={open}
          title="More"
        >
          <MoreHorizontal size={16} />
        </button>

        {open ? (
          <div className="absolute right-0 top-10 z-[60] w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg" role="menu">
            <div className="px-3 py-2 text-[11px] font-bold text-slate-500">ACTIONS</div>

            {isOwner ? (
              <button
                type="button"
                onClick={() => toggleHighlyRecommended(post.id)}
                className={["w-full px-3 py-2 text-left text-sm font-bold hover:bg-slate-50", isHR ? "text-red-700" : "text-slate-800"].join(" ")}
                role="menuitem"
              >
                {isHR ? "My Picks を解除" : "My Picks にする"}
              </button>
            ) : null}

            {mapUrl ? (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="block px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
                role="menuitem"
              >
                Google Mapsで開く
              </a>
            ) : null}

            <button
              type="button"
              onClick={() => setMenuOpenFor(null)}
              className="w-full px-3 py-2 text-left text-sm font-bold text-slate-500 hover:bg-slate-50"
              role="menuitem"
            >
              閉じる
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function PostGrid({ items }: { items: AlbumPost[] }) {
    return (
      <div className="grid grid-cols-2 gap-0 md:grid-cols-3 md:gap-[2px]">
        {items.map((p) => {
          const isHR = pinnedSet.has(p.id);
          const place = p.places;

          const name = place?.name ?? "Unknown";
          const genre = genreLabel(place);
          const score = toScore(p.recommend_score);
          const scoreText = score == null ? "おすすめ: -" : `おすすめ: ${score.toFixed(1)}`;

          const thumb = getThumbUrl(p);
          const mapUrl = buildMapUrl(p);

          return (
            <div
              key={stableId(p)}
              className={[
                // ✅ ここが重要：カード全体の overflow-hidden をやめる（メニューを外に出すため）
                "bg-white shadow-sm",
                isHR ? "border-2 border-red-300" : "border border-orange-100",
              ].join(" ")}
              style={{ borderRadius: 0 }}
            >
              <Link href={`/posts/${encodeURIComponent(String(p.id))}`} className="block">
                {/* ✅ 画像領域だけ overflow-hidden */}
                <div className={["relative aspect-square", isHR ? "bg-red-50" : "bg-orange-50", "overflow-hidden"].join(" ")}>
                  {isHR ? (
                    <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-red-200 bg-white/90 px-2 py-1 text-[11px] font-extrabold text-red-700 backdrop-blur">
                      <Sparkles size={12} />
                      My Picks
                    </div>
                  ) : null}

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}

                  {isHR ? <div className="pointer-events-none absolute inset-0 ring-2 ring-red-300/60" /> : null}
                </div>
              </Link>

              <div className="px-3 py-2">
                <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                <div className="mt-0.5 truncate text-[12px] font-semibold text-slate-600">{genre || "未分類"}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-slate-500">
                  <span className="shrink-0 font-semibold text-slate-700">{scoreText}</span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  {mapUrl ? (
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      title="Google Mapsで開く"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MapPin size={12} />
                      Google Maps
                    </a>
                  ) : (
                    <span />
                  )}

                  <MoreMenu post={p} isHR={isHR} mapUrl={mapUrl} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function GenrePickCard({ pick }: { pick: AlbumPost }) {
    const place = pick.places;
    const name = place?.name ?? "Unknown";
    const genre = genreLabel(place);
    const thumb = getThumbUrl(pick);
    const mapUrl = buildMapUrl(pick);

    return (
      <div className="px-4 md:px-0">
        <div className="border-2 border-red-300 bg-white shadow-sm" style={{ borderRadius: 0 }}>
          <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-3 py-2">
            <div className="inline-flex items-center gap-2 text-xs font-extrabold text-red-700">
              <Sparkles size={14} />
              My Pickes
            </div>
            <MoreMenu post={pick} isHR={true} mapUrl={mapUrl} />
          </div>

          <Link href={`/posts/${encodeURIComponent(String(pick.id))}`} className="block">
            <div className="flex gap-3 p-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-red-50" style={{ borderRadius: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
                <div className="pointer-events-none absolute inset-0 ring-2 ring-red-300/60" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-slate-900">{name}</div>
                <div className="mt-0.5 truncate text-xs font-semibold text-slate-600">{genre}</div>

              </div>
            </div>
          </Link>
        </div>
      </div>
    );
  }

  const sortSelect = (
    <select
      value={sort}
      onChange={(e) => setSort(e.target.value as SortKey)}
      className="rounded-full border border-orange-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-orange-200"
      aria-label="並び替え"
    >
      <option value="score">おすすめ度順</option>
      <option value="created">投稿日時順</option>
      <option value="visited">訪問日順</option>
    </select>
  );

  const chipBase = "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold";
  const chipActive = "border-orange-200 bg-orange-50 text-slate-900";
  const chipIdle = "border-orange-100 bg-white text-slate-600 hover:bg-orange-50/40";

  return (
    <section className="border border-orange-100 bg-white/95 px-0 py-4 shadow-sm backdrop-blur md:px-5 md:py-5">
      <div className="px-4 md:px-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={toggleArea} className={[chipBase, view === "area" ? chipActive : chipIdle].join(" ")} aria-pressed={view === "area"}>
                <MapPin size={14} />
                エリア別
              </button>
              <button type="button" onClick={toggleGenre} className={[chipBase, view === "genre" ? chipActive : chipIdle].join(" ")} aria-pressed={view === "genre"}>
                <Tag size={14} />
                ジャンル別
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 md:justify-end">
            <div className="relative w-full md:w-80">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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

      <div className="mt-4 space-y-6">
        {posts.length === 0 ? (
          <div className="mx-4 md:mx-0 border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">投稿はまだありません。</div>
        ) : view === "all" ? (
          <>
            {hrPosts.length > 0 ? (
              <section className="space-y-3">
                <div className="px-4 md:px-0 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border-2 border-red-200 bg-red-50 px-3 py-1 text-xs font-extrabold text-red-700">
                    <Sparkles size={14} />
                    My Picks
                  </div>
                  <div className="text-xs font-semibold text-slate-500">“本当に推す”だけ</div>
                </div>
                <PostGrid items={hrPosts} />
              </section>
            ) : null}

            <PostGrid items={restPosts} />
          </>
        ) : view === "area" ? (
          areaBlocks.map((b) => (
            <section key={b.key} className="space-y-3">
              <div className="px-4 md:px-0 flex items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-slate-900">{b.key}</div>
                <div className="text-xs font-semibold text-slate-500">{b.posts.length} posts</div>
              </div>
              <PostGrid items={b.posts} />
            </section>
          ))
        ) : (
          genreBlocks.map((b) => {
            const pick = hrPickByGenre.get(b.key) ?? null;
            return (
              <section key={b.key} className="space-y-3">
                <div className="px-4 md:px-0 flex items-center gap-2">
                  <div className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-slate-900">{b.key}</div>
                  <div className="text-xs font-semibold text-slate-500">{b.posts.length} posts</div>
                </div>

                {pick ? <GenrePickCard pick={pick} /> : null}

                <PostGrid items={b.posts} />
              </section>
            );
          })
        )}
      </div>

      {/* 背景クリックで閉じる */}
      {menuOpenFor ? (
        <button
          type="button"
          className="fixed inset-0 z-50 cursor-default bg-transparent"
          onClick={() => setMenuOpenFor(null)}
          aria-label="close menu overlay"
        />
      ) : null}
    </section>
  );
}
