// src/components/timeline/FriendsTimelineClient.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import TimelinePostList from "@/components/TimelinePostList";
import PostsSkeleton from "@/components/PostsSkeleton";
import FollowButton from "@/components/FollowButton";

type PostLite = any;

type SuggestUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  mode?: "follow" | "followback";
  subtitle?: string | null;
};

type TimelineMeta =
  | {
      suggestOnce?: boolean;
      suggestAtIndex?: number; // 0-based
      suggestion?: {
        title?: string | null;
        subtitle?: string | null;
        users: SuggestUser[];
      };
    }
  | null;

function SuggestFollowCard({
  title,
  subtitle,
  users,
}: {
  title?: string | null;
  subtitle?: string | null;
  users: SuggestUser[];
}) {
  if (!users?.length) return null;

  return (
    <div className="gm-card overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="text-sm font-semibold text-slate-900">{title ?? "おすすめユーザー"}</div>
        {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
      </div>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-1 gap-3">
          {users.map((u) => {
            const initial = (u.display_name || "U").slice(0, 1).toUpperCase();
            return (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-2xl border border-black/[.06] px-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700 flex items-center justify-center">
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt="" className="h-10 w-10 object-cover" />
                    ) : (
                      initial
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {u.display_name ?? "ユーザー"}
                    </div>
                    {u.subtitle ? <div className="text-[12px] text-slate-500">{u.subtitle}</div> : null}
                  </div>
                </div>

                <FollowButton
                  targetId={u.id}
                  initialFollowing={false}
                  mode={(u.mode ?? "follow") as any}
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function FriendsTimelineClient({
  meId,
  initialPosts,
  initialNextCursor,
  initialMeta,
}: {
  meId: string | null;
  initialPosts: PostLite[];
  initialNextCursor: string | null;
  initialMeta?: TimelineMeta;
}) {
  const [posts, setPosts] = useState<PostLite[]>(initialPosts);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [meta, setMeta] = useState<TimelineMeta>(initialMeta ?? null);
  const [loadingMore, setLoadingMore] = useState(false);

  const hasMore = !!nextCursor;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (nextCursor) params.set("cursor", nextCursor);
      params.set("limit", "20");

      const res = await fetch(`/api/timeline/friends?${params.toString()}`);
      if (!res.ok) return;

      const json = await res.json();
      const newPosts = (json.posts ?? []) as PostLite[];
      const newCursor = (json.nextCursor ?? null) as string | null;

      setPosts((prev) => [...prev, ...newPosts]);
      setNextCursor(newCursor);

      // ✅ meta は基本「初回だけ」使う想定だが、APIが返すなら追従してもOK
      if (json.meta) setMeta(json.meta as TimelineMeta);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor]);

  const suggestIndex = meta?.suggestAtIndex ?? 1;
  const suggestBlock = meta?.suggestion ?? null;

  // ✅ 描画用に、指定indexへカードを差し込む
  const mergedPosts = useMemo(() => {
    if (!suggestBlock?.users?.length) return posts;
    const idx = Math.max(0, Math.min(posts.length, suggestIndex));
    const out: any[] = [];
    for (let i = 0; i < posts.length; i++) {
      if (i === idx) out.push({ __kind: "suggest_card" });
      out.push(posts[i]);
    }
    if (posts.length === idx) out.push({ __kind: "suggest_card" });
    return out;
  }, [posts, suggestBlock?.users?.length, suggestIndex]);

  if (mergedPosts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        {/* ✅ Suggest card を TimelinePostList の間に挟む */}
        <div className="flex flex-col gap-6">
          {mergedPosts.map((p: any, i: number) => {
            if (p?.__kind === "suggest_card") {
              return (
                <SuggestFollowCard
                  key={`suggest-${i}`}
                  title={suggestBlock?.title ?? null}
                  subtitle={suggestBlock?.subtitle ?? null}
                  users={suggestBlock?.users ?? []}
                />
              );
            }
            // 通常投稿は TimelinePostList にまとめて渡したいが、
            // ここでは差し込みのため 1件ずつ渡す簡易方式にする
            return <TimelinePostList key={p?.id ?? `p-${i}`} posts={[p]} meId={meId} />;
          })}
        </div>

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
    </div>
  );
}
