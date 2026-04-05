// src/components/AlbumBrowser.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MapPin, Search, Tag, Sparkles, X, ChevronLeft, ChevronRight } from "lucide-react";
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
  content?: string | null;
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

function getAllFullUrls(p: AlbumPost): string[] {
  const v = p?.image_variants;
  if (Array.isArray(v) && v.length > 0) {
    const urls = v.map((x: any) => x?.full ?? x?.thumb ?? null).filter(Boolean) as string[];
    if (urls.length > 0) return urls;
  }
  return (p?.image_urls ?? []).filter(Boolean) as string[];
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
  return String(p.id);
}

function buildMapUrl(p: AlbumPost): string | null {
  const place = p.places;
  const placeName = place?.name ?? null;
  const placeAddress = place?.address ?? null;
  return p.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName ?? "place")}&query_place_id=${encodeURIComponent(p.place_id)}`
    : placeAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeAddress)}`
      : null;
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
  pinnedPostIdsInitial: string[];
  isOwner: boolean;
}) {
  const supabase = createClientComponentClient();

  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  // デフォルトを投稿日順に変更
  const [sort, setSort] = useState<SortKey>("created");

  const [pinned, setPinned] = useState<string[]>(pinnedPostIdsInitial ?? []);
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  // lightbox
  const [lightboxPost, setLightboxPost] = useState<AlbumPost | null>(null);
  const [lightboxImgIdx, setLightboxImgIdx] = useState(0);

  const openLightbox = (p: AlbumPost) => {
    setLightboxPost(p);
    setLightboxImgIdx(0);
  };

  // キーボード操作
  useEffect(() => {
    if (!lightboxPost) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLightboxPost(null); return; }
      const imgs = getAllFullUrls(lightboxPost);
      if (e.key === "ArrowLeft")  setLightboxImgIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setLightboxImgIdx(i => Math.min(imgs.length - 1, i + 1));
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [lightboxPost]);

  const toggleArea  = () => setView((cur) => (cur === "area"  ? "all" : "area"));
  const toggleGenre = () => setView((cur) => (cur === "genre" ? "all" : "genre"));

  const filtered = useMemo(() => {
    const key = normSpace(q).toLowerCase();
    if (!key) return posts;
    return posts.filter((p) => {
      const place = p.places;
      const name  = (place?.name ?? "").toLowerCase();
      const area  = areaLabel(place).toLowerCase();
      const genre = genreLabel(place).toLowerCase();
      const st    = (place?.search_text ?? "").toLowerCase();
      const addr  = (place?.address ?? "").toLowerCase();
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

  const { hrPosts, restPosts } = useMemo(() => {
    const hr: AlbumPost[] = [];
    const rest: AlbumPost[] = [];
    for (const p of sortedPosts) {
      (pinnedSet.has(String(p.id)) ? hr : rest).push(p);
    }
    hr.sort(comparePosts);
    return { hrPosts: hr, restPosts: rest };
  }, [sortedPosts, pinnedSet]);

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

  const toggleHighlyRecommended = async (postId: string) => {
    if (!isOwner) return;
    const already = pinnedSet.has(postId);
    setPinned((prev) => (already ? prev.filter((x) => x !== postId) : [postId, ...prev]));
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message);
      const uid = authData.user?.id;
      if (!uid) throw new Error("not logged in");
      if (already) {
        const { error } = await supabase.from("post_pins").delete().eq("user_id", uid).eq("post_id", postId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("post_pins").upsert({ user_id: uid, post_id: postId, sort_order: 0 }, { onConflict: "user_id,post_id" });
        if (error) throw error;
      }
    } catch (e: any) {
      setPinned((prev) => (already ? [postId, ...prev] : prev.filter((x) => x !== postId)));
      console.error("toggleHighlyRecommended error:", e);
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
    return Array.from(m.entries())
      .map(([k, arr]) => ({ key: k, posts: arr }))
      .sort((a, b) => b.posts.length - a.posts.length || a.key.localeCompare(b.key, "ja"));
  }, [sortedPosts]);

  const genreBlocks = useMemo(() => {
    const m = new Map<string, AlbumPost[]>();
    for (const p of sortedPosts) {
      const key = genreLabel(p.places);
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    return Array.from(m.entries())
      .map(([k, arr]) => ({ key: k, posts: arr }))
      .sort((a, b) => b.posts.length - a.posts.length || a.key.localeCompare(b.key, "ja"));
  }, [sortedPosts]);

  // ─── Lightbox ───────────────────────────────────────────────────────────────
  function Lightbox() {
    if (!lightboxPost) return null;

    const images   = getAllFullUrls(lightboxPost);
    // thumb URLs (already cached from grid) → instant placeholder while full loads
    const thumbUrls = (lightboxPost.image_variants as any[] ?? [])
      .map((x: any) => x?.thumb ?? x?.full ?? null)
      .filter(Boolean) as string[];
    const currentThumb = thumbUrls[lightboxImgIdx] ?? getThumbUrl(lightboxPost);
    const place    = lightboxPost.places;
    const name     = place?.name ?? "Unknown";
    const genre    = genreLabel(place);
    const score    = toScore(lightboxPost.recommend_score);
    const scoreText = score == null ? null : `${score.toFixed(1)} / 10`;
    const mapUrl   = buildMapUrl(lightboxPost);
    const content  = lightboxPost.content;
    const isHR     = pinnedSet.has(String(lightboxPost.id));

    return createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85"
        onClick={() => setLightboxPost(null)}
      >
        <div
          className="relative flex w-full flex-col md:flex-row bg-white dark:bg-[#1e2026] md:max-w-4xl md:rounded-xl overflow-hidden mx-2 md:mx-0"
          style={{ maxHeight: "90vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxPost(null)}
            className="absolute right-3 top-3 z-20 rounded-full bg-black/55 p-1.5 text-white hover:bg-black/75"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>

          {/* ─ Image area：高さを明示してロード前に潰れないようにする ─ */}
          <div className="relative flex h-[50vh] shrink-0 items-center justify-center bg-slate-900 md:h-auto md:w-[60%]">
            {images.length > 0 ? (
              <>
                {/* thumb: キャッシュ済みで即時表示 → full が読み込まれるまでの placeholder */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {currentThumb && (
                  <img
                    key={`thumb-${currentThumb}`}
                    src={currentThumb}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
                {/* full: 読み込み完了後に thumb の上に重なる */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={images[lightboxImgIdx]}
                  src={images[lightboxImgIdx]}
                  alt=""
                  className="relative z-10 h-full w-full object-contain md:max-h-[90vh]"
                />
              </>
            ) : (
              <div className="h-full w-full bg-slate-200 dark:bg-white/10" />
            )}

            {images.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxImgIdx((i) => Math.max(0, i - 1))}
                  disabled={lightboxImgIdx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 disabled:opacity-25"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setLightboxImgIdx((i) => Math.min(images.length - 1, i + 1))}
                  disabled={lightboxImgIdx === images.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 disabled:opacity-25"
                >
                  <ChevronRight size={20} />
                </button>
                <div className="absolute bottom-3 flex w-full justify-center gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxImgIdx(i)}
                      className={`h-1.5 w-1.5 rounded-full transition-all ${i === lightboxImgIdx ? "bg-white scale-125" : "bg-white/40"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ─ Info panel ─ */}
          <div className="flex flex-col overflow-y-auto p-4 md:w-[40%]">
            {isHR && (
              <div className="mb-2 inline-flex items-center gap-1.5 self-start rounded-full border-2 border-red-200 dark:border-red-700/40 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 text-[11px] font-extrabold text-red-700 dark:text-red-400">
                <Sparkles size={11} />
                My Special Picks
              </div>
            )}

            <div className="text-base font-bold leading-snug text-slate-900 dark:text-gray-100">{name}</div>
            <div className="mt-0.5 text-sm text-slate-500 dark:text-gray-500">{genre}</div>

            {scoreText && (
              <div className="mt-2 inline-flex items-center gap-1 self-start rounded-full bg-orange-50 dark:bg-orange-900/30 px-3 py-1 text-sm font-bold text-orange-600 dark:text-orange-400">
                ⭐ {scoreText}
              </div>
            )}

            {content && (
              <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-gray-300 whitespace-pre-wrap">{content}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-white/[.08] pt-4">
              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapPin size={13} />
                  地図
                </a>
              )}
              <Link
                href={`/posts/${encodeURIComponent(String(lightboxPost.id))}`}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 dark:bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700 dark:hover:bg-white/20"
                style={{ color: "#fff" }}
              >
                詳細を見る →
              </Link>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => toggleHighlyRecommended(String(lightboxPost.id))}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold",
                    isHR
                      ? "border-red-200 dark:border-red-700/40 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                      : "border-slate-200 dark:border-white/15 bg-white dark:bg-white/[.06] text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/10",
                  ].join(" ")}
                >
                  <Sparkles size={12} />
                  {isHR ? "Special Picks を解除" : "Special Picks にする"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // ─── PostGrid ────────────────────────────────────────────────────────────────
  function PostGrid({ items }: { items: AlbumPost[] }) {
    return (
      <div className="grid grid-cols-2 gap-0 md:grid-cols-3 md:gap-[2px]">
        {items.map((p) => {
          const isHR     = pinnedSet.has(String(p.id));
          const place    = p.places;
          const name     = place?.name ?? "Unknown";
          const genre    = genreLabel(place);
          const score    = toScore(p.recommend_score);
          const scoreText = score == null ? "おすすめ: -" : `おすすめ: ${score.toFixed(1)}`;
          const thumb    = getThumbUrl(p);
          const mapUrl   = buildMapUrl(p);

          return (
            <div
              key={stableId(p)}
              className={[
                "bg-white dark:bg-[#16181e] shadow-sm",
                isHR ? "border-2 border-red-300 dark:border-red-700/50" : "border border-orange-100 dark:border-white/[.08]",
              ].join(" ")}
              style={{ borderRadius: 0 }}
            >
              {/* サムネイル → lightbox */}
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => openLightbox(p)}
              >
                <div className={["relative aspect-square", isHR ? "bg-red-50 dark:bg-red-900/20" : "bg-orange-50 dark:bg-white/[.04]", "overflow-hidden"].join(" ")}>
                  {isHR && (
                    <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-red-200 bg-white/90 px-2 py-1 text-[11px] font-extrabold text-red-700 backdrop-blur">
                      <Sparkles size={12} />
                      My Special Picks
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                  {isHR && <div className="pointer-events-none absolute inset-0 ring-2 ring-red-300/60" />}
                </div>
              </button>

              <div className="px-3 py-2">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{name}</div>
                <div className="mt-0.5 truncate text-[12px] font-semibold text-slate-600 dark:text-gray-500">{genre || "未分類"}</div>
                <div className="mt-1 text-[12px] font-semibold text-slate-700 dark:text-gray-400">{scoreText}</div>

                {/* 地図ボタンのみ（3点リーダー削除） */}
                {mapUrl && (
                  <div className="mt-2">
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[.06] px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MapPin size={12} />
                      地図
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── GenrePickCard ───────────────────────────────────────────────────────────
  function GenrePickCard({ pick }: { pick: AlbumPost }) {
    const place  = pick.places;
    const name   = place?.name ?? "Unknown";
    const genre  = genreLabel(place);
    const thumb  = getThumbUrl(pick);
    const mapUrl = buildMapUrl(pick);

    return (
      <div className="px-4 md:px-0">
        <div className="border-2 border-red-300 dark:border-red-700/50 bg-white dark:bg-[#16181e] shadow-sm" style={{ borderRadius: 0 }}>
          <div className="flex items-center justify-between gap-3 border-b border-red-200 dark:border-red-700/40 bg-red-50 dark:bg-red-900/20 px-3 py-2">
            <div className="inline-flex items-center gap-2 text-xs font-extrabold text-red-700 dark:text-red-400">
              <Sparkles size={14} />
              My Special Picks
            </div>
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[.06] px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10"
                onClick={(e) => e.stopPropagation()}
              >
                <MapPin size={11} />
                地図
              </a>
            )}
          </div>

          {/* サムネイル → lightbox */}
          <button type="button" className="block w-full text-left" onClick={() => openLightbox(pick)}>
            <div className="flex gap-3 p-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-red-50" style={{ borderRadius: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                <div className="pointer-events-none absolute inset-0 ring-2 ring-red-300/60" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-slate-900 dark:text-gray-100">{name}</div>
                <div className="mt-0.5 truncate text-xs font-semibold text-slate-600 dark:text-gray-500">{genre}</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  const sortSelect = (
    <select
      value={sort}
      onChange={(e) => setSort(e.target.value as SortKey)}
      className="rounded-full border border-orange-100 dark:border-white/10 bg-white dark:bg-white/[.06] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-gray-300 outline-none focus:border-orange-200 dark:focus:border-white/25"
      aria-label="並び替え"
    >
      <option value="created">投稿日時順</option>
      <option value="score">おすすめ度順</option>
    </select>
  );

  const chipBase   = "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold";
  const chipActive = "border-orange-200 dark:border-orange-700/40 bg-orange-50 dark:bg-orange-900/30 text-slate-900 dark:text-orange-300";
  const chipIdle   = "border-orange-100 dark:border-white/10 bg-white dark:bg-white/[.06] text-slate-600 dark:text-gray-400 hover:bg-orange-50/40 dark:hover:bg-white/10";

  return (
    <section className="border border-orange-100 dark:border-white/[.08] bg-white/95 dark:bg-[#16181e] px-0 py-4 shadow-sm backdrop-blur md:px-5 md:py-5">
      <div className="px-4 md:px-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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

          <div className="flex items-center justify-between gap-2 md:justify-end">
            <div className="relative w-full md:w-80">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="店名・エリア・ジャンルで検索"
                className="w-full rounded-full border border-orange-100 dark:border-white/10 bg-white dark:bg-white/[.06] px-9 pr-9 py-2 text-base md:text-sm text-slate-900 dark:text-gray-100 outline-none focus:border-orange-200 dark:focus:border-white/25 placeholder:text-slate-400 dark:placeholder:text-gray-500"
              />
            </div>
            <div className="shrink-0">{sortSelect}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-6">
        {posts.length === 0 ? (
          <div className="mx-4 md:mx-0 border border-orange-50 dark:border-white/[.08] bg-orange-50/60 dark:bg-white/[.04] p-8 text-center text-xs text-slate-600 dark:text-gray-500 md:text-sm">
            投稿はまだありません。
          </div>
        ) : view === "all" ? (
          <>
            {hrPosts.length > 0 && (
              <section className="space-y-3">
                <div className="px-4 md:px-0 flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border-2 border-red-200 dark:border-red-700/40 bg-red-50 dark:bg-red-900/30 px-3 py-1 text-xs font-extrabold text-red-700 dark:text-red-400">
                    <Sparkles size={14} />
                    My Special Picks
                  </div>
                </div>
                <PostGrid items={hrPosts} />
              </section>
            )}
            <PostGrid items={restPosts} />
          </>
        ) : view === "area" ? (
          areaBlocks.map((b) => (
            <section key={b.key} className="space-y-3">
              <div className="px-4 md:px-0 flex items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-orange-200 dark:border-orange-700/40 bg-orange-50 dark:bg-orange-900/30 px-3 py-1 text-xs font-bold text-slate-900 dark:text-orange-300">
                  {b.key}
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-gray-500">{b.posts.length} posts</div>
              </div>
              <PostGrid items={b.posts} />
            </section>
          ))
        ) : (
          genreBlocks.map((b) => (
            <section key={b.key} className="space-y-3">
              <div className="px-4 md:px-0 flex items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-orange-200 dark:border-orange-700/40 bg-orange-50 dark:bg-orange-900/30 px-3 py-1 text-xs font-bold text-slate-900 dark:text-orange-300">
                  {b.key}
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-gray-500">{b.posts.length} posts</div>
              </div>
              <PostGrid items={b.posts} />
            </section>
          ))
        )}
      </div>

      <Lightbox />
    </section>
  );
}
