// src/components/timeline/FriendsTimelineClient.tsx
"use client";

import React, { useCallback, useState } from "react";
import TimelinePostList from "@/components/TimelinePostList";
import PostsSkeleton from "@/components/PostsSkeleton";

type PostLite = any;

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

      const res = await fetch(`/api/timeline/friends?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;

      const json = await res.json();
      const newPosts = (json.posts ?? []) as PostLite[];
      const newCursor = (json.nextCursor ?? null) as string | null;

      setPosts((prev) => {
        const seen = new Set(prev.map((p: any) => p?.id).filter(Boolean));
        const appended = newPosts.filter((p: any) => p?.id && !seen.has(p.id));
        return [...prev, ...appended];
      });
      setNextCursor(newCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor]);

  if (posts.length === 0 && !loadingMore) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        まだ投稿がありません。<br />
        発見タブで気になる人やお店を探してみてください。
      </div>
    );
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
          <PostsSkeleton />
        </div>
      ) : null}
    </div>
  );
}
