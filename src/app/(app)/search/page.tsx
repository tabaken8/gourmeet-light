// src/app/(app)/search/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
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

  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default function SearchPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();

  const qFromUrl = (sp.get("q") ?? "").trim();
  const followFromUrl = sp.get("follow") === "1";

  const [meId, setMeId] = useState<string | null>(null);

  // ✅ 入力中（まだ検索しない）
  const [qInput, setQInput] = useState(qFromUrl);

  // ✅ 確定済み（この値で検索する / URLにも入れる）
  const [qCommitted, setQCommitted] = useState(qFromUrl);

  // follow は URL と同期（チェック操作でURLは更新する）
  const [followOnly, setFollowOnly] = useState(followFromUrl);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 戻る/進む等でURLが変わったら state を揃える
  useEffect(() => {
    setQInput(qFromUrl);
    setQCommitted(qFromUrl);
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

  const isEmpty = !qCommitted.trim();

  // 同時実行ガード（古いリクエスト破棄）
  const reqIdRef = useRef(0);

  async function loadMore(reset = false) {
    if (loading) return;
    if (!reset && done) return;
    if (!qCommitted.trim()) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("q", qCommitted.trim());
    params.set("limit", "10");
    if (followOnly) params.set("follow", "1");
    if (!reset && cursor) params.set("cursor", cursor);

    reqIdRef.current += 1;
    const reqId = reqIdRef.current;

    try {
      const res = await fetch(`/api/search?${params.toString()}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      // ✅ 途中で別検索が走ったら捨てる
      if (reqIdRef.current !== reqId) return;

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
      if (reqIdRef.current !== reqId) return;
      const msg = e?.message ?? "読み込みに失敗しました";
      setError(msg);
      if (String(msg).includes("Unauthorized")) setDone(true);
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }

  // ✅ 確定条件：Enter / 検索キー（フォームsubmit）でだけ検索
  function commitSearch(nextQ: string) {
    const nq = nextQ.trim();

    // URL更新（scrollしない）
    const next = buildUrl(new URLSearchParams(sp.toString()), nq, followOnly);
    router.replace(`/search${next}`, { scroll: false });

    // 状態確定
    setQCommitted(nq);

    // 検索リセット＆実行
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);

    if (!nq) return;
    loadMore(true);
  }

  // ✅ followOnly 切替時：検索中なら即再検索（入力中は走らせない）
  useEffect(() => {
    // URLを更新（qCommittedで維持）
    const next = buildUrl(new URLSearchParams(sp.toString()), qCommitted, followOnly);
    router.replace(`/search${next}`, { scroll: false });

    // 確定済み検索がある時だけ再検索
    if (!qCommitted.trim()) return;

    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);
    loadMore(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followOnly]);

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
  }, [cursor, done, loading, qCommitted, followOnly, isEmpty]);

  const header = (
    <div className="gm-card px-4 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {/* ✅ ボタンなし：submit(Enter/🔍)でだけ検索 */}
        <form
          className="relative w-full md:w-[520px]"
          onSubmit={(e) => {
            e.preventDefault();
            commitSearch(qInput);
          }}
        >
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="店名・ジャンル・エリア・住所・投稿内容で検索"
            className="w-full rounded-full border border-black/10 bg-white px-10 py-2.5 text-sm font-medium outline-none focus:border-orange-200"
            // ✅ モバイルはここが重要：検索キーを出す
            inputMode="search"
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </form>

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

      {/* ✅ 変換中フリーズ防止：ヒントを小さく */}
      <div className="mt-2 text-[11px] text-slate-500">
        入力したら、キーボードの「検索」/ Enter で実行
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {header}

      {/* ✅ 何も確定検索がない時は timelinefeed の discover */}
      {isEmpty ? (
        <TimelineFeed activeTab="discover" meId={meId} />
      ) : (
        <div className="space-y-4">
          {posts.length > 0 ? <TimelinePostList posts={posts} meId={meId} /> : null}

          <div ref={sentinelRef} className="h-10" />

          {loading && <div className="pb-8 text-center text-xs text-slate-500">読み込み中...</div>}
          {error && !error.includes("Unauthorized") && (
            <div className="pb-8 text-center text-xs text-red-600">{error}</div>
          )}
          {done && posts.length > 0 && <div className="pb-8 text-center text-[11px] text-slate-400">これ以上ありません</div>}
          {!loading && posts.length === 0 && !error && (
            <div className="py-10 text-center text-xs text-slate-500">該当する投稿がありません。</div>
          )}
        </div>
      )}
    </div>
  );
}
