// src/app/(app)/search/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, TrainFront, X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { motion, AnimatePresence } from "framer-motion";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

import TimelineFeed from "@/components/TimelineFeed";
import TimelinePostList, { PostRow, SearchMode } from "@/components/TimelinePostList";

// ✅ analytics
import { trackEvent } from "@/lib/analytics/track";

type UserHit = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
};

type StationSuggest = {
  station_place_id: string;
  station_name: string;
  station_lat?: number | null;
  station_lng?: number | null;
  count_places?: number | null;
};

function normalizeModeFromUrl(m: string | null): SearchMode {
  if (m === "station") return "station";
  if (m === "auto") return "auto";
  if (m === "free") return "geo";
  return "geo";
}

/**
 * URLキーはここで完全統一：
 * - station_place_id / station_name
 * ただし過去互換で sid/sname も読んで消す
 */
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

  const sid =
    next.stationPlaceId ??
    sp.get("station_place_id") ??
    sp.get("sid") ??
    null;

  const sname =
    next.stationName ??
    sp.get("station_name") ??
    sp.get("sname") ??
    null;

  const genre = (next.genre ?? sp.get("genre") ?? "").trim();

  if (q) sp.set("q", q);
  else sp.delete("q");

  if (followOnly) sp.set("follow", "1");
  else sp.delete("follow");

  if (genre) sp.set("genre", genre);
  else sp.delete("genre");

  // stationは station_place_id があれば q空でも保持
  if (mode === "station" ? !!sid : !!q) sp.set("m", mode);
  else sp.delete("m");

  if (mode === "station") {
    if (sid) sp.set("station_place_id", String(sid));
    else sp.delete("station_place_id");

    if (sname) sp.set("station_name", String(sname));
    else sp.delete("station_name");

    // 旧キーは掃除
    sp.delete("sid");
    sp.delete("sname");
  } else {
    sp.delete("station_place_id");
    sp.delete("station_name");
    sp.delete("sid");
    sp.delete("sname");
  }

  return `?${sp.toString()}`;
}

const GENRES = [
  "焼肉",
  "寿司",
  "ラーメン",
  "カフェ",
  "居酒屋",
  "イタリアン",
  "中華",
  "和食",
  "フレンチ",
  "バー",
] as const;

// --------------------
// motion presets
// --------------------
const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24 } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.18 } },
};

const listStagger = {
  animate: { transition: { staggerChildren: 0.04 } },
};

// --------------------
// skeleton blocks
// --------------------
function UsersSkeleton() {
  return (
    <div className="gm-card px-4 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Users
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2"
          >
            <Skeleton circle width={40} height={40} />
            <div className="min-w-0 flex-1">
              <Skeleton width={160} height={12} />
              <div className="mt-2">
                <Skeleton width={240} height={10} />
              </div>
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
              <div className="mt-2">
                <Skeleton width={120} height={10} />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Skeleton height={180} />
          </div>
          <div className="mt-3">
            <Skeleton count={2} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------
// analytics helpers
// --------------------
function clampStr(s: string, n = 200) {
  const t = (s ?? "").trim();
  return t.length > n ? t.slice(0, n) : t;
}
function combinedQueryForLog(q: string, genre: string) {
  const combined = [genre.trim(), q.trim()].filter(Boolean).join(" ").trim();
  return clampStr(combined, 240);
}

export default function SearchPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();

  // ---- Hydration mismatch回避：mount後にURL同期 ----
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // me
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, [supabase]);

  // input（自由入力）
  const [q, setQ] = useState<string>("");
  const [followOnly, setFollowOnly] = useState<boolean>(false);

  // station plate
  const [mode, setMode] = useState<SearchMode>("geo");
  const [stationPlaceId, setStationPlaceId] = useState<string | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);

  // genre chip
  const [genre, setGenre] = useState<string>("");

  // TimelinePostListに渡す駅名（検索確定後のみ）
  const [searchedStationName, setSearchedStationName] = useState<string | null>(
    null
  );

  // committed（検索確定済み）
  const [committedQ, setCommittedQ] = useState<string>("");
  const [committedFollow, setCommittedFollow] = useState<boolean>(false);
  const [committedMode, setCommittedMode] = useState<SearchMode>("geo");
  const [committedStationId, setCommittedStationId] = useState<string | null>(
    null
  );
  const [committedStationName, setCommittedStationName] = useState<string | null>(
    null
  );
  const [committedGenre, setCommittedGenre] = useState<string>("");

  // results
  const [users, setUsers] = useState<UserHit[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // station suggest
  const [suggests, setSuggests] = useState<StationSuggest[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestReqId = useRef(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const justSelectedStationRef = useRef(false);

  // ✅ isEmpty時にdiscoverを遅延描画（“速く見せる”本丸）
  const [showDiscover, setShowDiscover] = useState(false);

  // ---- URL -> state（mount後同期）----
  useEffect(() => {
    if (!mounted) return;

    const qFromUrl = (sp.get("q") ?? "").trim();
    const followFromUrl = sp.get("follow") === "1";
    const modeFromUrl = normalizeModeFromUrl(sp.get("m"));

    // ✅ 新キー優先（互換で旧キーも読む）
    const stationIdFromUrl = sp.get("station_place_id") ?? sp.get("sid");
    const stationNameFromUrl = sp.get("station_name") ?? sp.get("sname");

    const genreFromUrl = (sp.get("genre") ?? "").trim();

    setFollowOnly(followFromUrl);
    setMode(modeFromUrl);
    setStationPlaceId(stationIdFromUrl);
    setStationName(stationNameFromUrl);
    setGenre(genreFromUrl);

    setQ(qFromUrl);

    setCommittedQ(qFromUrl);
    setCommittedFollow(followFromUrl);
    setCommittedMode(modeFromUrl);
    setCommittedStationId(stationIdFromUrl);
    setCommittedStationName(stationNameFromUrl);
    setCommittedGenre(genreFromUrl);

    setSearchedStationName(
      modeFromUrl === "station" ? (stationNameFromUrl ?? null) : null
    );

    // ✅ URLから状態復元したこと自体もログにしておくと便利（デモ用）
    trackEvent({
      name: "search_url_sync",
      pathname: "/search",
      props: {
        q: clampStr(qFromUrl, 240),
        follow_only: followFromUrl,
        mode: modeFromUrl,
        station_place_id: stationIdFromUrl ?? null,
        station_name: stationNameFromUrl ?? null,
        genre: genreFromUrl || null,
      },
    }).catch(() => {});

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, sp]);

  // stationは「駅だけ」でも検索OK
  const isEmpty =
    !committedQ.trim() &&
    !(committedMode === "station" && committedStationId);

  // ✅ empty時の重いUIを遅らせる（検索ページの体感速度UP）
  useEffect(() => {
    if (!isEmpty) {
      setShowDiscover(false);
      return;
    }
    setShowDiscover(false);

    const anyWin = window as any;
    const id =
      anyWin.requestIdleCallback?.(() => setShowDiscover(true), {
        timeout: 900,
      }) ?? window.setTimeout(() => setShowDiscover(true), 220);

    return () => {
      anyWin.cancelIdleCallback?.(id);
      clearTimeout(id);
    };
  }, [isEmpty]);

  function buildCombinedQuery(nextQ: string, nextGenre: string) {
    const parts = [nextGenre.trim(), nextQ.trim()].filter(Boolean);
    return parts.join(" ").trim();
  }

  async function loadUsers(query: string) {
    const qq = query.trim();
    if (!qq) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);

    const t0 = performance.now();
    try {
      const res = await fetch(
        `/api/search-users?q=${encodeURIComponent(qq)}&limit=6`
      );
      const payload = await res.json().catch(() => ({}));
      setUsers(Array.isArray(payload?.users) ? payload.users : []);

      trackEvent({
        name: "search_users_results",
        pathname: "/search",
        props: {
          q: clampStr(qq, 240),
          results_count: Array.isArray(payload?.users) ? payload.users.length : 0,
          latency_ms: Math.round(performance.now() - t0),
        },
      }).catch(() => {});
    } catch {
      setUsers([]);
      trackEvent({
        name: "search_users_error",
        pathname: "/search",
        props: {
          q: clampStr(qq, 240),
          latency_ms: Math.round(performance.now() - t0),
        },
      }).catch(() => {});
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadSuggestStations(query: string) {
    const qq = query.trim();
    if (!qq) {
      setSuggests([]);
      setSuggestOpen(false);
      return;
    }

    const my = ++suggestReqId.current;
    setSuggestLoading(true);

    const t0 = performance.now();
    try {
      const res = await fetch(
        `/api/search/suggest/station?q=${encodeURIComponent(qq)}&limit=8`
      );
      const payload = await res.json().catch(() => ({}));
      if (suggestReqId.current !== my) return;

      const rows: StationSuggest[] = Array.isArray(payload?.stations)
        ? payload.stations
        : [];
      setSuggests(rows);

      if (!justSelectedStationRef.current) setSuggestOpen(rows.length > 0);

      trackEvent({
        name: "suggest_impression",
        pathname: "/search",
        props: {
          type: "station",
          q: clampStr(qq, 240),
          results_count: rows.length,
          latency_ms: Math.round(performance.now() - t0),
        },
      }).catch(() => {});
    } catch {
      if (suggestReqId.current !== my) return;
      setSuggests([]);
      setSuggestOpen(false);

      trackEvent({
        name: "suggest_error",
        pathname: "/search",
        props: {
          type: "station",
          q: clampStr(qq, 240),
          latency_ms: Math.round(performance.now() - t0),
        },
      }).catch(() => {});
    } finally {
      if (suggestReqId.current === my) setSuggestLoading(false);
    }
  }

  // ✅ API統合版：/api/search だけ叩く（stationもgeoも）
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

    const mm = args.mode;
    const sid = args.stationId;
    const sname = args.stationName;
    const ff = args.follow;
    const freeQ = args.q;
    const g = args.genre;

    // geo: q/genreが空なら検索しない
    if (mm !== "station" && !freeQ.trim() && !g.trim()) return;
    // station: sid必須
    if (mm === "station" && !sid) return;

    setLoading(true);
    setError(null);

    const limit = 10;

    const t0 = performance.now();
    try {
      const params = new URLSearchParams();
      const combined = buildCombinedQuery(freeQ, g);

      params.set("limit", String(limit));
      if (ff) params.set("follow", "1");
      if (!reset && cursor) params.set("cursor", cursor);

      if (mm === "station") {
        params.set("station_place_id", String(sid));
        params.set("radius_m", "3000");
        if (sname) params.set("station_name", sname);
        // qは空でもOK（駅周辺一覧）
        if (combined) params.set("q", combined);
      } else {
        // geoはcombined必須（空なら呼ばない）
        if (combined) params.set("q", combined);
      }

      const url = `/api/search?${params.toString()}`;

      const res = await fetch(url);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      const newPosts: PostRow[] = Array.isArray(payload?.posts) ? payload.posts : [];
      const nextCursor: string | null =
        payload?.nextCursor ?? payload?.next_cursor ?? payload?.cursor ?? null;

      // ✅ analytics: search_results
      trackEvent({
        name: "search_results",
        pathname: "/search",
        props: {
          reset,
          mode: mm,
          follow_only: ff,
          station_place_id: mm === "station" ? sid : null,
          station_name: mm === "station" ? (sname ?? null) : null,
          q: clampStr(freeQ, 240),
          genre: g || null,
          combined_q: combinedQueryForLog(freeQ, g),
          results_count: newPosts.length,
          has_next: !!nextCursor,
          latency_ms: Math.round(performance.now() - t0),
        },
      }).catch(() => {});

      setPosts((prev) => {
        if (reset) return newPosts;
        const seen = new Set(prev.map((p: any) => String(p?.id ?? "")));
        const appended = newPosts.filter((p: any) => !seen.has(String(p?.id ?? "")));
        return [...prev, ...appended];
      });

      setCursor(nextCursor);
      if (!nextCursor || newPosts.length === 0) setDone(true);
    } catch (e: any) {
      const msg = e?.message ?? "読み込みに失敗しました";
      setError(msg);

      trackEvent({
        name: "search_error",
        pathname: "/search",
        props: {
          reset,
          mode: mm,
          follow_only: ff,
          station_place_id: mm === "station" ? sid : null,
          station_name: mm === "station" ? (sname ?? null) : null,
          q: clampStr(freeQ, 240),
          genre: g || null,
          combined_q: combinedQueryForLog(freeQ, g),
          error: String(msg),
          latency_ms: Math.round(performance.now() - t0),
        },
      }).catch(() => {});

      if (String(msg).includes("Unauthorized")) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  // ✅ 検索確定（URLもstateも結果も全部そろえる “唯一の正”）
  const commitSearch = (next: {
    q: string;
    follow: boolean;
    mode: SearchMode;
    sid?: string | null;
    sname?: string | null;
    genre?: string | null;

    // ✅ analytics: 検索確定の起点
    source?:
      | "enter"
      | "icon"
      | "genre"
      | "clear_genre"
      | "clear_station"
      | "follow_toggle"
      | "url_sync";
  }) => {
    const nq = (next.q ?? "").trim();
    const ng = (next.genre ?? "").trim();
    const mm = next.mode;

    // ✅ analytics: search_commit（最重要）
    trackEvent({
      name: "search_commit",
      pathname: "/search",
      props: {
        source: next.source ?? "enter",
        mode: mm,
        follow_only: next.follow,
        station_place_id: mm === "station" ? (next.sid ?? null) : null,
        station_name: mm === "station" ? (next.sname ?? null) : null,
        q: clampStr(nq, 240),
        genre: ng || null,
        combined_q: combinedQueryForLog(nq, ng),
      },
    }).catch(() => {});

    const nextUrl = buildUrl(new URLSearchParams(sp.toString()), {
      q: nq,
      followOnly: next.follow,
      mode: mm,
      stationPlaceId: next.sid ?? null,
      stationName: next.sname ?? null,
      // ✅ 空文字 "" を渡すと buildUrl 側で delete される
      genre: ng,
    });

    router.replace(`/search${nextUrl}`, { scroll: false });

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

    // 実行条件
    if (mm !== "station" && !nq && !ng) return;
    if (mm === "station" && !next.sid) return;

    // usersは “自由入力” のみで出したい（genreだけでユーザー検索されても微妙なので）
    if (nq) loadUsers(nq);

    loadMoreWith(
      {
        mode: mm,
        stationId: next.sid ?? null,
        stationName: next.sname ?? null,
        follow: next.follow,
        q: nq,
        genre: ng,
      },
      true
    );
  };

  // infinite scroll（検索結果があるときだけ）
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    if (isEmpty) return;

    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreWith(
            {
              mode: committedMode,
              stationId: committedStationId,
              stationName: committedStationName,
              follow: committedFollow,
              q: committedQ,
              genre: committedGenre,
            },
            false
          );
        }
      },
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cursor,
    done,
    loading,
    isEmpty,
    committedQ,
    committedFollow,
    committedMode,
    committedStationId,
    committedGenre,
  ]);

  // suggest（駅プレートがない時だけ）
  useEffect(() => {
    const qq = q.trim();

    if (stationPlaceId) {
      setSuggestOpen(false);
      setSuggests([]);
      return;
    }

    if (!qq) {
      setSuggests([]);
      setSuggestOpen(false);
      return;
    }

    justSelectedStationRef.current = false;

    const t = setTimeout(() => loadSuggestStations(qq), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, stationPlaceId]);

  const selectStation = (s: StationSuggest, rank: number) => {
    justSelectedStationRef.current = true;

    // ✅ analytics: suggest_select（駅）
    trackEvent({
      name: "suggest_select",
      pathname: "/search",
      props: {
        type: "station",
        value: s.station_name,
        rank, // 0-based
        q_before: clampStr(q, 240),
        suggests_count: suggests.length,
        station_place_id: s.station_place_id,
      },
    }).catch(() => {});

    setMode("station");
    setStationPlaceId(s.station_place_id);
    setStationName(s.station_name);

    setQ("");

    setSuggestOpen(false);
    setSuggests([]);

    // ✅ 駅選択も “即URL反映だけ” にしておく（検索はEnter/虫眼鏡 or ジャンル押下で走る）
    const nextUrl = buildUrl(new URLSearchParams(sp.toString()), {
      q: "",
      followOnly,
      mode: "station",
      stationPlaceId: s.station_place_id,
      stationName: s.station_name,
      genre: genre || null,
    });
    router.replace(`/search${nextUrl}`, { scroll: false });

    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // ✅ チップ削除系は「URLからも消す」＋「必要なら検索も更新」
  const clearStation = (opts?: { commit?: boolean }) => {
    setMode("geo");
    setStationPlaceId(null);
    setStationName(null);
    setSearchedStationName(null);

    const willCommit = opts?.commit ?? false;

    if (willCommit) {
      // station解除＝geoに戻して再検索（q/genreが空ならisEmptyになるだけ）
      commitSearch({
        q: q.trim() ? q : committedQ,
        genre: genre || committedGenre,
        follow: followOnly,
        mode: "geo",
        sid: null,
        sname: null,
        source: "clear_station",
      });
      return;
    }

    // commitしない場合でもURLは整える
    const nextUrl = buildUrl(new URLSearchParams(sp.toString()), {
      q: q.trim(),
      followOnly,
      mode: "geo",
      stationPlaceId: null,
      stationName: null,
      genre: genre || null,
    });
    router.replace(`/search${nextUrl}`, { scroll: false });

    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const clearGenre = (opts?: { commit?: boolean }) => {
    setGenre("");

    const willCommit = opts?.commit ?? false;

    if (willCommit) {
      // genre解除＝現在の条件で再検索（genre=""にした状態）
      commitSearch({
        q: q.trim() ? q : committedQ,
        genre: "",
        follow: followOnly,
        mode: mode,
        sid: stationPlaceId,
        sname: stationName,
        source: "clear_genre",
      });
      return;
    }

    // commitしない場合でもURLは整える
    const nextUrl = buildUrl(new URLSearchParams(sp.toString()), {
      q: q.trim(),
      followOnly,
      mode,
      stationPlaceId,
      stationName,
      genre: null,
    });
    router.replace(`/search${nextUrl}`, { scroll: false });

    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Enterで検索確定
  const enterToSearch = (source: "enter" | "icon") => {
    if (mode === "station") {
      commitSearch({
        q,
        genre,
        follow: followOnly,
        mode: "station",
        sid: stationPlaceId,
        sname: stationName,
        source,
      });
      return;
    }
    commitSearch({
      q,
      genre,
      follow: followOnly,
      mode: "geo",
      sid: null,
      sname: null,
      source,
    });
  };

  const toggleFollow = (next: boolean) => {
    setFollowOnly(next);

    // 既に結果表示中なら即反映
    if (!isEmpty) {
      commitSearch({
        q: q.trim() ? q : committedQ,
        genre: genre || committedGenre,
        follow: next,
        mode: committedMode,
        sid: committedStationId,
        sname: committedStationName,
        source: "follow_toggle",
      });
    } else {
      // 空ならURLだけ整える
      const nextUrl = buildUrl(new URLSearchParams(sp.toString()), {
        q: q.trim(),
        followOnly: next,
        mode,
        stationPlaceId,
        stationName,
        genre: genre || null,
      });
      router.replace(`/search${nextUrl}`, { scroll: false });
    }
  };

  // ✅ Delete/Backspaceでチップを消す（station/genre両方）
  function handleChipDeleteKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Backspace" && e.key !== "Delete") return;

    // 入力があるときは普通に文字削除
    if (q.trim().length > 0) return;

    // どちらかがあるときだけ“チップ削除”にする
    if (!genre && !(stationPlaceId && stationName)) return;

    e.preventDefault();

    // 優先順位：genre -> station（最後に付けた感覚に近い）
    if (genre) {
      clearGenre({ commit: true });
      return;
    }
    if (stationPlaceId && stationName) {
      clearStation({ commit: true });
      return;
    }
  }

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

  // --------------------
  // render
  // --------------------
  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        className="gm-card px-4 py-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-3">
          {isEmpty ? (
            <div className="text-[12px] text-slate-500">検索して投稿を探す</div>
          ) : (
            <div className="flex items-center gap-2">
              {committedMode === "station" ? (
                <TrainFront size={18} className="text-slate-700" />
              ) : null}
              <div className="text-sm font-semibold text-slate-900">{titleText}</div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:w-[520px]">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            {/* 枠内にチップ+input */}
            <div className="flex items-center gap-2 w-full rounded-full border border-black/10 bg-white px-10 pr-10 py-2.5 focus-within:border-orange-200">
              {/* 駅プレート */}
              {stationPlaceId && stationName ? (
                <div className="shrink-0 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">
                  <TrainFront size={16} className="opacity-80" />
                  <span className="max-w-[160px] truncate">{stationName}</span>
                  <button
                    type="button"
                    onClick={() => clearStation({ commit: true })}
                    className="grid h-5 w-5 place-items-center rounded-full hover:bg-black/5"
                    aria-label="駅を外す"
                  >
                    <X size={14} className="opacity-70" />
                  </button>
                </div>
              ) : null}

              {/* GENREチップ */}
              {genre ? (
                <div className="shrink-0 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-800">
                  <span className="max-w-[140px] truncate">{genre}</span>
                  <button
                    type="button"
                    onClick={() => clearGenre({ commit: true })}
                    className="grid h-5 w-5 place-items-center rounded-full hover:bg-black/5"
                    aria-label="ジャンルを外す"
                  >
                    <X size={14} className="opacity-70" />
                  </button>
                </div>
              ) : null}

              {/* 自由入力 */}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (!stationPlaceId) setMode("geo");
                }}
                onFocus={() => {
                  if (!stationPlaceId && suggests.length > 0) setSuggestOpen(true);
                }}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
                placeholder={
                  stationPlaceId
                    ? "食べたいもの / 用途（例：デート）"
                    : "東京 焼肉 / 名古屋駅"
                }
                className="w-full bg-transparent text-base font-medium outline-none"
                inputMode="search"
                enterKeyHint="search"
                onKeyDown={(e) => {
                  if (e.key === "Enter") enterToSearch("enter");
                  if (e.key === "Escape") setSuggestOpen(false);
                  handleChipDeleteKey(e);
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => enterToSearch("icon")}
              aria-label="Search"
              className="absolute right-3 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <Search size={16} />
            </button>

            {/* Station Suggest dropdown */}
            {!stationPlaceId && suggestOpen && q.trim() && suggests.length > 0 ? (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg">
                <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-black/5">
                  駅候補（選ぶと駅プレートが固定されます）
                  {suggestLoading ? <span className="ml-2 text-slate-400">…</span> : null}
                </div>
                <div className="max-h-[320px] overflow-auto">
                  {suggests.map((s, idx) => (
                    <button
                      key={s.station_place_id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectStation(s, idx)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2">
                          <TrainFront size={16} className="text-slate-700 shrink-0" />
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {s.station_name}
                          </div>
                        </div>

                        {typeof s.count_places === "number" ? (
                          <div className="shrink-0 text-[11px] text-slate-500">
                            {s.count_places}件
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 select-none">
            <input
              type="checkbox"
              checked={followOnly}
              onChange={(e) => toggleFollow(e.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            フォローしている人のみ
          </label>
        </div>

        {/* GENREボタン */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`gm-chip px-3 py-1.5 text-[12px] ${
              genre ? "text-slate-600" : "text-slate-900 font-semibold"
            }`}
            onClick={() => {
              // ✅ “すべて” も即反映＆即検索（＝genre解除）
              setGenre("");
              commitSearch({
                q,
                genre: "",
                follow: followOnly,
                mode,
                sid: stationPlaceId,
                sname: stationName,
                source: "clear_genre",
              });
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            すべて
          </button>

          {GENRES.map((g) => {
            const active = genre === g;
            return (
              <button
                key={g}
                type="button"
                className={`gm-chip px-3 py-1.5 text-[12px] ${
                  active ? "text-orange-800 font-semibold" : "text-slate-700"
                }`}
                onClick={() => {
                  // ✅ 押した瞬間に URL反映＆検索更新
                  setGenre(g);
                  commitSearch({
                    q,
                    genre: g,
                    follow: followOnly,
                    mode,
                    sid: stationPlaceId,
                    sname: stationName,
                    source: "genre",
                  });
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              >
                {g}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Body */}
      {isEmpty ? (
        <div className="space-y-3">
          {/* ✅ “開いた感” を先に出す */}
          <AnimatePresence mode="wait">
            {!showDiscover ? (
              <motion.div key="empty-splash" {...fadeUp} className="gm-card px-4 py-6">
                <div className="text-sm font-semibold text-slate-900">すぐ検索できます</div>
                <div className="mt-2 text-xs text-slate-500">
                  入力すると結果が表示されます。おすすめ投稿はあとから読み込みます…
                </div>
                <div className="mt-4">
                  <Skeleton height={10} width={220} />
                  <div className="mt-2">
                    <Skeleton height={10} width={160} />
                  </div>
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
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Users
              </div>

              <motion.div
                className="flex flex-col gap-2"
                variants={listStagger}
                initial="initial"
                animate="animate"
              >
                {users.map((u) => {
                  const name = u.display_name ?? u.username ?? "ユーザー";
                  const handle = u.username ? `@${u.username}` : "";
                  const initial = (name || "U").slice(0, 1).toUpperCase();

                  return (
                    <motion.div key={u.id} variants={fadeUp}>
                      <Link
                        href={`/u/${u.id}`}
                        className="gm-press flex items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2"
                      >
                        <div className="h-10 w-10 overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700 flex items-center justify-center">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt="" className="h-10 w-10 object-cover" />
                          ) : (
                            initial
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                            {handle ? <div className="truncate text-xs text-slate-500">{handle}</div> : null}
                          </div>
                          {u.bio ? <div className="truncate text-xs text-slate-600">{u.bio}</div> : null}
                        </div>

                        <div className="text-xs text-orange-600 font-semibold">見る</div>
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
              <TimelinePostList
                posts={posts}
                meId={meId}
                mode={committedMode}
                searchedStationName={searchedStationName}
                revealImages={true}
              />
            </motion.div>
          ) : null}

          <div ref={sentinelRef} className="h-10" />

          {loading && posts.length > 0 && (
            <motion.div {...fadeUp} className="pb-8">
              <div className="text-center text-xs text-slate-500">読み込み中...</div>
              <div className="mt-3">
                <Skeleton height={10} />
                <div className="mt-2">
                  <Skeleton height={10} />
                </div>
              </div>
            </motion.div>
          )}

          {error && !error.includes("Unauthorized") && (
            <motion.div {...fadeUp} className="pb-8 text-center text-xs text-red-600">
              {error}
            </motion.div>
          )}

          {done && posts.length > 0 && (
            <motion.div {...fadeUp} className="pb-8 text-center text-[11px] text-slate-400">
              これ以上ありません
            </motion.div>
          )}

          {!loading && posts.length === 0 && !error && (
            <motion.div {...fadeUp} className="py-10 text-center text-xs text-slate-500">
              該当する投稿がありません。
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
