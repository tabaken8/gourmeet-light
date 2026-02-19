// src/components/timeline/FriendsTimelineClient.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import TimelinePostList from "@/components/TimelinePostList";
import PostsSkeleton from "@/components/PostsSkeleton"; 
// ※あなたの既存コンポーネント名に合わせて調整してOK

type PostLite = any; // ← 既存の PostRow 型があるならそれをimportして置き換え

export default function FriendsTimelineClient({
  meId,
  initialPosts,
  initialNextCursor,
}: {
  meId: string | null;
  initialPosts: PostLite[];
  initialNextCursor: string | null;
}) {
  const [posts, setPosts] = useState<PostLite[]>(initialPosts);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  const hasMore = !!nextCursor;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (nextCursor) params.set("cursor", nextCursor);
      params.set("limit", "20");

      // ここは「friends用API route」を作るか、Clientから直接rpc叩くかで分岐する
      // まずは簡単に API route を作るのが王道（認証cookieも使える）
      const res = await fetch(`/api/timeline/friends?${params.toString()}`);
      if (!res.ok) return;

      const json = await res.json();
      const newPosts = (json.posts ?? []) as PostLite[];
      const newCursor = (json.nextCursor ?? null) as string | null;

      setPosts((prev) => [...prev, ...newPosts]);
      setNextCursor(newCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor]);

  // 未ログインなら空
  if (!meId) return null;

  // 初期表示が0件でサーバーからも0なら、ここで skeleton 出す意味は基本ない
  // ただ「0件です」を出したいならここで。
  if (posts.length === 0) {
    return null;
  }

  return (
    <div>
      <TimelinePostList posts={posts} meId={meId} />

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-60"
          >
            {loadingMore ? "読み込み中..." : "もっと見る"}
          </button>
        </div>
      ) : null}

      {loadingMore ? (
        <div className="mt-4">
          {/* 追撃ロードのときだけskeleton（任意） */}
          <PostsSkeleton />
        </div>
      ) : null}
    </div>
  );
}
