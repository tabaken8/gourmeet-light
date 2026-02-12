"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, MapPin } from "lucide-react";
import XSwitch from "@/components/XSwitch";

type UserLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type PostLite = {
  id: string;
  user_id: string;
  visited_on: string | null;
  content: string | null;
  image_urls: string[] | null;
  image_variants?: any[] | null;
  place_id: string | null;
  place_name: string | null;
  place_address: string | null;
  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;
  profiles: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_public: boolean | null;
  } | null;
  isFollowing?: boolean;
  finalScore?: number;
};

const DEBOUNCE_MS = 220;

function getFirstThumb(p: PostLite): string | null {
  const v = Array.isArray(p.image_variants) ? p.image_variants : [];
  const v0 = v[0];
  const fromVariants = typeof v0?.thumb === "string" ? v0.thumb : typeof v0?.full === "string" ? v0.full : null;
  if (fromVariants) return fromVariants;

  const urls = Array.isArray(p.image_urls) ? p.image_urls : [];
  return typeof urls[0] === "string" ? urls[0] : null;
}

function fmtVisited(d: string | null) {
  if (!d) return "訪問日: -";
  return `訪問日: ${d}`;
}

function fmtScore(x: any) {
  const n = typeof x === "number" && Number.isFinite(x) ? x : null;
  if (n == null) return null;
  if (n < 0 || n > 10) return null;
  return n.toFixed(1);
}

function buildMapUrl(placeId: string | null, placeName: string | null, placeAddress: string | null) {
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName ?? "place")}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  if (placeAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeAddress)}`;
  }
  return null;
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [followOnly, setFollowOnly] = useState(false);

  const [users, setUsers] = useState<UserLite[]>([]);
  const [posts, setPosts] = useState<PostLite[]>([]);

  const [loading, setLoading] = useState(false);

  const hasQuery = q.trim().length > 0;

  // ✅ q空でも discover を取りに行く（= 最初から表示）
  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (followOnly) params.set("followOnly", "1");

        const res = await fetch(`/api/search?${params.toString()}`);
        const json = await res.json().catch(() => ({}));

        setUsers(Array.isArray(json?.users) ? json.users : []);
        setPosts(Array.isArray(json?.posts) ? json.posts : []);
      } finally {
        setLoading(false);
      }
    }, hasQuery ? DEBOUNCE_MS : 0);

    return () => clearTimeout(handle);
  }, [q, followOnly, hasQuery]);

  // ✅ “空ボックスは出さない”
  const showUsers = hasQuery && users.length > 0;
  const showPosts = posts.length > 0; // q空でも discover で出る

  const showNothing = hasQuery && !loading && !showUsers && !showPosts;

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
        {/* Header */}
        <header className="mb-5">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            Search
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            人 / 投稿をまとめて探す。
          </p>
        </header>

        {/* Search bar */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-orange-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="店名 / キャプション / @ユーザーID / 表示名"
                className="w-full rounded-full border border-orange-100 bg-orange-50/60 px-10 py-2.5 text-sm outline-none transition focus:border-orange-300 focus:bg-white focus:shadow-sm"
                inputMode="search"
                autoFocus
              />
            </div>

            {/* ✅ Follow only toggle (XSwitch) */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-[11px] font-semibold text-slate-600 leading-none">
                フォロー中のみ
              </div>
              <XSwitch checked={followOnly} onChange={setFollowOnly} aria-label="フォロー中のみ" />
            </div>
          </div>

          {loading ? (
            <div className="mt-3 text-[11px] text-slate-500">読み込み中…</div>
          ) : null}
        </section>

        {/* ✅ queryがあるのに何もない */}
        {showNothing ? (
          <div className="mt-6 text-center text-xs text-slate-400">
            一致する結果がありません
          </div>
        ) : null}

        {/* USERS（検索時のみ、空ならボックス自体出さない） */}
        {showUsers ? (
          <section className="mt-6 rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-orange-500">
                USERS
              </div>
              <div className="text-[11px] text-slate-400">{users.length}件</div>
            </div>

            <div className="grid gap-2">
              {users.map((u) => {
                const name = u.display_name || (u.username ? `@${u.username}` : "（表示名なし）");
                const initial = (name || "U").slice(0, 1).toUpperCase();

                return (
                  <Link
                    key={u.id}
                    href={`/u/${u.id}`}
                    className="gm-press flex items-center gap-3 rounded-xl border border-black/[.06] bg-white/70 px-3 py-2 hover:bg-white"
                  >
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="h-9 w-9 rounded-full border border-orange-100 object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
                        {initial}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-slate-900">
                        {u.display_name ?? "（表示名なし）"}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {u.username ? `@${u.username}` : ""}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* POSTS（q空 = discover、qあり = search結果） */}
        {showPosts ? (
          <section className="mt-6 rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-orange-500">
                {hasQuery ? "POSTS" : "DISCOVER"}
              </div>
              <div className="text-[11px] text-slate-400">{posts.length}件</div>
            </div>

            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {posts.map((p) => {
                const prof = p.profiles;
                const display =
                  prof?.display_name ??
                  (prof?.username ? `@${prof.username}` : "（表示名なし）");

                const avatar = prof?.avatar_url ?? null;
                const score = fmtScore(p.recommend_score);
                const thumb = getFirstThumb(p);

                const mapUrl = buildMapUrl(p.place_id, p.place_name, p.place_address);

                return (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-2xl border border-black/[.06] bg-white/80"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
                      {/* thumb */}
                      <Link href={`/posts/${p.id}`} className="block">
                        <div className="relative aspect-square bg-slate-100">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-slate-100" />
                          )}
                        </div>
                      </Link>

                      {/* info */}
                      <div className="p-4">
                        {/* author */}
                        <div className="flex items-center gap-3">
                          {avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatar}
                              alt=""
                              className="h-9 w-9 rounded-full border border-orange-100 object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
                              {(display || "U").slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-[13px] font-semibold text-slate-900">
                                {display}
                              </div>
                              {p.isFollowing ? (
                                <span className="gm-chip inline-flex items-center px-2 py-1 text-[10px] text-orange-800">
                                  フォロー中
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {fmtVisited(p.visited_on)}
                            </div>
                          </div>

                          <div className="flex-1" />

                          {score ? (
                            <span className="gm-chip inline-flex items-center px-2 py-1 text-[11px] text-orange-800">
                              おすすめ: <span className="ml-1 font-semibold">{score}</span>
                            </span>
                          ) : null}
                        </div>

                        {/* place row */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {p.place_name ? (
                            <span className="gm-chip inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-800">
                              <MapPin size={13} className="opacity-70" />
                              <span className="max-w-[280px] truncate">{p.place_name}</span>
                            </span>
                          ) : null}

                          {mapUrl ? (
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="gm-chip gm-press inline-flex items-center px-2 py-1 text-[11px] text-slate-700 hover:underline"
                            >
                              Maps
                            </a>
                          ) : null}

                          <Link
                            href={`/posts/${p.id}`}
                            className="gm-chip gm-press inline-flex items-center px-2 py-1 text-[11px] text-orange-700 hover:underline"
                          >
                            詳細
                          </Link>
                        </div>

                        {/* caption */}
                        {p.content ? (
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                            {p.content}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
