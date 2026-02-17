"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, TrainFront } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import TimelineFeed from "@/components/TimelineFeed";
import TimelinePostList, { PostRow, SearchMode } from "@/components/TimelinePostList";

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
  if (m === "free") return "geo"; // legacy
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
  }
) {
  const sp = new URLSearchParams(searchParams.toString());

  const q = (next.q ?? sp.get("q") ?? "").trim();
  const followOnly = next.followOnly ?? (sp.get("follow") === "1");
  const mode = next.mode ?? normalizeModeFromUrl(sp.get("m"));
  const sid = next.stationPlaceId ?? sp.get("sid");
  const sname = next.stationName ?? sp.get("sname");

  if (q) sp.set("q", q);
  else sp.delete("q");

  if (followOnly) sp.set("follow", "1");
  else sp.delete("follow");

  if (q) {
    sp.set("m", mode);
  } else {
    sp.delete("m");
    sp.delete("sid");
    sp.delete("sname");
  }

  if (mode === "station") {
    if (sid) sp.set("sid", String(sid));
    else sp.delete("sid");
    if (sname) sp.set("sname", String(sname));
    else sp.delete("sname");
  } else {
    sp.delete("sid");
    sp.delete("sname");
  }

  return `?${sp.toString()}`;
}

export default function SearchPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();

  // URL -> state
  const qFromUrl = (sp.get("q") ?? "").trim();
  const followFromUrl = sp.get("follow") === "1";
  const modeFromUrl = normalizeModeFromUrl(sp.get("m"));
  const stationIdFromUrl = sp.get("sid");
  const stationNameFromUrl = sp.get("sname");

  // me
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, [supabase]);

  // input state（入力中）
  const [q, setQ] = useState(qFromUrl);
  const [followOnly, setFollowOnly] = useState(followFromUrl);

  // 解釈 state（入力中の候補解釈）
  const [mode, setMode] = useState<SearchMode>(modeFromUrl);
  const [stationPlaceId, setStationPlaceId] = useState<string | null>(stationIdFromUrl);
  const [stationName, setStationName] = useState<string | null>(stationNameFromUrl);

  // TimelinePostListへ渡す「検索駅名」（stationの時だけ）
  const [searchedStationName, setSearchedStationName] = useState<string | null>(
    modeFromUrl === "station" ? (stationNameFromUrl ?? qFromUrl ?? null) : null
  );

  // committed state（検索実行済み）
  const [committedQ, setCommittedQ] = useState(qFromUrl);
  const [committedFollow, setCommittedFollow] = useState(followFromUrl);
  const [committedMode, setCommittedMode] = useState<SearchMode>(modeFromUrl);
  const [committedStationId, setCommittedStationId] = useState<string | null>(stationIdFromUrl);
  const [committedStationName, setCommittedStationName] = useState<string | null>(stationNameFromUrl);

  // results
  const [users, setUsers] = useState<UserHit[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // station suggest UI
  const [suggests, setSuggests] = useState<StationSuggest[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestReqId = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ✅ 追加：選択直後に再サジェスト出るのを防ぐフラグ
  const suppressSuggestRef = useRef(false);

  // URL -> input state（戻る/進む対応）
  useEffect(() => {
    setQ(qFromUrl);
    setFollowOnly(followFromUrl);

    setMode(modeFromUrl);
    setStationPlaceId(stationIdFromUrl);
    setStationName(stationNameFromUrl);

    setSearchedStationName(modeFromUrl === "station" ? (stationNameFromUrl ?? qFromUrl ?? null) : null);

    setCommittedQ(qFromUrl);
    setCommittedFollow(followFromUrl);
    setCommittedMode(modeFromUrl);
    setCommittedStationId(stationIdFromUrl);
    setCommittedStationName(stationNameFromUrl);

    // URL遷移はサジェスト復帰してOK
    suppressSuggestRef.current = false;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFromUrl, followFromUrl, modeFromUrl, stationIdFromUrl, stationNameFromUrl]);

  const isEmpty = !committedQ.trim();

  async function loadUsers(query: string) {
    const qq = query.trim();
    if (!qq) {
      setUsers([]);
      return;
    }
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

  async function loadSuggestStations(query: string) {
    const qq = query.trim();
    if (!qq) {
      setSuggests([]);
      setSuggestOpen(false);
      return;
    }

    const my = ++suggestReqId.current;
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/search/suggest/station?q=${encodeURIComponent(qq)}&limit=8`);
      const payload = await res.json().catch(() => ({}));
      if (suggestReqId.current !== my) return;

      const rows: StationSuggest[] = Array.isArray(payload?.stations)
        ? payload.stations
        : Array.isArray(payload)
        ? payload
        : [];
      setSuggests(rows);
      setSuggestOpen(rows.length > 0);
    } catch {
      if (suggestReqId.current !== my) return;
      setSuggests([]);
      setSuggestOpen(false);
    } finally {
      if (suggestReqId.current === my) setSuggestLoading(false);
    }
  }

  async function loadMore(
    reset = false,
    opts?: { q?: string; follow?: boolean; mode?: SearchMode; sid?: string | null; sname?: string | null }
  ) {
    if (loading) return;
    if (!reset && done) return;

    const qq = (opts?.q ?? committedQ).trim();
    const ff = opts?.follow ?? committedFollow;
    const mm = opts?.mode ?? committedMode;
    const sid = opts?.sid ?? committedStationId;
    const sname = opts?.sname ?? committedStationName;

    if (!qq) return;

    setLoading(true);
    setError(null);

    const limit = 10;

    try {
      let url = "";

      if (mm === "station") {
        if (!sid) throw new Error("駅IDが見つかりませんでした（sid）");

        const params = new URLSearchParams();
        params.set("station_place_id", sid);
        params.set("radius_m", "3000");
        params.set("limit", String(limit));
        if (ff) params.set("follow", "1");
        if (!reset && cursor) params.set("cursor", cursor);
        if (sname) params.set("station_name", sname); // UI用

        url = `/api/search/by-station-ui?${params.toString()}`;
      } else {
        const params = new URLSearchParams();
        params.set("q", qq);
        params.set("limit", String(limit));
        if (ff) params.set("follow", "1");
        if (!reset && cursor) params.set("cursor", cursor);

        url = `/api/search?${params.toString()}`;
      }

      const res = await fetch(url);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      const newPosts: PostRow[] = Array.isArray(payload?.posts)
        ? payload.posts
        : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];

      const nextCursor: string | null = payload?.nextCursor ?? payload?.next_cursor ?? payload?.cursor ?? null;

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
      if (String(msg).includes("Unauthorized")) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  const commitSearch = (next: { q: string; follow: boolean; mode: SearchMode; sid?: string | null; sname?: string | null }) => {
    const nq = next.q.trim();

    const nextUrl = buildUrl(new URLSearchParams(sp.toString()), {
      q: nq,
      followOnly: next.follow,
      mode: next.mode,
      stationPlaceId: next.sid ?? null,
      stationName: next.sname ?? null,
    });
    router.replace(`/search${nextUrl}`, { scroll: false });

    setCommittedQ(nq);
    setCommittedFollow(next.follow);
    setCommittedMode(next.mode);
    setCommittedStationId(next.sid ?? null);
    setCommittedStationName(next.sname ?? null);

    if (next.mode === "station") setSearchedStationName(next.sname ?? nq ?? null);
    else setSearchedStationName(null);

    // reset results
    setUsers([]);
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);

    if (!nq) return;

    loadUsers(nq);
    loadMore(true, { q: nq, follow: next.follow, mode: next.mode, sid: next.sid ?? null, sname: next.sname ?? null });
  };

  // URLから入ってきた時は自動検索
  const didAutoRef = useRef(false);
  useEffect(() => {
    if (didAutoRef.current) return;
    didAutoRef.current = true;

    if (qFromUrl.trim()) {
      commitSearch({
        q: qFromUrl,
        follow: followFromUrl,
        mode: modeFromUrl,
        sid: stationIdFromUrl,
        sname: stationNameFromUrl,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 無限スクロール（検索結果側のみ）
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    if (isEmpty) return;

    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore(false);
      },
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, done, loading, isEmpty, committedQ, committedFollow, committedMode, committedStationId]);

  // ✅ 入力が変わったら station候補（※選択直後は抑制）
  useEffect(() => {
    const qq = q.trim();
    if (!qq) {
      setSuggests([]);
      setSuggestOpen(false);
      return;
    }

    if (suppressSuggestRef.current) {
      // 選択直後の「setQ」でここが走るので、1回だけ抑制して解除
      suppressSuggestRef.current = false;
      return;
    }

    const t = setTimeout(() => loadSuggestStations(qq), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // サジェスト選択（駅として確定）
  const selectStation = (s: StationSuggest) => {
    const nextQ = (s.station_name ?? q).trim();

    // ✅ これが重要：この setQ で useEffect が走るので一度だけ抑制
    suppressSuggestRef.current = true;

    setQ(nextQ);
    setMode("station");
    setStationPlaceId(s.station_place_id);
    setStationName(s.station_name);

    setSuggestOpen(false);
    setSuggests([]);

    commitSearch({
      q: nextQ,
      follow: followOnly,
      mode: "station",
      sid: s.station_place_id,
      sname: s.station_name,
    });

    requestAnimationFrame(() => inputRef.current?.blur());
  };

  // Enter：サジェスト未選択なら geo として確定
  const enterAsGeo = () => {
    const nq = q.trim();
    setMode("geo");
    setStationPlaceId(null);
    setStationName(null);

    setSuggestOpen(false);

    commitSearch({ q: nq, follow: followOnly, mode: "geo", sid: null, sname: null });
  };

  const toggleFollow = (next: boolean) => {
    setFollowOnly(next);
    if (committedQ.trim()) {
      commitSearch({
        q: q.trim() ? q : committedQ,
        follow: next,
        mode: committedMode,
        sid: committedStationId,
        sname: committedStationName,
      });
    }
  };

  // ✅ 結果タイトル（ドン）
  const resultTitle = useMemo(() => {
    const qq = committedQ.trim();
    if (!qq) return "";
    if (committedMode === "station") {
      const name = committedStationName || qq;
      return `${name}周辺の投稿一覧`;
    }
    return `「${qq}」の検索結果`;
  }, [committedQ, committedMode, committedStationName]);

  // ヘッダー（検索窓）
  const header = useMemo(() => {
    return (
      <div className="gm-card px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:w-[520px]">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                suppressSuggestRef.current = false; // 手入力は抑制しない
                setQ(e.target.value);
                setMode("geo");
                setStationPlaceId(null);
                setStationName(null);
              }}
              onFocus={() => {
                if (suggests.length > 0) setSuggestOpen(true);
              }}
              onBlur={() => {
                setTimeout(() => setSuggestOpen(false), 120);
              }}
              placeholder="東京 焼肉 / 名古屋駅"
              className="w-full rounded-full border border-black/10 bg-white px-10 pr-10 py-2.5 text-base font-medium outline-none focus:border-orange-200"
              inputMode="search"
              enterKeyHint="search"
              onKeyDown={(e) => {
                if (e.key === "Enter") enterAsGeo();
                if (e.key === "Escape") setSuggestOpen(false);
              }}
            />

            {/* クリア */}
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setSuggestOpen(false);
                  setSuggests([]);
                  setMode("geo");
                  setStationPlaceId(null);
                  setStationName(null);
                  setSearchedStationName(null);

                  const nextUrl = buildUrl(new URLSearchParams(sp.toString()), { q: "", followOnly });
                  router.replace(`/search${nextUrl}`, { scroll: false });
                }}
                aria-label="Clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onMouseDown={(e) => e.preventDefault()}
              >
                <span className="text-lg leading-none">×</span>
              </button>
            )}

            {/* ✅ station suggests dropdown */}
            {suggestOpen && q.trim() && suggests.length > 0 ? (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg">
                <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-black/5">
                  駅候補（選ぶと「駅として検索」）
                  {suggestLoading ? <span className="ml-2 text-slate-400">…</span> : null}
                </div>
                <div className="max-h-[320px] overflow-auto">
                  {suggests.map((s) => (
                    <button
                      key={s.station_place_id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectStation(s)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* ✅ 電車マーク + 駅名 */}
                        <div className="min-w-0 flex items-center gap-2">
                          <TrainFront size={16} className="shrink-0 text-slate-500" />
                          <div className="truncate text-sm font-semibold text-slate-900">{s.station_name}</div>
                        </div>

                        {typeof s.count_places === "number" ? (
                          <div className="shrink-0 text-[11px] text-slate-500">{s.count_places}件</div>
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
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, followOnly, suggests, suggestOpen, suggestLoading]);

  return (
    <div className="space-y-4">
      {header}

      {isEmpty ? (
        <TimelineFeed activeTab="discover" meId={meId} />
      ) : (
        <div className="space-y-4">
          {/* ✅ 結果タイトル（ドン） */}
          <div className="gm-card px-4 py-3">
            <div className="flex items-center gap-2">
              {committedMode === "station" ? (
                <TrainFront size={18} className="text-slate-600" />
              ) : (
                <Search size={18} className="text-slate-600" />
              )}
              <div className="text-base font-semibold text-slate-900">{resultTitle}</div>
            </div>

            {committedMode !== "station" ? (
              <div className="mt-1 text-[11px] text-slate-500">
                駅として検索したい場合は、検索窓の候補から駅を選べます。
              </div>
            ) : null}
          </div>

          {/* Users */}
          {usersLoading ? (
            <div className="gm-card px-4 py-3 text-xs text-slate-500">ユーザーを検索中…</div>
          ) : users.length > 0 ? (
            <section className="gm-card px-4 py-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Users</div>
              <div className="flex flex-col gap-2">
                {users.map((u) => {
                  const name = u.display_name ?? u.username ?? "ユーザー";
                  const handle = u.username ? `@${u.username}` : "";
                  const initial = (name || "U").slice(0, 1).toUpperCase();

                  return (
                    <Link
                      key={u.id}
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
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Posts */}
          {posts.length > 0 ? (
            <TimelinePostList posts={posts} meId={meId} mode={committedMode} searchedStationName={searchedStationName} />
          ) : null}

          <div ref={sentinelRef} className="h-10" />

          {loading && <div className="pb-8 text-center text-xs text-slate-500">読み込み中...</div>}
          {error && !error.includes("Unauthorized") && <div className="pb-8 text-center text-xs text-red-600">{error}</div>}
          {done && posts.length > 0 && <div className="pb-8 text-center text-[11px] text-slate-400">これ以上ありません</div>}
          {!loading && posts.length === 0 && !error && <div className="py-10 text-center text-xs text-slate-500">該当する投稿がありません。</div>}
        </div>
      )}
    </div>
  );
}
