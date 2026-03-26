// src/app/(app)/search/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, TrainFront } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { motion, AnimatePresence } from "framer-motion";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

import TimelineFeed from "@/components/TimelineFeed";
import SearchPostList, { PostRow, SearchMode } from "@/components/search/SearchPostList";
import SearchZeroResultsNudge from "@/components/SearchZeroResultsNudge";
import LocationFilter from "@/components/search/LocationFilter";
import GenreFilter from "@/components/search/GenreFilter";

// ---------- types ----------
type UserHit = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
};

type Station = {
  station_place_id: string;
  station_name: string;
  count_places?: number | null;
};

// ---------- URL helpers ----------
function normalizeModeFromUrl(m: string | null): SearchMode {
  if (m === "station") return "station";
  if (m === "auto") return "auto";
  return "geo";
}

function buildUrl(
  searchParams: URLSearchParams,
  next: {
    q?: string;
    followOnly?: boolean;
    mode?: SearchMode;
    stationPlaceId?: string | null;
    stationName?: string | null;
    genre?: string | null;
  }
) {
  const sp = new URLSearchParams(searchParams.toString());

  const q = (next.q ?? sp.get("q") ?? "").trim();
  const followOnly = next.followOnly ?? (sp.get("follow") === "1");
  const mode = next.mode ?? normalizeModeFromUrl(sp.get("m"));
  const sid = next.stationPlaceId ?? sp.get("station_place_id") ?? sp.get("sid") ?? null;
  const sname = next.stationName ?? sp.get("station_name") ?? sp.get("sname") ?? null;
  const genre = (next.genre ?? sp.get("genre") ?? "").trim();

  if (q) sp.set("q", q); else sp.delete("q");
  if (followOnly) sp.set("follow", "1"); else sp.delete("follow");
  if (genre) sp.set("genre", genre); else sp.delete("genre");

  if (mode === "station" ? !!sid : !!q) sp.set("m", mode);
  else sp.delete("m");

  if (mode === "station") {
    if (sid) sp.set("station_place_id", String(sid)); else sp.delete("station_place_id");
    if (sname) sp.set("station_name", String(sname)); else sp.delete("station_name");
    sp.delete("sid"); sp.delete("sname");
  } else {
    sp.delete("station_place_id"); sp.delete("station_name");
    sp.delete("sid"); sp.delete("sname");
  }

  return `?${sp.toString()}`;
}

// ---------- motion presets ----------
const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24 } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.18 } },
};
const listStagger = {
  animate: { transition: { staggerChildren: 0.04 } },
};

// ---------- skeleton ----------
function UsersSkeleton() {
  return (
    <div className="gm-card px-4 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Users</div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2">
            <Skeleton circle width={40} height={40} />
            <div className="min-w-0 flex-1">
              <Skeleton width={160} height={12} />
              <div className="mt-2"><Skeleton width={240} height={10} /></div>
            </div>
            <Skeleton width={34} height={10} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PostsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="gm-card px-4 py-4">
          <div className="flex items-center gap-3">
            <Skeleton circle width={36} height={36} />
            <div className="flex-1">
              <Skeleton width={180} height={12} />
              <div className="mt-2"><Skeleton width={120} height={10} /></div>
            </div>
          </div>
          <div className="mt-4"><Skeleton height={180} /></div>
          <div className="mt-3"><Skeleton count={2} height={10} /></div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
export default function SearchPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();

  // hydration mismatch 回避
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // current user
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- input ---
  const [q, setQ] = useState("");
  const [followOnly, setFollowOnly] = useState(false);

  // --- location ---
  const [mode, setMode] = useState<SearchMode>("geo");
  const [stationPlaceId, setStationPlaceId] = useState<string | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);

  // --- genre ---
  const [genre, setGenre] = useState("");
  const [genreCandidates, setGenreCandidates] = useState<string[]>([]);
  const [genreCandidatesLoading, setGenreCandidatesLoading] = useState(false);

  // --- committed (検索確定済み) ---
  const [committedQ, setCommittedQ] = useState("");
  const [committedFollow, setCommittedFollow] = useState(false);
  const [committedMode, setCommittedMode] = useState<SearchMode>("geo");
  const [committedStationId, setCommittedStationId] = useState<string | null>(null);
  const [committedStationName, setCommittedStationName] = useState<string | null>(null);
  const [committedGenre, setCommittedGenre] = useState("");
  const [searchedStationName, setSearchedStationName] = useState<string | null>(null);

  // --- results ---
  const [users, setUsers] = useState<UserHit[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState<any>(null);

  // --- empty 時の遅延描画 ---
  const [showDiscover, setShowDiscover] = useState(false);

  // ---- ジャンル候補を DB から取得（1回だけ）----
  useEffect(() => {
    let alive = true;
    setGenreCandidatesLoading(true);
    fetch("/api/search/genres", { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})))
      .then((payload) => {
        if (!alive) return;
        const rows: string[] = Array.isArray(payload?.genres) ? payload.genres : [];
        setGenreCandidates(rows.filter((x) => typeof x === "string" && x.trim()));
      })
      .catch(() => { if (alive) setGenreCandidates([]); })
      .finally(() => { if (alive) setGenreCandidatesLoading(false); });
    return () => { alive = false; };
  }, []);

  // ---- URL → state（mount 後に同期）----
  useEffect(() => {
    if (!mounted) return;

    const qFromUrl = (sp.get("q") ?? "").trim();
    const followFromUrl = sp.get("follow") === "1";
    const modeFromUrl = normalizeModeFromUrl(sp.get("m"));
    const stationIdFromUrl = sp.get("station_place_id") ?? sp.get("sid") ?? null;
    const stationNameFromUrl = sp.get("station_name") ?? sp.get("sname") ?? null;
    const genreFromUrl = (sp.get("genre") ?? "").trim();

    setQ(qFromUrl);
    setFollowOnly(followFromUrl);
    setMode(modeFromUrl);
    setStationPlaceId(stationIdFromUrl);
    setStationName(stationNameFromUrl);
    setGenre(genreFromUrl);

    setCommittedQ(qFromUrl);
    setCommittedFollow(followFromUrl);
    setCommittedMode(modeFromUrl);
    setCommittedStationId(stationIdFromUrl);
    setCommittedStationName(stationNameFromUrl);
    setCommittedGenre(genreFromUrl);
    setSearchedStationName(modeFromUrl === "station" ? (stationNameFromUrl ?? null) : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, sp]);

  // 検索条件が空かどうか
  const isEmpty =
    !committedQ.trim() &&
    !committedGenre.trim() &&
    !(committedMode === "station" && committedStationId);

  // empty 時は TimelineFeed を idle で遅延表示
  useEffect(() => {
    if (!isEmpty) { setShowDiscover(false); return; }
    setShowDiscover(false);
    const anyWin = window as any;
    const id =
      anyWin.requestIdleCallback?.(() => setShowDiscover(true), { timeout: 900 }) ??
      window.setTimeout(() => setShowDiscover(true), 220);
    return () => { anyWin.cancelIdleCallback?.(id); clearTimeout(id); };
  }, [isEmpty]);

  // -------- API 呼び出し --------
  async function loadUsers(query: string) {
    const qq = query.trim();
    if (!qq) { setUsers([]); return; }
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/search-users?q=${encodeURIComponent(qq)}&limit=6`);
      const payload = await res.json().catch(() => ({}));
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadMoreWith(
    args: {
      mode: SearchMode;
      stationId: string | null;
      stationName: string | null;
      follow: boolean;
      q: string;
      genre: string;
    },
    reset: boolean
  ) {
    if (loading) return;
    if (!reset && done) return;

    const { mode: mm, stationId: sid, stationName: sname, follow: ff, q: freeQ, genre: g } = args;

    if (mm !== "station" && !freeQ.trim() && !g.trim()) return;
    if (mm === "station" && !sid) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const combined = [g.trim(), freeQ.trim()].filter(Boolean).join(" ");

      params.set("limit", "10");
      if (ff) params.set("follow", "1");
      if (!reset && cursor) params.set("cursor", cursor);

      if (mm === "station") {
        params.set("station_place_id", String(sid));
        params.set("radius_m", "3000");
        if (sname) params.set("station_name", sname);
        if (combined) params.set("q", combined);
      } else {
        if (combined) params.set("q", combined);
      }

      const res = await fetch(`/api/search?${params.toString()}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      const newPosts: PostRow[] = Array.isArray(payload?.posts) ? payload.posts : [];
      const nextCursor: string | null = payload?.nextCursor ?? payload?.next_cursor ?? null;

      if (reset) setNudge(payload?.nudge ?? null);

      setPosts((prev) => {
        if (reset) return newPosts;
        const seen = new Set(prev.map((p: any) => String(p?.id ?? "")));
        return [...prev, ...newPosts.filter((p: any) => !seen.has(String(p?.id ?? "")))];
      });

      setCursor(nextCursor);
      if (!nextCursor || newPosts.length === 0) setDone(true);
    } catch (e: any) {
      const msg = e?.message ?? "読み込みに失敗しました";
      setError(msg);
      if (String(msg).includes("Unauthorized")) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  // -------- 検索確定（唯一の正）--------
  const commitSearch = (next: {
    q: string;
    follow: boolean;
    mode: SearchMode;
    sid?: string | null;
    sname?: string | null;
    genre?: string | null;
  }) => {
    const nq = (next.q ?? "").trim();
    const ng = (next.genre ?? "").trim();
    const mm = next.mode;

    router.replace(
      `/search${buildUrl(new URLSearchParams(sp.toString()), {
        q: nq,
        followOnly: next.follow,
        mode: mm,
        stationPlaceId: next.sid ?? null,
        stationName: next.sname ?? null,
        genre: ng,
      })}`,
      { scroll: false }
    );

    setCommittedQ(nq);
    setCommittedGenre(ng);
    setCommittedFollow(next.follow);
    setCommittedMode(mm);
    setCommittedStationId(next.sid ?? null);
    setCommittedStationName(next.sname ?? null);
    setSearchedStationName(mm === "station" ? (next.sname ?? null) : null);

    setUsers([]);
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);
    setNudge(null);

    if (mm !== "station" && !nq && !ng) return;
    if (mm === "station" && !next.sid) return;

    if (nq) loadUsers(nq);
    loadMoreWith({ mode: mm, stationId: next.sid ?? null, stationName: next.sname ?? null, follow: next.follow, q: nq, genre: ng }, true);
  };

  // -------- 操作ハンドラ --------
  const handleSearch = () => {
    commitSearch({ q, genre, follow: followOnly, mode, sid: stationPlaceId, sname: stationName });
  };

  const selectStation = (s: Station) => {
    setMode("station");
    setStationPlaceId(s.station_place_id);
    setStationName(s.station_name);
    commitSearch({ q: q.trim() ? q : committedQ, genre: genre || committedGenre, follow: followOnly, mode: "station", sid: s.station_place_id, sname: s.station_name });
  };

  const clearStation = () => {
    setMode("geo");
    setStationPlaceId(null);
    setStationName(null);
    setSearchedStationName(null);
    commitSearch({ q: q.trim() ? q : committedQ, genre: genre || committedGenre, follow: followOnly, mode: "geo", sid: null, sname: null });
  };

  const selectGenre = (g: string) => {
    setGenre(g);
    commitSearch({ q: q.trim() ? q : committedQ, genre: g, follow: followOnly, mode, sid: stationPlaceId, sname: stationName });
  };

  const toggleFollow = (next: boolean) => {
    setFollowOnly(next);
    commitSearch({ q: q.trim() ? q : committedQ, genre: genre || committedGenre, follow: next, mode, sid: stationPlaceId, sname: stationName });
  };

  // -------- Infinite scroll --------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || isEmpty) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting)
          loadMoreWith({ mode: committedMode, stationId: committedStationId, stationName: committedStationName, follow: committedFollow, q: committedQ, genre: committedGenre }, false);
      },
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, done, loading, isEmpty, committedQ, committedFollow, committedMode, committedStationId, committedGenre]);

  // -------- Title --------
  const titleText = useMemo(() => {
    if (isEmpty) return "";
    if (committedMode === "station") {
      const name = committedStationName ?? "駅";
      const g = committedGenre ? ` × ${committedGenre}` : "";
      const qq = committedQ ? `（${committedQ}）` : "";
      return `${name}周辺の投稿一覧${g}${qq}`;
    }
    const g = committedGenre ? ` × ${committedGenre}` : "";
    return `${committedQ}${g} の検索結果`;
  }, [isEmpty, committedMode, committedStationName, committedGenre, committedQ]);

  // ============================================================
  return (
    <div className="space-y-4">
      {/* ===== Search Card ===== */}
      <motion.div className="gm-card px-4 py-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

        {/* タイトル */}
        <div className="mb-3 min-h-[20px]">
          {!isEmpty && (
            <div className="flex items-center gap-2">
              {committedMode === "station" && <TrainFront size={16} className="shrink-0 text-slate-600" />}
              <p className="text-sm font-semibold text-slate-900">{titleText}</p>
            </div>
          )}
        </div>

        {/* 検索入力 */}
        <div className="relative w-full">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="お店・料理・雰囲気を検索"
            className="w-full rounded-full border border-black/[.08] bg-white py-2.5 pl-10 pr-12 text-base font-medium outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            inputMode="search"
            enterKeyHint="search"
          />
          <button
            type="button"
            onClick={handleSearch}
            aria-label="検索"
            className="absolute right-3 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Search size={15} />
          </button>
        </div>

        {/* 場所フィルター + フォロー */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <LocationFilter
            stationPlaceId={stationPlaceId}
            stationName={stationName}
            onSelect={selectStation}
            onClear={clearStation}
          />
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-slate-600">
            <input
              type="checkbox"
              checked={followOnly}
              onChange={(e) => toggleFollow(e.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            フォローのみ
          </label>
        </div>

        {/* ジャンルフィルター */}
        <GenreFilter
          genres={genreCandidates}
          selectedGenre={genre}
          loading={genreCandidatesLoading}
          onSelect={selectGenre}
        />
      </motion.div>

      {/* ===== Body ===== */}
      {isEmpty ? (
        <div className="space-y-3">
          <AnimatePresence mode="wait">
            {!showDiscover ? (
              <motion.div key="empty-splash" {...fadeUp} className="gm-card px-4 py-6">
                <div className="text-sm font-semibold text-slate-900">すぐ検索できます</div>
                <div className="mt-2 text-xs text-slate-500">
                  キーワード入力・駅選択・ジャンル選択で投稿を探せます
                </div>
                <div className="mt-4">
                  <Skeleton height={10} width={220} />
                  <div className="mt-2"><Skeleton height={10} width={160} /></div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="discover" {...fadeUp}>
                <TimelineFeed activeTab="discover" meId={meId} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Users */}
          {usersLoading ? (
            <UsersSkeleton />
          ) : users.length > 0 ? (
            <motion.section className="gm-card px-4 py-3" {...fadeUp}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Users</div>
              <motion.div className="flex flex-col gap-2" variants={listStagger} initial="initial" animate="animate">
                {users.map((u) => {
                  const name = u.display_name ?? u.username ?? "ユーザー";
                  const handle = u.username ? `@${u.username}` : "";
                  const initial = (name || "U").slice(0, 1).toUpperCase();
                  return (
                    <motion.div key={u.id} variants={fadeUp}>
                      <Link href={`/u/${u.id}`} className="gm-press flex items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt="" className="h-10 w-10 object-cover" />
                          ) : initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                            {handle && <div className="truncate text-xs text-slate-500">{handle}</div>}
                          </div>
                          {u.bio && <div className="truncate text-xs text-slate-600">{u.bio}</div>}
                        </div>
                        <div className="text-xs font-semibold text-orange-600">見る</div>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.section>
          ) : null}

          {/* Posts */}
          {loading && posts.length === 0 ? (
            <PostsSkeleton />
          ) : posts.length > 0 ? (
            <motion.div {...fadeUp}>
              <SearchPostList posts={posts} meId={meId} mode={committedMode} searchedStationName={searchedStationName} revealImages={true} />
            </motion.div>
          ) : null}

          <div ref={sentinelRef} className="h-10" />

          {loading && posts.length > 0 && (
            <motion.div {...fadeUp} className="pb-8">
              <div className="text-center text-xs text-slate-500">読み込み中...</div>
              <div className="mt-3">
                <Skeleton height={10} />
                <div className="mt-2"><Skeleton height={10} /></div>
              </div>
            </motion.div>
          )}

          {error && !error.includes("Unauthorized") && (
            <motion.div {...fadeUp} className="pb-8 text-center text-xs text-red-600">{error}</motion.div>
          )}

          {done && posts.length > 0 && (
            <motion.div {...fadeUp} className="pb-8 text-center text-[11px] text-slate-400">これ以上ありません</motion.div>
          )}

          {/* 0件 */}
          {!loading && posts.length === 0 && !error && (
            <motion.div {...fadeUp} className="space-y-3 pb-10">
              {nudge?.type === "zero_results_suggestions" && (
                <SearchZeroResultsNudge
                  nudge={nudge}
                  onSearchStation={(sid, sname) =>
                    commitSearch({ q: committedQ, genre: committedGenre, follow: committedFollow, mode: "station", sid, sname })
                  }
                />
              )}
              <div className="py-6 text-center text-xs text-slate-500">該当する投稿がありません。</div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
