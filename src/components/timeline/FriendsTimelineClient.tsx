// src/components/timeline/FriendsTimelineClient.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import TimelinePostList from "@/components/TimelinePostList";
import PostsSkeleton from "@/components/PostsSkeleton";
import SuggestFollowCard from "@/components/SuggestFollowCard";

type PostLite = any;

type Meta =
  | {
      suggestOnce: boolean;
      suggestAtIndex: number; // 0-based
      suggestion: {
        title: string;
        subtitle?: string | null;
        users: Array<{
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          is_following: boolean;
          reason?: string | null;
        }>;
      };
    }
  | null;

export default function FriendsTimelineClient({
  meId,
  initialPosts,
  initialNextCursor,
  initialMeta,
}: {
  meId: string | null;
  initialPosts: PostLite[];
  initialNextCursor: string | null;
  initialMeta: Meta;
}) {
  const [posts, setPosts] = useState<PostLite[]>(initialPosts);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [meta, setMeta] = useState<Meta>(initialMeta);

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

      setPosts((prev) => [...prev, ...newPosts]);
      setNextCursor(newCursor);

      // meta は基本初回だけでOKだが、APIが返すなら拾っても良い
      if (json.meta && !meta) setMeta(json.meta as Meta);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor, meta]);

  // 未ログインなら「最新」は見せない/軽い誘導
  if (!meId) {
    return (
      <div className="gm-card p-4 text-sm text-slate-600">
        最新タブはログイン後に表示されます。<a className="underline" href="/login">ログイン</a>
      </div>
    );
  }

  // --- ここが “真っ白防止” の要 ---
  if (posts.length === 0) {
    return (
      <div className="space-y-4">
        {meta?.suggestion?.users?.length ? (
          <SuggestFollowCard
            title={meta.suggestion.title}
            subtitle={meta.suggestion.subtitle ?? null}
            users={meta.suggestion.users}
          />
        ) : (
          <div className="gm-card p-4">
            <div className="text-sm font-semibold text-slate-900">まだタイムラインが空です</div>
            <div className="mt-1 text-xs text-slate-500">
              フォローすると「最新」に投稿が流れます。まずは「発見」から探すのがおすすめ。
            </div>
            <div className="mt-3">
<a
  href="/timeline?tab=discover"
  className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
>
  発見へ
</a>

            </div>
          </div>
        )}

        {loadingMore ? <PostsSkeleton /> : null}
      </div>
    );
  }

  // meta注入（指定indexに差し込む）
  const withMeta = useMemo(() => {
    if (!meta?.suggestion?.users?.length) return posts;
    const idx = Math.max(0, Math.min(posts.length, meta.suggestAtIndex ?? 1));
    const out = posts.slice();
    out.splice(idx, 0, { __kind: "__suggest_follow__", __meta: meta });
    return out;
  }, [posts, meta]);

  return (
    <div>
      <div className="flex flex-col items-stretch gap-6">
        {withMeta.map((p: any, i: number) => {
          if (p?.__kind === "__suggest_follow__") {
            const m = p.__meta as Meta;
            if (!m?.suggestion?.users?.length) return null;
            return (
              <SuggestFollowCard
                key={`meta-${i}`}
                title={m.suggestion.title}
                subtitle={m.suggestion.subtitle ?? null}
                users={m.suggestion.users}
              />
            );
          }
          // 普通の投稿
          return null;
        })}
      </div>

      {/* 投稿リスト（meta混入分は TimelinePostList に渡さない） */}
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
