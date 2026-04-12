// src/app/(app)/search/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Compass, HelpCircle, MapPin as MapPinIcon, Search, Sparkles, TrainFront, X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTranslations } from "next-intl";
import { normalizeQuery } from "@/lib/queryNormalizer";

import { motion, AnimatePresence } from "framer-motion";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

import TimelineFeed from "@/components/TimelineFeed";
import type { PostRow, SearchMode } from "@/components/search/SearchPostList";
import SearchZeroResultsNudge from "@/components/SearchZeroResultsNudge";
import LocationFilter from "@/components/search/LocationFilter";
import GenreFilter from "@/components/search/GenreFilter";
import MapPostCardCarousel from "@/components/search/MapPostCard";
import type { MapBounds, MapPost } from "@/components/search/SearchMap";
import PersonCardCarousel from "@/components/discover/PersonCard";
import type { PersonMapItem, PeopleMapResponse } from "@/app/api/people-map/route";

const SearchMap = dynamic(() => import("@/components/search/SearchMap"), { ssr: false });
const PeopleMap = dynamic(() => import("@/components/discover/PeopleMap"), { ssr: false });

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

// ---------- sessionStorage cache ----------
const SEARCH_CACHE_KEY = "gourmeet_search_cache";

type SearchCache = {
  url: string; // search param string for matching
  semanticPosts: PostRow[];
  posts: PostRow[];
  users: UserHit[];
  aiMessage: string | null;
  parsedIntent: string | null;
  detectedStations: { name: string; placeId: string }[];
  detectedAuthor: { username: string; displayName: string | null } | null;
  resultMode: "ai" | "keyword" | null;
  ts: number;
};

function saveSearchCache(cache: SearchCache) {
  try {
    sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage full – ignore */ }
}

function loadSearchCache(url: string): SearchCache | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_KEY);
    if (!raw) return null;
    const cache: SearchCache = JSON.parse(raw);
    // Must match URL and be less than 10 minutes old
    if (cache.url !== url) return null;
    if (Date.now() - cache.ts > 10 * 60 * 1000) return null;
    return cache;
  } catch {
    return null;
  }
}

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
      <div className="mb-2 text-[11px] font-medium text-slate-400 dark:text-gray-500">Users</div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[.04] px-3 py-2">
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
        <div key={i} className="border-b border-slate-100 dark:border-white/[.06] px-3 py-3">
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
  const t = useTranslations("search");
  const tc = useTranslations("common");
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

  // --- people map (discover) ---
  const [peoplePeople, setPeoplePeople] = useState<PersonMapItem[]>([]);
  const [peopleCentroid, setPeopleCentroid] = useState<{ lat: number; lng: number } | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // --- デフォルト表示（未ログイン / follow 0 / people 空） ---
  const [defaultPosts, setDefaultPosts] = useState<PostRow[]>([]);
  const [defaultLoading, setDefaultLoading] = useState(false);

  // --- AI search timing ---
  const [aiSearchStartedAt, setAiSearchStartedAt] = useState<number | null>(null);

  // --- map / 地図スコープ固定 ---
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [scopedBounds, setScopedBounds] = useState<MapBounds | null>(null);
  const [scopedStation, setScopedStation] = useState<{ placeId: string; name: string } | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
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

  // ---- people map データ取得（1回だけ）----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/people-map");
        if (!res.ok) throw new Error("Failed to fetch");
        const data: PeopleMapResponse = await res.json();
        if (!alive) return;
        setPeoplePeople(data.people ?? []);
        setPeopleCentroid(data.my_centroid ?? null);
      } catch {
        // silently fail — discover section just won't show
      } finally {
        if (alive) setPeopleLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // peoplePeople が空の時、本郷エリアのデフォルト投稿を取得
  const HONGO_CENTER = { lat: 35.7128, lng: 139.7603 };
  const HONGO_BOUNDS: MapBounds = {
    north: 35.73, south: 35.69, east: 139.78, west: 139.74,
  };
  useEffect(() => {
    if (peopleLoading || peoplePeople.length > 0) return;
    let alive = true;
    setDefaultLoading(true);
    const params = new URLSearchParams({
      bbox_north: String(HONGO_BOUNDS.north),
      bbox_south: String(HONGO_BOUNDS.south),
      bbox_east: String(HONGO_BOUNDS.east),
      bbox_west: String(HONGO_BOUNDS.west),
      limit: "30",
    });
    fetch(`/api/search?${params}`)
      .then((r) => r.json().catch(() => ({})))
      .then((payload) => {
        if (!alive) return;
        const posts: PostRow[] = Array.isArray(payload?.posts) ? payload.posts : [];
        setDefaultPosts(posts);
      })
      .catch(() => {})
      .finally(() => { if (alive) setDefaultLoading(false); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleLoading, peoplePeople.length]);

  const handleSelectPerson = useCallback((userId: string | null) => {
    setSelectedUserId(userId);
  }, []);

  const handleCardSelect = useCallback((userId: string) => {
    setSelectedUserId(userId);
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
  const cacheRestoredRef = useRef(false);
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

    // Restore cached results on back-navigation (first mount only)
    if (!cacheRestoredRef.current) {
      cacheRestoredRef.current = true;
      const cacheUrl = sp.toString();
      if (cacheUrl) {
        const cached = loadSearchCache(cacheUrl);
        if (cached) {
          setSemanticPosts(cached.semanticPosts);
          setPosts(cached.posts);
          setUsers(cached.users);
          setAiMessage(cached.aiMessage);
          setParsedIntent(cached.parsedIntent);
          setDetectedStations(cached.detectedStations);
          setDetectedAuthor(cached.detectedAuthor);
          setResultMode(cached.resultMode);
          setDone(true);
          return; // skip re-fetching
        }
        // No cache — re-trigger search if URL has search params
        const hasSearch = qFromUrl || genreFromUrl || (modeFromUrl === "station" && stationIdFromUrl);
        if (hasSearch) {
          // Defer so state is committed first
          setTimeout(() => {
            commitSearch({
              q: qFromUrl,
              follow: followFromUrl,
              mode: modeFromUrl,
              sid: stationIdFromUrl,
              sname: stationNameFromUrl,
              genre: genreFromUrl,
            });
          }, 0);
          return;
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, sp]);

  // ---- 検索結果をsessionStorageにキャッシュ ----
  useEffect(() => {
    if (!mounted) return;
    const url = sp.toString();
    if (!url) return;
    // Only cache when we have actual results and are not loading
    const hasSemantic = semanticPosts.length > 0;
    const hasKeyword = posts.length > 0;
    if (!hasSemantic && !hasKeyword) return;
    if (semanticLoading || loading) return;

    saveSearchCache({
      url,
      semanticPosts,
      posts,
      users,
      aiMessage,
      parsedIntent,
      detectedStations,
      detectedAuthor,
      resultMode,
      ts: Date.now(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, semanticPosts, posts, users, semanticLoading, loading]);

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
    if (!q && !genre) return;

    setSemanticLoading(true);
    setSemanticError(null);
    setSemanticPosts([]);
    setAiMessage(null);
    setParsedIntent(null);
    setDetectedStations([]);
    setDetectedAuthor(null);
    setMentionNotFound(false);
    setHintsOpen(false);

    try {
      const res = await fetch("/api/search/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q,
          follow: args.follow,
          // チップで明示的に選ばれたジャンル（テキストとは分離）
          genre: genre || undefined,
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
      // クエリ内のジャンルを自動選択（例: "東京 和食" → 和食チップ選択）
      const detectedGenre = payload?.parsedQuery?.genre;
      if (detectedGenre && typeof detectedGenre === "string" && !args.genre) {
        const match = genreCandidates.find((g) => detectedGenre.includes(g) || g.includes(detectedGenre));
        if (match) {
          setGenre(match);
          setCommittedGenre(match);
        }
      }
    } catch (e: any) {
      setSemanticError(e?.message ?? t("aiFailed"));
    } finally {
      setSemanticLoading(false);
      setAiSearchStartedAt(null);
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
      const msg = e?.message ?? t("loadFailed");
      setError(msg);
      if (String(msg).includes("Unauthorized")) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  // -------- 構造化クエリ判定 --------
  // normalizeQuery() で助詞分割 + 装飾語除去 → Fast path 判定

  // -------- デフォルト東京スコープ（地理情報なし時） --------
  const TOKYO_DEFAULT_BOUNDS: MapBounds = {
    north: 35.82, south: 35.55, east: 139.92, west: 139.55,
  };

  // -------- 構造化クエリの fast path 検索 --------
  async function loadStructuredSearch(args: {
    locationToken: string | null;
    genreToken: string | null;
    mentionUser?: string | null;
    follow: boolean;
    bbox?: MapBounds | null;
  }) {
    setSemanticLoading(true);
    setSemanticError(null);
    setSemanticPosts([]);
    setAiMessage(null);
    setQuickPosts([]);
    setHintsOpen(false);

    try {
      const params = new URLSearchParams();

      // 1. 地名があれば → station_place_id を解決 & スコープ固定
      if (args.locationToken) {
        const stationRes = await fetch(`/api/search/suggest/station?q=${encodeURIComponent(args.locationToken)}&limit=1`);
        const stationPayload = await stationRes.json().catch(() => ({}));
        const station = stationPayload?.stations?.[0];

        if (station?.station_place_id) {
          setDetectedStations([{ name: station.station_name, placeId: station.station_place_id }]);
          params.set("station_place_id", station.station_place_id);
          params.set("station_name", station.station_name ?? args.locationToken);
          params.set("radius_m", "3000");

          // 地名検索 → スコープ固定（station ベース）
          // station_place_id を使ってスコープを固定する
          // bbox は不明だが、次のチップ検索時に同じ station で再検索できるようにラベルだけ設定
          setScopeLabel(station.station_name ?? args.locationToken);
          // scopedBounds は station 検索では使わない（station_place_id で直接フィルタ）
          // → scopedStation として別途保持
          setScopedStation({ placeId: station.station_place_id, name: station.station_name ?? args.locationToken });
        }
      } else if (args.bbox) {
        // スコープ固定 or デフォルト東京 → bbox で絞り込み
        params.set("bbox_north", String(args.bbox.north));
        params.set("bbox_south", String(args.bbox.south));
        params.set("bbox_east", String(args.bbox.east));
        params.set("bbox_west", String(args.bbox.west));
      }

      // 2. メンションがあれば author パラメータを設定
      if (args.mentionUser) {
        params.set("author", args.mentionUser);
      }

      // 3. 検索クエリ構築
      const searchQ = [args.genreToken, args.locationToken].filter(Boolean).join(" ");
      if (searchQ) params.set("q", searchQ);
      if (args.follow) params.set("follow", "1");
      params.set("limit", "20");

      const res = await fetch(`/api/search?${params.toString()}`);
      const payload = await res.json().catch(() => ({}));
      const posts: PostRow[] = Array.isArray(payload?.posts) ? payload.posts : [];

      setSemanticPosts(posts);
      if (args.genreToken) {
        setParsedIntent(args.genreToken);
      }
    } catch (e: any) {
      setSemanticError(e?.message ?? "検索に失敗しました");
    } finally {
      setSemanticLoading(false);
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

    // スコープは維持する（ユーザーが×で解除するまで）
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

    // テキスト or ジャンルがあれば検索
    if (nq || ng) {
      setResultMode("ai");
      if (nq) loadUsers(nq);

      // 構造化クエリ判定: 助詞分割 + 装飾語除去で Fast path に回せるか判定
      const nq_result = normalizeQuery(nq, ng, genreCandidates);
      if (nq_result.structured) {
        // Fast path: index検索のみ (~0.5s)
        setAiSearchStartedAt(null);
        // スコープ決定: 地名トークン > 固定station > 固定bbox > デフォルト東京
        let scopeLocation = nq_result.locationToken;
        let scopeBbox: MapBounds | null = null;

        if (nq_result.locationToken) {
          // 新しい地名あり → station 解決 & スコープ更新（loadStructuredSearch 内で処理）
        } else if (scopedStation) {
          // 固定 station あり → 地名トークンとして station 名を使う
          scopeLocation = scopedStation.name;
        } else {
          // bbox スコープ or デフォルト東京
          scopeBbox = scopedBounds ?? TOKYO_DEFAULT_BOUNDS;
        }

        loadStructuredSearch({
          locationToken: scopeLocation,
          genreToken: nq_result.genreToken,
          mentionUser: nq_result.mentionUser,
          follow: next.follow,
          bbox: scopeBbox,
        });
      } else {
        // LLM path: AI検索 (~10s)
        setAiSearchStartedAt(Date.now());

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
      }
    } else {
      // 駅のみ → キーワードブラウズ
      setResultMode("keyword");
      loadMoreWith({ mode: mm, stationId: next.sid ?? null, stationName: next.sname ?? null, follow: next.follow, q: nq, genre: ng }, true);
    }
  };

  // -------- bbox検索 (このエリアで検索) → スコープ固定 --------
  const handleSearchThisArea = useCallback(async (bounds: MapBounds) => {
    setAreaSearchLoading(true);
    setError(null);
    // 「このエリアで検索」→ スコープ固定
    setScopedBounds(bounds);
    if (!scopeLabel) setScopeLabel("このエリア");
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
      setError(t("searchFailed"));
    } finally {
      setAreaSearchLoading(false);
    }
  }, [q, t, scopeLabel]);

  // -------- 現在地から探す (Plan C) --------
  const geoRetryRef = useRef(0);
  const handleSearchFromLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError(t("geoUnavailable"));
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
        setGeoLoading(false);
        geoRetryRef.current = 0;

        // スコープ固定: 現在地 (~1km box)
        const delta = 0.008; // ~800m
        const autoBounds: MapBounds = {
          north: loc[0] + delta,
          south: loc[0] - delta,
          east: loc[1] + delta,
          west: loc[1] - delta,
        };
        setScopedBounds(autoBounds);
        setScopeLabel("現在地");
        // Auto-search: 現在地周辺の全投稿を取得
        handleSearchThisArea(autoBounds);
      },
      (err) => {
        setGeoLoading(false);
        console.warn("[geo] error:", err.code, err.message);

        if (err.code === 1 /* PERMISSION_DENIED */) {
          setGeoError(t("geoPermissionDenied"));
        } else if (err.code === 3 /* TIMEOUT */ && !isRetry) {
          // タイムアウト → 低精度でリトライ
          geoRetryRef.current += 1;
          handleSearchFromLocation();
        } else {
          setGeoError(t("geoFailed"));
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
      setError(t("searchFailed"));
    } finally {
      setAreaSearchLoading(false);
    }
  }, [t]);

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
    // テキスト入力からジャンルを検出し、チップと同期
    const currentText = q.trim();
    const textGenre = genreCandidates.find((g) => g && currentText.includes(g));
    let resolvedGenre = genre;

    if (textGenre) {
      // テキストにジャンルが含まれている → そのジャンルをチップに反映
      resolvedGenre = textGenre;
      setGenre(textGenre);
    } else if (genre && !currentText.includes(genre)) {
      // 以前のチップジャンルがテキストから消えている → チップをクリア
      resolvedGenre = "";
      setGenre("");
    }

    commitSearch({ q: currentText, genre: resolvedGenre, follow: followOnly, mode, sid: stationPlaceId, sname: stationName });
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
    // テキスト内のジャンル名を新しいジャンルに置換、なければ末尾に追加
    let currentQ = q.trim() || committedQ;
    const existingGenre = genreCandidates.find((gc) => gc && currentQ.includes(gc));
    if (g) {
      if (existingGenre) {
        // 既存のジャンル名を新しいジャンルに置換
        currentQ = currentQ.replace(existingGenre, g).replace(/\s{2,}/g, " ").trim();
      } else if (!currentQ.includes(g)) {
        // テキストにジャンル名がない場合は末尾に追加
        currentQ = `${currentQ} ${g}`.trim();
      }
    } else if (existingGenre) {
      // 「すべて」選択時: テキストからジャンル名を除去
      currentQ = currentQ.replace(existingGenre, "").replace(/\s{2,}/g, " ").trim();
    }
    setQ(currentQ);
    commitSearch({ q: currentQ, genre: g, follow: followOnly, mode, sid: stationPlaceId, sname: stationName });
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
    const m = placeholderMentions[0] ? `@${placeholderMentions[0]}` : t("friend");
    if (isMobile) return t("searchPlaceholderMobile", { mention: m });
    return t("searchPlaceholderDesktop", { mention: m });
  }, [placeholderMentions, isMobile, t]);

  // -------- Title --------
  const titleText = useMemo(() => {
    if (isEmpty) return "";
    if (committedMode === "station") {
      const name = committedStationName ?? t("station");
      const g = committedGenre ? ` × ${committedGenre}` : "";
      const qq = committedQ ? `（${committedQ}）` : "";
      return `${t("stationArea", { station: name })}${g}${qq}`;
    }
    // テキストにジャンル名が含まれている場合は重複表示しない
    const g = committedGenre && !committedQ.includes(committedGenre) ? ` × ${committedGenre}` : "";
    return t("searchResults", { query: `${committedQ}${g}` });
  }, [isEmpty, committedMode, committedStationName, committedGenre, committedQ, t]);

  // ============================================================
  return (
    <div className="space-y-4">
      {/* ===== Search Card ===== */}
      <motion.div className="px-2 py-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

        {/* タイトル + 現在地モードバッジ */}
        {!isEmpty && (
          <div className="flex items-center gap-2 mb-2 px-1">
            {committedMode === "station" && <TrainFront size={14} className="shrink-0 text-slate-500" />}
            <p className="text-[13px] font-medium text-slate-700 dark:text-gray-300">{titleText}</p>
            {(scopedBounds || scopedStation) && scopeLabel && (
              <button
                type="button"
                onClick={() => { setScopedBounds(null); setScopedStation(null); setScopeLabel(null); }}
                className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-600 active:scale-[0.97] transition"
              >
                <MapPinIcon size={11} />
                {scopeLabel}
                <X size={11} className="opacity-70" />
              </button>
            )}
          </div>
        )}

        {/* 検索入力 */}
        <div className="relative w-full">
          <Sparkles
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500"
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
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[.06] py-2 pl-9 pr-18 text-[16px] font-normal text-slate-900 dark:text-gray-100 outline-none transition placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:border-slate-300 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/5 leading-tight"
            inputMode="search"
            enterKeyHint="search"
          />
          {/* ヒントボタン */}
          <button
            type="button"
            onClick={() => setHintsOpen((v) => !v)}
            aria-label={t("searchHint")}
            className={`absolute right-9 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full transition hover:bg-slate-100 dark:hover:bg-white/10 ${hintsOpen ? "text-orange-500" : "text-slate-400 dark:text-gray-500"}`}
          >
            <HelpCircle size={15} />
          </button>
          <button
            type="button"
            onClick={handleSearch}
            aria-label={t("search")}
            className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-slate-500 dark:text-gray-400 transition hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-gray-200"
          >
            <Search size={15} />
          </button>

          {/* @mention サジェストドロップダウン */}
          {mentionOpen && mentionSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-black/[.08] dark:border-white/10 bg-white dark:bg-[#1e2026] shadow-lg">
              {mentionSuggestions.map((u) => {
                const name = u.display_name ?? u.username ?? "";
                const initial = (name || "U").slice(0, 1).toUpperCase();
                return (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={() => selectMention(u.username ?? "")}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/[.06] active:bg-slate-100 dark:active:bg-white/10"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 dark:bg-orange-900/30 text-xs font-semibold text-orange-700 dark:text-orange-400">
                      {u.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={u.avatar_url} alt="" className="h-8 w-8 object-cover" />
                        : initial}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{name}</div>
                      {u.username && <div className="text-xs text-slate-500 dark:text-gray-500">@{u.username}</div>}
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
              <div className="mt-2 rounded-xl bg-slate-50 dark:bg-white/[.06] px-3 py-2.5 text-[11px] text-slate-600 dark:text-gray-400">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-orange-700 dark:text-orange-400">{"✨ "}{t("hintsTitle")}</span>
                  <button type="button" onClick={() => setHintsOpen(false)} className="text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300"><X size={13} /></button>
                </div>
                <ul className="space-y-1.5 text-slate-600 dark:text-gray-400">
                  <li><span className="font-medium text-slate-800 dark:text-gray-200">{t("hintExample1")}</span> — {t("hintGeo")}</li>
                  <li><span className="font-medium text-slate-800 dark:text-gray-200">{t("hintExample2")}</span> — {t("hintNatural")}</li>
                  <li><span className="font-medium text-slate-800 dark:text-gray-200">{t("hintExample3", { mention: placeholderMentions[0] ? `@${placeholderMentions[0]}` : t("friend") })}</span> — {t("hintMention")}</li>
                  <li><span className="font-medium text-slate-800 dark:text-gray-200">{t("hintExample4", { mention: placeholderMentions[1] ?? placeholderMentions[0] ? `@${placeholderMentions[1] ?? placeholderMentions[0]}` : t("acquaintance") })}</span> — {t("hintCombine")}</li>
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
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-slate-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={followOnly}
              onChange={(e) => toggleFollow(e.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            {t("followOnly")}
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
          {/* 現在地から探す / スコープ固定表示 */}
          <div className="px-3 pt-2 flex items-center gap-2 flex-wrap">
            {scopedBounds ? (
              <button
                type="button"
                onClick={() => { setScopedBounds(null); setScopedStation(null); setScopeLabel(null); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-500 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-600 active:scale-[0.97] transition"
              >
                <MapPinIcon size={14} />
                {scopeLabel ?? "エリア固定"}
                <X size={14} className="ml-0.5 opacity-70" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSearchFromLocation}
                disabled={geoLoading}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[.06] px-4 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-gray-200 shadow-sm hover:bg-slate-50 dark:hover:bg-white/10 active:scale-[0.97] transition disabled:opacity-50"
              >
                <MapPinIcon size={15} className="text-blue-500" />
                {geoLoading ? t("gettingLocation") : t("searchFromLocation")}
              </button>
            )}
            {geoError && (
              <p className="text-xs text-red-500 whitespace-pre-line">{geoError}</p>
            )}
          </div>

          {/* スコープ固定時: マップ表示 */}
          {scopedBounds && (
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
              {posts.length > 0 && (
                <MapPostCardCarousel
                  posts={posts}
                  selectedPostId={selectedMapPost?.id ?? null}
                  onSelect={(p) => setSelectedMapPost(p as MapPost)}
                  onClose={() => setSelectedMapPost(null)}
                />
              )}
              {/* タイムラインリストは廃止 — カルーセル + 詳細遷移で十分 */}
            </div>
          )}

          {!scopedBounds && (
            <AnimatePresence mode="wait">
              {peopleLoading ? (
                <motion.div key="people-loading" {...fadeUp} className="space-y-3 px-2">
                  <div className="w-full rounded-xl bg-slate-100 dark:bg-[#1e2026] animate-pulse" style={{ height: "40vh", minHeight: 240 }} />
                  <div className="flex gap-3 overflow-hidden">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-[240px] shrink-0 rounded-2xl bg-slate-100 dark:bg-[#1e2026] animate-pulse h-[180px]" />
                    ))}
                  </div>
                </motion.div>
              ) : peoplePeople.length > 0 ? (
                <motion.div key="discover" {...fadeUp}>
                  <div className="mb-2 flex items-center gap-2 px-3">
                    <Compass size={14} className="text-orange-500" />
                    <h2 className="text-[13px] font-semibold text-slate-700 dark:text-gray-300">
                      {t("peopleMap")}
                    </h2>
                    <span className="text-[10px] text-slate-400 dark:text-gray-600">
                      {t("peopleCount", { count: peoplePeople.filter((p) => p.is_following).length })}
                      {peoplePeople.filter((p) => !p.is_following).length > 0
                        ? ` + ${t("recommendedCount", { count: peoplePeople.filter((p) => !p.is_following).length })}`
                        : ""}
                    </span>
                  </div>
                  <div className="px-2">
                    <PeopleMap
                      people={peoplePeople}
                      selectedUserId={selectedUserId}
                      onSelectPerson={handleSelectPerson}
                      initialCenter={peopleCentroid}
                    />
                  </div>
                  <PersonCardCarousel
                    people={peoplePeople}
                    selectedUserId={selectedUserId}
                    onSelect={handleCardSelect}
                  />
                </motion.div>
              ) : (
                <motion.div key="default-explore" {...fadeUp} className="space-y-3">
                  {/* デフォルト: 本郷エリアの地図 + 投稿 */}
                  <div className="mb-2 flex items-center gap-2 px-3">
                    <Compass size={14} className="text-orange-500" />
                    <h2 className="text-[13px] font-semibold text-slate-700 dark:text-gray-300">
                      みんなの投稿を探索
                    </h2>
                  </div>
                  {defaultLoading ? (
                    <div className="px-2">
                      <div className="w-full rounded-xl bg-slate-100 dark:bg-[#1e2026] animate-pulse" style={{ height: "40vh", minHeight: 240 }} />
                    </div>
                  ) : (
                    <>
                      <div className="px-2">
                        <SearchMap
                          posts={defaultPosts}
                          userLocation={[HONGO_CENTER.lat, HONGO_CENTER.lng]}
                          onSearchThisArea={handleSearchThisArea}
                          showSearchButton={true}
                          onSelectPost={(p) => setSelectedMapPost(p)}
                          selectedPostId={selectedMapPost?.id ?? null}
                          loading={areaSearchLoading}
                          onScopedSearch={handleScopedSearch}
                        />
                      </div>
                      {defaultPosts.length > 0 && (
                        <MapPostCardCarousel
                          posts={defaultPosts}
                          selectedPostId={selectedMapPost?.id ?? null}
                          onSelect={(p) => setSelectedMapPost(p as MapPost)}
                          onClose={() => setSelectedMapPost(null)}
                        />
                      )}
                    </>
                  )}
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
              <div className="mb-2 text-[11px] font-medium text-slate-400 dark:text-gray-500">Users</div>
              <motion.div className="flex flex-col gap-1.5" variants={listStagger} initial="initial" animate="animate">
                {users.map((u) => {
                  const name = u.display_name ?? u.username ?? tc("user");
                  const handle = u.username ? `@${u.username}` : "";
                  const initial = (name || "U").slice(0, 1).toUpperCase();
                  return (
                    <motion.div key={u.id} variants={fadeUp}>
                      <Link href={`/u/${u.username ?? u.id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-white/[.06]">
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-100 dark:bg-white/15 text-[10px] font-semibold text-slate-600 dark:text-gray-300">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt="" className="h-10 w-10 object-cover" />
                          ) : initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{name}</div>
                            {handle && <div className="truncate text-xs text-slate-500 dark:text-gray-500">{handle}</div>}
                          </div>
                          {u.bio && <div className="truncate text-xs text-slate-600 dark:text-gray-400">{u.bio}</div>}
                        </div>
                        <div className="text-xs font-semibold text-orange-600 dark:text-orange-400">{t("view")}</div>
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

          {/* ===== 投稿カードカルーセル（地図とリストの間） ===== */}
          {((resultMode === "ai" && (semanticPosts.length > 0 || quickPosts.length > 0)) ||
            (resultMode === "keyword" && posts.length > 0)) && (
            <MapPostCardCarousel
              posts={resultMode === "ai" ? (semanticPosts.length > 0 ? semanticPosts : quickPosts) : posts}
              selectedPostId={selectedMapPost?.id ?? null}
              onSelect={(p) => setSelectedMapPost(p as MapPost)}
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
                      <div className="px-2 py-1.5 text-[11px] text-slate-400 dark:text-gray-500 flex items-center gap-1.5">
                        <span>{t("quickResults")}</span>
                        <span className="text-slate-300 dark:text-gray-600">{"\u00B7"}</span>
                        <span>{t("items", { count: quickPosts.length })}</span>
                        <span className="text-slate-300 dark:text-gray-600">{"\u00B7"}</span>
                        <span className="text-orange-400">{"✨ "}{t("aiSearching")}</span>
                      </div>
                      {/* カルーセルはマップ上部で表示済み */}
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
                      <p className="text-[13px] text-slate-400">{t("searchingPosts")}</p>
                      {aiSearchStartedAt && (
                        <div className="mt-2 w-48 flex flex-col items-center gap-1.5">
                          <div className="w-full h-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-slate-400 dark:bg-white/30"
                              initial={{ width: "0%" }}
                              animate={{ width: "95%" }}
                              transition={{ duration: 12, ease: "easeOut" }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-gray-500">
                            {"\u2728 AI\u304C\u5206\u6790\u4E2D\u2026\u7D0410\u79D2"}
                          </span>
                        </div>
                      )}
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
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 px-2 py-1.5 text-[11px] text-slate-500 dark:text-gray-500">
                      {detectedStations.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-slate-600 dark:text-gray-300">
                          <TrainFront size={10} className="shrink-0" />
                          {detectedStations.map((s) => s.name.endsWith("\u99C5") ? s.name : `${s.name}\u99C5`).join("\u30FB")}{t("nearStation")}
                        </span>
                      )}
                      {detectedAuthor && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-slate-600 dark:text-gray-300">
                          @{detectedAuthor.username}{detectedAuthor.displayName ? `\uFF08${detectedAuthor.displayName}\uFF09` : ""}
                        </span>
                      )}
                      {parsedIntent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-slate-600 dark:text-gray-300">
                          {"\u300C"}{parsedIntent}{"\u300D"}{t("searchedWith")}
                        </span>
                      )}
                      <span className="text-slate-400 dark:text-gray-500">{"\u00B7"}</span>
                      <span className="text-slate-400 dark:text-gray-500">{t("items", { count: semanticPosts.length })}</span>
                    </div>
                  )}
                  {/* タイムラインリストは廃止 — カルーセル + 詳細遷移で十分 */}
                </motion.div>
              )}
              {!semanticLoading && !semanticError && semanticPosts.length === 0 && (
                <motion.div {...fadeUp} className="py-6 text-center text-xs text-slate-500">
                  {mentionNotFound
                    ? t("userNotFound", { username: committedQ.match(/@([\w]+)/)?.[1] ?? "..." })
                    : t("noMatchingPosts")}
                </motion.div>
              )}
            </>
          )}

          {/* ===== キーワード検索結果（駅のみブラウズ）===== */}
          {resultMode === "keyword" && (
            <>
              {loading && posts.length === 0 ? (
                <motion.div {...fadeUp} className="flex flex-col items-center gap-3 py-12">
                  <div className="flex items-center gap-3 text-xl">
                    {["\uD83C\uDF5C", "\uD83C\uDF63", "\uD83C\uDF5B"].map((emoji, i) => (
                      <motion.span key={i} animate={{ y: [0, -6, 0] }} transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatDelay: 1.5 }}>{emoji}</motion.span>
                    ))}
                  </div>
                  <p className="text-[12px] text-slate-400 dark:text-gray-500">{t("searching")}</p>
                </motion.div>
              ) : null}

              {/* カルーセルはマップ上部で表示済み */}

              <div ref={sentinelRef} className="h-10" />

              {error && !error.includes("Unauthorized") && (
                <motion.div {...fadeUp} className="pb-8 text-center text-xs text-red-600 dark:text-red-400">{error}</motion.div>
              )}

              {done && posts.length > 0 && (
                <motion.div {...fadeUp} className="pb-8 text-center text-[11px] text-slate-400 dark:text-gray-500">{t("noMoreResults")}</motion.div>
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
                  <div className="py-6 text-center text-xs text-slate-500">{t("noMatchingPostsStation")}</div>
                </motion.div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
