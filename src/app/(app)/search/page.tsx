"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import TimelineFeed from "@/components/TimelineFeed";
import TimelinePostList, { PostRow } from "@/components/TimelinePostList";

type UserHit = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
};

function buildUrl(searchParams: URLSearchParams, nextQ: string, followOnly: boolean) {
  const sp = new URLSearchParams(searchParams.toString());
  const q = nextQ.trim();

  if (q) sp.set("q", q);
  else sp.delete("q");

  if (followOnly) sp.set("follow", "1");
  else sp.delete("follow");

  return `?${sp.toString()}`;
}

export default function SearchPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();

  // URL state
  const qFromUrl = (sp.get("q") ?? "").trim();
  const followFromUrl = sp.get("follow") === "1";

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

  // committed state（検索実行済みのクエリ）
  const [committedQ, setCommittedQ] = useState(qFromUrl);
  const [committedFollow, setCommittedFollow] = useState(followFromUrl);

  // results
  const [users, setUsers] = useState<UserHit[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL -> input state（戻る/進む対応）
  useEffect(() => {
    setQ(qFromUrl);
    setFollowOnly(followFromUrl);
    setCommittedQ(qFromUrl);
    setCommittedFollow(followFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFromUrl, followFromUrl]);

  const isEmpty = !committedQ.trim(); // “検索実行済み”が空なら discover

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

  async function loadMore(reset = false, qArg?: string, followArg?: boolean) {
    if (loading) return;
    if (!reset && done) return;

    const qq = (qArg ?? committedQ).trim();
    const ff = followArg ?? committedFollow;

    if (!qq) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("q", qq);
    params.set("limit", "10");
    if (ff) params.set("follow", "1");
    if (!reset && cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/search?${params.toString()}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      const newPosts: PostRow[] = Array.isArray(payload?.posts) ? payload.posts : [];
      const nextCursor: string | null = payload?.nextCursor ?? null;

      setPosts((prev) => {
        if (reset) return newPosts;
        const seen = new Set(prev.map((p) => p.id));
        const appended = newPosts.filter((p) => !seen.has(p.id));
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

  // ✅ 検索確定（Enter / 右下の検索キー）
  const commitSearch = (nextQ: string, nextFollow: boolean) => {
    const nq = nextQ.trim();

    // URL同期（確定時だけ）
    const next = buildUrl(new URLSearchParams(sp.toString()), nq, nextFollow);
    router.replace(`/search${next}`, { scroll: false });

    // state
    setCommittedQ(nq);
    setCommittedFollow(nextFollow);

    // reset results
    setUsers([]);
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);

    if (!nq) return;

    // kick
    loadUsers(nq);
    loadMore(true, nq, nextFollow);
  };

  // “URLから入ってきた”時は自動で検索（初回表示/戻る対応）
  const didAutoRef = useRef(false);
  useEffect(() => {
    if (didAutoRef.current) return;
    didAutoRef.current = true;

    if (qFromUrl.trim()) {
      // URLにクエリがあるなら即検索
      commitSearch(qFromUrl, followFromUrl);
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
  }, [cursor, done, loading, isEmpty, committedQ, committedFollow]);

  const header = useMemo(() => {
    return (
      <div className="gm-card px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:w-[520px]">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="店名・ジャンル・エリア・住所・投稿内容で検索"
              className="w-full rounded-full border border-black/10 bg-white px-10 py-2.5 text-sm font-medium outline-none focus:border-orange-200"
              inputMode="search"
              enterKeyHint="search"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitSearch(q, followOnly);
                }
              }}
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 select-none">
            <input
              type="checkbox"
              checked={followOnly}
              onChange={(e) => {
                const next = e.target.checked;
                setFollowOnly(next);

                // 既に検索済みなら、トグル変更は “確定検索”として扱う（タイピング不要）
                if (committedQ.trim()) {
                  commitSearch(q.trim() ? q : committedQ, next);
                }
              }}
              className="h-4 w-4 accent-orange-500"
            />
            フォローのみ
          </label>
        </div>

        <div className="mt-2 text-[11px] text-slate-500">
          入力中は検索しません。<span className="font-semibold">Enter / 検索キー</span>で実行します。
        </div>
      </div>
    );
  }, [q, followOnly, committedQ]);

  return (
    <div className="space-y-4">
      {header}

      {/* ✅ 何も確定してない時は timelinefeed の discover */}
      {isEmpty ? (
        <TimelineFeed activeTab="discover" meId={meId} />
      ) : (
        <div className="space-y-4">
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
          {posts.length > 0 ? <TimelinePostList posts={posts} meId={meId} /> : null}

          <div ref={sentinelRef} className="h-10" />

          {loading && <div className="pb-8 text-center text-xs text-slate-500">読み込み中...</div>}
          {error && !error.includes("Unauthorized") && <div className="pb-8 text-center text-xs text-red-600">{error}</div>}
          {done && posts.length > 0 && <div className="pb-8 text-center text-[11px] text-slate-400">これ以上ありません</div>}
          {!loading && posts.length === 0 && !error && (
            <div className="py-10 text-center text-xs text-slate-500">
              該当する投稿がありません。（ユーザーは上に出ます）
            </div>
          )}
        </div>
      )}
    </div>
  );
}
