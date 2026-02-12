"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import TimelineFeed from "@/components/TimelineFeed";
import TimelinePostList, { PostRow } from "@/components/TimelinePostList";

function buildUrl(searchParams: URLSearchParams, nextQ: string, followOnly: boolean) {
  const sp = new URLSearchParams(searchParams.toString());
  if (nextQ.trim()) sp.set("q", nextQ.trim());
  else sp.delete("q");

  if (followOnly) sp.set("follow", "1");
  else sp.delete("follow");

  return `?${sp.toString()}`;
}

export default function SearchPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();

  const qFromUrl = (sp.get("q") ?? "").trim();
  const followFromUrl = sp.get("follow") === "1";

  const [meId, setMeId] = useState<string | null>(null);

  const [q, setQ] = useState(qFromUrl);
  const [followOnly, setFollowOnly] = useState(followFromUrl);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL -> state（戻る/進む対応）
  useEffect(() => {
    setQ(qFromUrl);
    setFollowOnly(followFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFromUrl, followFromUrl]);

  // me
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, [supabase]);

  const isEmpty = !q.trim();

  // debounceしてURL固定（入力した瞬間検索でも “戻ったら保持” できる）
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(() => {
      const next = buildUrl(new URLSearchParams(sp.toString()), q, followOnly);
      router.replace(`/search${next}`, { scroll: false });
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, followOnly]);

  async function loadMore(reset = false) {
    if (loading) return;
    if (!reset && done) return;
    if (!q.trim()) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("q", q.trim());
    params.set("limit", "10");
    if (followOnly) params.set("follow", "1");
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

  // q変化で検索をやり直す
  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);
    if (!q.trim()) return;
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFromUrl, followFromUrl]);

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
  }, [cursor, done, loading, qFromUrl, followFromUrl, isEmpty]);

  const header = (
    <div className="gm-card px-4 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-[520px]">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="店名・ジャンル・エリア・住所・投稿内容で検索"
            className="w-full rounded-full border border-black/10 bg-white px-10 py-2.5 text-sm font-medium outline-none focus:border-orange-200"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={followOnly}
            onChange={(e) => setFollowOnly(e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          フォローのみ
        </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {header}

      {/* ✅ 何も入れてない時は timelinefeed の discover */}
      {isEmpty ? (
        <TimelineFeed activeTab="discover" meId={meId} />
      ) : (
        <div className="space-y-4">
          {posts.length > 0 ? <TimelinePostList posts={posts} meId={meId} /> : null}

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
