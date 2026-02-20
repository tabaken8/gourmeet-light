// src/components/timeline/DiscoverTimelineClient.tsx
"use client";

import React, { useCallback, useState } from "react";
import TimelinePostList from "@/components/timeline/TimelinePostList";
import PostsSkeleton from "@/components/PostsSkeleton";

type PostLite = any;

export default function DiscoverTimelineClient({
  meId,
}: {
  meId: string | null;
}) {
  const [posts, setPosts] = useState<PostLite[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);

  const load = useCallback(async (more: boolean) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (more && nextCursor) params.set("cursor", nextCursor);

      const res = await fetch(`/api/timeline/discover?${params.toString()}`);
      if (!res.ok) return;

      const json = await res.json();
      const newPosts = (json.posts ?? []) as PostLite[];
      const newCursor = (json.nextCursor ?? null) as string | null;

      setPosts((prev) => (more ? [...prev, ...newPosts] : newPosts));
      setNextCursor(newCursor);
      setBooted(true);
    } finally {
      setLoading(false);
    }
  }, [loading, nextCursor]);

  // 初回だけ自動ロード（雑に）
  if (!booted && !loading) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    load(false);
  }

  const hasMore = !!nextCursor;

  if (!booted && loading) return <PostsSkeleton />;

  if (posts.length === 0) return null;

  return (
    <div>
      <TimelinePostList posts={posts} meId={meId} />

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="rounded-full px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-60"
          >
            {loading ? "読み込み中..." : "もっと見る"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4">
          <PostsSkeleton />
        </div>
      ) : null}
    </div>
  );
}
