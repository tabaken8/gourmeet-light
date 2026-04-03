// src/app/(app)/search/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { HelpCircle, MapPin as MapPinIcon, Search, Sparkles, TrainFront, X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { motion, AnimatePresence } from "framer-motion";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

import TimelineFeed from "@/components/TimelineFeed";
import SearchPostList, { PostRow, SearchMode } from "@/components/search/SearchPostList";
import SearchZeroResultsNudge from "@/components/SearchZeroResultsNudge";
import LocationFilter from "@/components/search/LocationFilter";
import GenreFilter from "@/components/search/GenreFilter";
import MapPostCard from "@/components/search/MapPostCard";
import type { MapBounds, MapPost } from "@/components/search/SearchMap";

const SearchMap = dynamic(() => import("@/components/search/SearchMap"), { ssr: false });

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
    <div className="px-3 py-2">
      <div className="mb-2 text-[11px] font-medium text-slate-400">Users</div>
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
        <div key={i} className="border-b border-slate-100 px-3 py-3">
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

  // --- @mention サジェスト ---
  const [mentionSuggestions, setMentionSuggestions] = useState<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- ヒントパネル ---
  const [hintsOpen, setHintsOpen] = useState(false);

  // --- location ---
  const [mode, setMode] = useState<SearchMode>("geo");
  const [stationPlaceId, setStationPlaceId] = useState<string | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);

  // --- 結果モード（ユーザーが選ぶのではなく自動決定）---
  // "ai"      = テキスト/ジャンルあり → セマンティック検索
  // "keyword" = 駅のみ → キーワード検索（ブラウズ）
  const [resultMode, setResultMode] = useState<"ai" | "keyword" | null>(null);

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

  // AI 検索結果 - キーワード結果とは別管理
  const [semanticPosts, setSemanticPosts] = useState<PostRow[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  // LLM の返答テキスト
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  // 検索クエリ解析結果（意図・地名・メンション）
  const [parsedIntent, setParsedIntent] = useState<string | null>(null);
  // クエリから自動検出された駅情報（複数対応）
  const [detectedStations, setDetectedStations] = useState<{ name: string; placeId: string }[]>([]);
  // クエリから自動検出されたユーザー情報
  const [detectedAuthor, setDetectedAuthor] = useState<{ username: string; displayName: string | null } | null>(null);
  const [mentionNotFound, setMentionNotFound] = useState(false);

  // --- placeholder / ヒント用にフォロー中ユーザーを最大2人保持 ---
  const [placeholderMentions, setPlaceholderMentions] = useState<[string | null, string | null]>([null, null]);
  const [isMobile, setIsMobile] = useState(false);

  // --- empty 時の遅延描画 ---
  const [showDiscover, setShowDiscover] = useState(false);

  // --- map ---
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [geoMode, setGeoMode] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedMapPost, setSelectedMapPost] = useState<MapPost | null>(null);
  const [areaSearchLoading, setAreaSearchLoading] = useState(false);
  const [quickPosts, setQuickPosts] = useState<PostRow[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);

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

  // ---- モバイル判定（リサイズ追跡）----
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ---- placeholder / ヒント用にフォロー中ユーザーを最大2人取得（1回だけ）----
  useEffect(() => {
    let alive = true;
    fetch("/api/follows/suggest?limit=10")
      .then((r) => r.json().catch(() => ({})))
      .then((payload) => {
        if (!alive) return;
        const users: { username: string | null }[] = Array.isArray(payload?.users) ? payload.users : [];
        const pool = users.filter((u) => u.username);
        if (!pool.length) return;
        // シャッフルして先頭2人を取る
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        setPlaceholderMentions([
          shuffled[0]?.username ?? null,
          shuffled[1]?.username ?? null,
        ]);
      })
      .catch(() => {});
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

  // -------- AI チャット検索（tool use ループ）--------
  async function loadAiChat(args: {
    q: string;
    follow: boolean;
    stationId: string | null;
    stationName: string | null;
    genre: string;
  }) {
    const q = args.q.trim();
    const genre = args.genre.trim();
    const combined = [genre, q].filter(Boolean).join(" ");
    if (!combined) return;

    setSemanticLoading(true);
    setSemanticError(null);
    setSemanticPosts([]);
    setAiMessage(null);
    setParsedIntent(null);
    setDetectedStations([]);
    setDetectedAuthor(null);
    setMentionNotFound(false);

    try {
      // 明示的に選ばれた駅があればクエリに含める
      const queryText = args.stationId
        ? combined
        : combined;

      const res = await fetch("/api/search/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: queryText,
          follow: args.follow,
          // 明示的な駅指定は LLM に伝えず stationId として別途渡す方式も可だが
          // 自然言語クエリ内に地名があれば LLM が自動解決するのでこのまま
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Error ${res.status}`);

      setSemanticPosts(Array.isArray(payload?.posts) ? payload.posts : []);
      setQuickPosts([]); // AI results replace quick results
      if (payload?.message) setAiMessage(payload.message);
      if (Array.isArray(payload?.detectedStations)) setDetectedStations(payload.detectedStations);
      if (payload?.detectedAuthor) setDetectedAuthor(payload.detectedAuthor);
      if (payload?.parsedQuery?.intent) setParsedIntent(payload.parsedQuery.intent);
      else setParsedIntent(null);
    } catch (e: any) {
      setSemanticError(e?.message ?? "AI検索に失敗しました");
    } finally {
      setSemanticLoading(false);
    }
  }

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

    setGeoMode(false);
    setSelectedMapPost(null);
    setUsers([]);
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);
    setNudge(null);
    setSemanticPosts([]);
    setSemanticLoading(false);
    setSemanticError(null);
    setQuickPosts([]);
    setQuickLoading(false);
    setAiMessage(null);
    setParsedIntent(null);
    setDetectedStations([]);
    setDetectedAuthor(null);
    setMentionNotFound(false);

    if (mm !== "station" && !nq && !ng) return;
    if (mm === "station" && !next.sid) return;

    // テキスト or ジャンルがあれば AI 検索、駅のみならキーワード検索
    if (nq || ng) {
      setResultMode("ai");
      if (nq) loadUsers(nq);

      // Quick pre-search: fire fast index search in parallel with AI
      const combined = [ng, nq].filter(Boolean).join(" ");
      if (combined) {
        setQuickLoading(true);
        fetch(`/api/search?quick=1&q=${encodeURIComponent(combined)}&limit=20`)
          .then((r) => r.json().catch(() => ({})))
          .then((payload) => {
            const qp: PostRow[] = Array.isArray(payload?.posts) ? payload.posts : [];
            setQuickPosts(qp);
          })
          .catch(() => setQuickPosts([]))
          .finally(() => setQuickLoading(false));
      }

      loadAiChat({ q: nq, genre: ng, follow: next.follow, stationId: next.sid ?? null, stationName: next.sname ?? null });
    } else {
      // 駅のみ → キーワードブラウズ
      setResultMode("keyword");
      loadMoreWith({ mode: mm, stationId: next.sid ?? null, stationName: next.sname ?? null, follow: next.follow, q: nq, genre: ng }, true);
    }
  };

  // -------- bbox検索 (このエリアで検索) --------
  const handleSearchThisArea = useCallback(async (bounds: MapBounds) => {
    setAreaSearchLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        bbox_north: String(bounds.north),
        bbox_south: String(bounds.south),
        bbox_east: String(bounds.east),
        bbox_west: String(bounds.west),
        limit: "50",
      });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/search?${params}`);
      const payload = await res.json().catch(() => ({}));
      if (payload?.posts && Array.isArray(payload.posts)) {
        setPosts(payload.posts);
        setResultMode(q.trim() ? "ai" : "keyword");
        setSemanticPosts(q.trim() ? payload.posts : []);
      }
    } catch {
      setError("\u691C\u7D22\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
    } finally {
      setAreaSearchLoading(false);
    }
  }, [q]);

  // -------- 現在地から探す (Plan C) --------
  const geoRetryRef = useRef(0);
  const handleSearchFromLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3067\u306F\u4F4D\u7F6E\u60C5\u5831\u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);

    // 1回目は高精度、リトライ時は低精度（GPSなしでもWi-Fi/基地局で取得）
    const isRetry = geoRetryRef.current > 0;
    const opts: PositionOptions = isRetry
      ? { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
      : { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        setGeoMode(true);
        setGeoLoading(false);
        geoRetryRef.current = 0;

        // Auto-search area around user location (~1km box)
        const delta = 0.008; // ~800m
        const autoBounds: MapBounds = {
          north: loc[0] + delta,
          south: loc[0] - delta,
          east: loc[1] + delta,
          west: loc[1] - delta,
        };
        handleSearchThisArea(autoBounds);
      },
      (err) => {
        setGeoLoading(false);
        console.warn("[geo] error:", err.code, err.message);

        if (err.code === 1 /* PERMISSION_DENIED */) {
          setGeoError(
            "\u4F4D\u7F6E\u60C5\u5831\u304C\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\n" +
            "iPhone: \u300C\u8A2D\u5B9A\u300D\u2192\u300C\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC\u3068\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u300D\u2192\u300C\u4F4D\u7F6E\u60C5\u5831\u30B5\u30FC\u30D3\u30B9\u300D\u2192 Safari\u3092\u8A31\u53EF"
          );
        } else if (err.code === 3 /* TIMEOUT */ && !isRetry) {
          // タイムアウト → 低精度でリトライ
          geoRetryRef.current += 1;
          handleSearchFromLocation();
        } else {
          setGeoError(
            "\u4F4D\u7F6E\u60C5\u5831\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\n" +
            "\u300C\u8A2D\u5B9A\u300D\u2192\u300C\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC\u3068\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u300D\u2192\u300C\u4F4D\u7F6E\u60C5\u5831\u30B5\u30FC\u30D3\u30B9\u300D\u304C\u30AA\u30F3\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044"
          );
        }
      },
      opts
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSearchThisArea]);

  // -------- 地図スコープ内キーワード検索 --------
  const handleScopedSearch = useCallback(async (keyword: string, bounds: MapBounds) => {
    setAreaSearchLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        bbox_north: String(bounds.north),
        bbox_south: String(bounds.south),
        bbox_east: String(bounds.east),
        bbox_west: String(bounds.west),
        q: keyword,
        limit: "50",
      });
      const res = await fetch(`/api/search?${params}`);
      const payload = await res.json().catch(() => ({}));
      if (payload?.posts && Array.isArray(payload.posts)) {
        setPosts(payload.posts);
        setResultMode("keyword");
        setSemanticPosts([]);
      }
    } catch {
      setError("\u691C\u7D22\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
    } finally {
      setAreaSearchLoading(false);
    }
  }, []);

  // -------- @mention サジェスト --------
  const fetchMentionSuggestions = useCallback((partial: string) => {
    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    mentionTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/follows/suggest?q=${encodeURIComponent(partial)}&limit=8`);
        const payload = await res.json().catch(() => ({}));
        const users = Array.isArray(payload?.users) ? payload.users : [];
        setMentionSuggestions(users);
        setMentionOpen(users.length > 0);
      } catch {
        setMentionOpen(false);
      }
    }, 120);
  }, []);

  const handleQChange = (value: string) => {
    setQ(value);
    // 入力末尾が @xxx の形式なら mention サジェストを起動
    const match = value.match(/@([\w]*)$/);
    if (match) {
      fetchMentionSuggestions(match[1]);
    } else {
      setMentionOpen(false);
    }
  };

  const selectMention = (username: string) => {
    // 末尾の @partial を @username に置換してスペースを追加
    const next = q.replace(/@[\w]*$/, `@${username} `);
    setQ(next);
    setMentionOpen(false);
    setMentionSuggestions([]);
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

  // -------- Infinite scroll（キーワードモードのみ）--------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || isEmpty || resultMode !== "keyword") return;
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
  }, [cursor, done, loading, isEmpty, resultMode, committedQ, committedFollow, committedMode, committedStationId, committedGenre]);

  // -------- 検索 placeholder --------
  const searchPlaceholder = useMemo(() => {
    const m = placeholderMentions[0] ? `@${placeholderMentions[0]}` : "@友達";
    if (isMobile) return `渋谷でランチ、${m} のラーメン…`;
    return `なんでも。渋谷で軽くランチ、記念日向きの雰囲気のいいフレンチ、${m} のおすすめラーメン…`;
  }, [placeholderMentions, isMobile]);

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
      <motion.div className="px-2 py-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

        {/* タイトル */}
        {!isEmpty && (
          <div className="flex items-center gap-2 mb-2 px-1">
            {committedMode === "station" && <TrainFront size={14} className="shrink-0 text-slate-500" />}
            <p className="text-[13px] font-medium text-slate-700">{titleText}</p>
          </div>
        )}

        {/* 検索入力 */}
        <div className="relative w-full">
          <Sparkles
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => handleQChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setMentionOpen(false); handleSearch(); }
              if (e.key === "Escape") setMentionOpen(false);
            }}
            onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-18 text-[16px] font-normal outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100 leading-tight"
            inputMode="search"
            enterKeyHint="search"
          />
          {/* ヒントボタン */}
          <button
            type="button"
            onClick={() => setHintsOpen((v) => !v)}
            aria-label="検索ヒント"
            className={`absolute right-9 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full transition hover:bg-slate-100 ${hintsOpen ? "text-orange-500" : "text-slate-400"}`}
          >
            <HelpCircle size={15} />
          </button>
          <button
            type="button"
            onClick={handleSearch}
            aria-label="検索"
            className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Search size={15} />
          </button>

          {/* @mention サジェストドロップダウン */}
          {mentionOpen && mentionSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-lg">
              {mentionSuggestions.map((u) => {
                const name = u.display_name ?? u.username ?? "";
                const initial = (name || "U").slice(0, 1).toUpperCase();
                return (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={() => selectMention(u.username ?? "")}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700">
                      {u.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={u.avatar_url} alt="" className="h-8 w-8 object-cover" />
                        : initial}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                      {u.username && <div className="text-xs text-slate-500">@{u.username}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ヒントパネル */}
        <AnimatePresence>
          {hintsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-orange-700">✨ こんな検索ができます</span>
                  <button type="button" onClick={() => setHintsOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
                </div>
                <ul className="space-y-1.5 text-slate-600">
                  <li><span className="font-medium text-slate-800">渋谷で軽くランチ</span> — 地名 + 気分で検索</li>
                  <li><span className="font-medium text-slate-800">記念日向きの雰囲気のいいフレンチ</span> — 自然な言葉でOK</li>
                  <li><span className="font-medium text-slate-800">{placeholderMentions[0] ? `@${placeholderMentions[0]}` : "@友達"} のおすすめラーメン</span> — フォロー中の人の投稿に絞れる</li>
                  <li><span className="font-medium text-slate-800">{placeholderMentions[1] ?? placeholderMentions[0] ? `@${placeholderMentions[1] ?? placeholderMentions[0]}` : "@知り合い"} の東京駅近くのカフェ</span> — 地名 + ユーザー指定の組み合わせも可</li>
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
          {/* 現在地から探すボタン */}
          <div className="px-3 pt-2">
            <button
              type="button"
              onClick={handleSearchFromLocation}
              disabled={geoLoading}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:scale-[0.97] transition disabled:opacity-50"
            >
              <MapPinIcon size={15} className="text-blue-500" />
              {geoLoading ? "\u4F4D\u7F6E\u60C5\u5831\u3092\u53D6\u5F97\u4E2D\u2026" : "\u73FE\u5728\u5730\u304B\u3089\u63A2\u3059"}
            </button>
            {geoError && (
              <p className="mt-2 text-xs text-red-500 whitespace-pre-line">{geoError}</p>
            )}
          </div>

          {/* geoMode: 現在地マップ */}
          {geoMode && (
            <div className="space-y-0">
              <div className="px-2 pb-1">
                <SearchMap
                  posts={posts}
                  userLocation={userLocation}
                  onSearchThisArea={handleSearchThisArea}
                  showSearchButton={true}
                  onSelectPost={(p) => setSelectedMapPost(p)}
                  selectedPostId={selectedMapPost?.id ?? null}
                  loading={areaSearchLoading}
                  onScopedSearch={handleScopedSearch}
                />
              </div>
              {selectedMapPost && (
                <MapPostCard
                  post={selectedMapPost}
                  onClose={() => setSelectedMapPost(null)}
                />
              )}
              {posts.length > 0 && (
                <motion.div {...fadeUp}>
                  <SearchPostList posts={posts} meId={meId} mode="geo" searchedStationName={null} revealImages={true} />
                </motion.div>
              )}
            </div>
          )}

          {!geoMode && (
            <AnimatePresence mode="wait">
              {!showDiscover ? (
                <motion.div key="empty-splash" {...fadeUp} className="px-3 py-2">
                  <div className="text-xs text-slate-500">
                    {"\u30AD\u30FC\u30EF\u30FC\u30C9\u5165\u529B\u30FB\u99C5\u9078\u629E\u30FB\u30B8\u30E3\u30F3\u30EB\u9078\u629E\u3067\u3082\u691C\u7D22\u3067\u304D\u307E\u3059"}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="discover" {...fadeUp}>
                  <TimelineFeed activeTab="discover" meId={meId} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      ) : (
        <div className="space-y-0">
          {/* Users */}
          {usersLoading ? (
            <UsersSkeleton />
          ) : users.length > 0 ? (
            <motion.section className="px-3 py-2" {...fadeUp}>
              <div className="mb-2 text-[11px] font-medium text-slate-400">Users</div>
              <motion.div className="flex flex-col gap-1.5" variants={listStagger} initial="initial" animate="animate">
                {users.map((u) => {
                  const name = u.display_name ?? u.username ?? "\u30E6\u30FC\u30B6\u30FC";
                  const handle = u.username ? `@${u.username}` : "";
                  const initial = (name || "U").slice(0, 1).toUpperCase();
                  return (
                    <motion.div key={u.id} variants={fadeUp}>
                      <Link href={`/u/${u.id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50">
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
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
                        <div className="text-xs font-semibold text-orange-600">{"\u898B\u308B"}</div>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.section>
          ) : null}

          {/* ===== 地図（常にトップ表示） ===== */}
          {((resultMode === "ai" && (semanticPosts.length > 0 || quickPosts.length > 0)) ||
            (resultMode === "keyword" && posts.length > 0)) && (
            <div className="px-2 pb-1">
              <SearchMap
                posts={resultMode === "ai" ? (semanticPosts.length > 0 ? semanticPosts : quickPosts) : posts}
                userLocation={userLocation}
                onSearchThisArea={handleSearchThisArea}
                showSearchButton={true}
                onSelectPost={(p) => setSelectedMapPost(p)}
                selectedPostId={selectedMapPost?.id ?? null}
                loading={areaSearchLoading}
                onScopedSearch={handleScopedSearch}
              />
            </div>
          )}

          {/* ===== 選択中の投稿カード（地図とリストの間） ===== */}
          {selectedMapPost && (
            <MapPostCard
              post={selectedMapPost}
              onClose={() => setSelectedMapPost(null)}
            />
          )}

          {/* ===== AI 検索結果 ===== */}
          {resultMode === "ai" && (
            <>
              {semanticLoading && (
                <>
                  {/* Quick results shown while AI is thinking */}
                  {quickPosts.length > 0 && (
                    <motion.div {...fadeUp}>
                      <div className="px-2 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5">
                        <span>{"\u30AF\u30A4\u30C3\u30AF\u7D50\u679C"}</span>
                        <span className="text-slate-300">{"\u00B7"}</span>
                        <span>{quickPosts.length}{"\u4EF6"}</span>
                        <span className="text-slate-300">{"\u00B7"}</span>
                        <span className="text-orange-400">{"\u2728 AI\u691C\u7D22\u4E2D\u2026"}</span>
                      </div>
                      <SearchPostList posts={quickPosts} meId={meId} mode={committedMode} searchedStationName={searchedStationName} revealImages={true} />
                    </motion.div>
                  )}
                  {quickPosts.length === 0 && (
                    <motion.div
                      key="ai-thinking"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-3 py-20"
                    >
                      <div className="flex items-center gap-3 text-2xl">
                        {["\uD83C\uDF5C", "\uD83C\uDF63", "\uD83C\uDF5B", "\uD83C\uDF70", "\uD83C\uDF54"].map((emoji, i) => (
                          <motion.span
                            key={i}
                            animate={{ y: [0, -8, 0] }}
                            transition={{ duration: 0.6, delay: i * 0.12, repeat: Infinity, repeatDelay: 1.8 }}
                          >
                            {emoji}
                          </motion.span>
                        ))}
                      </div>
                      <p className="text-[13px] text-slate-400">{"\u304A\u3044\u3057\u3044\u6295\u7A3F\u3092\u63A2\u3057\u3066\u3044\u307E\u3059\u2026"}</p>
                    </motion.div>
                  )}
                </>
              )}
              {!semanticLoading && semanticError && (
                <motion.div {...fadeUp} className="pb-8 text-center text-xs text-red-600">
                  {semanticError}
                </motion.div>
              )}
              {!semanticLoading && semanticPosts.length > 0 && (
                <motion.div {...fadeUp}>
                  {/* 検索理解バナー: 駅 + 意図 + @mention を1行で */}
                  {(detectedStations.length > 0 || parsedIntent || detectedAuthor) && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 px-2 py-1.5 text-[11px] text-slate-500">
                      {detectedStations.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                          <TrainFront size={10} className="shrink-0" />
                          {detectedStations.map((s) => s.name.endsWith("\u99C5") ? s.name : `${s.name}\u99C5`).join("\u30FB")}{"\u5468\u8FBA"}
                        </span>
                      )}
                      {detectedAuthor && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                          @{detectedAuthor.username}{detectedAuthor.displayName ? `\uFF08${detectedAuthor.displayName}\uFF09` : ""}
                        </span>
                      )}
                      {parsedIntent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                          {"\u300C"}{parsedIntent}{"\u300D"}{"\u3067\u691C\u7D22"}
                        </span>
                      )}
                      <span className="text-slate-400">{"\u00B7"}</span>
                      <span className="text-slate-400">{semanticPosts.length}{"\u4EF6"}</span>
                    </div>
                  )}
                  <SearchPostList posts={semanticPosts} meId={meId} mode={committedMode} searchedStationName={searchedStationName} revealImages={true} showRanks={true} />
                </motion.div>
              )}
              {!semanticLoading && !semanticError && semanticPosts.length === 0 && (
                <motion.div {...fadeUp} className="py-6 text-center text-xs text-slate-500">
                  {mentionNotFound
                    ? `@${committedQ.match(/@([\w]+)/)?.[1] ?? "..."} \u3068\u3044\u3046\u30E6\u30FC\u30B6\u30FC\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002`
                    : "\u8A72\u5F53\u3059\u308B\u6295\u7A3F\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002"}
                </motion.div>
              )}
            </>
          )}

          {/* ===== キーワード検索結果（駅のみブラウズ）===== */}
          {resultMode === "keyword" && (
            <>
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
                  <div className="text-center text-xs text-slate-500">{"\u8AAD\u307F\u8FBC\u307F\u4E2D..."}</div>
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
                <motion.div {...fadeUp} className="pb-8 text-center text-[11px] text-slate-400">{"\u3053\u308C\u4EE5\u4E0A\u3042\u308A\u307E\u305B\u3093"}</motion.div>
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
                  <div className="py-6 text-center text-xs text-slate-500">{"\u8A72\u5F53\u3059\u308B\u6295\u7A3F\u304C\u3042\u308A\u307E\u305B\u3093\u3002"}</div>
                </motion.div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
