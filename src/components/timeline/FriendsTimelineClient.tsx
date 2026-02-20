// src/components/timeline/FriendsTimelineClient.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import TimelinePostList from "@/components/timeline/TimelinePostList";
import PostsSkeleton from "@/components/PostsSkeleton";
import SuggestFollowCard from "@/components/SuggestFollowCard";

type PostLite = any;

// meta 互換（APIが返してくる形に寄せる）
type SuggestMeta =
    | {
        suggestOnce?: boolean;
        suggestAtIndex?: number; // 0-based
        suggestion?: {
            title: string;
            subtitle?: string | null;
            users: {
                id: string;
                display_name: string | null;
                avatar_url: string | null;
                mode?: "follow" | "followback";
                subtitle?: string | null;
            }[];
        };
    }
    | null
    | undefined;

export default function FriendsTimelineClient({
    meId,
    initialPosts,
    initialNextCursor,
    initialMeta = null,
}: {
    meId: string | null;
    initialPosts: PostLite[];
    initialNextCursor: string | null;
    initialMeta?: SuggestMeta;
}) {
    // ✅ Hooks は必ず上（return より前）に固定
    const [posts, setPosts] = useState<PostLite[]>(initialPosts ?? []);
    const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor ?? null);
    const [loadingMore, setLoadingMore] = useState(false);

    // meta を持つ（初回だけ出したい想定）
    const [meta, setMeta] = useState<SuggestMeta>(initialMeta ?? null);

    const hasMore = !!nextCursor;

    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const params = new URLSearchParams();
            if (nextCursor) params.set("cursor", nextCursor);
            params.set("limit", "20");

            // ✅ 相対URLはブラウザ(fetch)ならOK。Serverでfetchする場合は絶対URLが必要。
            const res = await fetch(`/api/timeline/friends?${params.toString()}`, {
                method: "GET",
                credentials: "include",
                headers: { "accept": "application/json" },
            });
            if (!res.ok) return;

            const json = await res.json();
            const newPosts = (json.posts ?? []) as PostLite[];
            const newCursor = (json.nextCursor ?? null) as string | null;

            setPosts((prev) => [...prev, ...newPosts]);
            setNextCursor(newCursor);

            // ✅ meta は「最初の1回だけ」出す想定なら、loadMoreでは基本更新しない。
            // もしAPIがmeta返してきて、まだmetaが無いなら拾う。
            if (!meta && json.meta) setMeta(json.meta as SuggestMeta);
        } finally {
            setLoadingMore(false);
        }
    }, [hasMore, loadingMore, nextCursor, meta]);

    // ✅ ここも hooks（useMemo）なので return より前で必ず実行
    const shouldRender = useMemo(() => {
        // 未ログインなら friends タブは非表示（あなたの仕様に合わせる）
        if (!meId) return false;
        // posts 0 で meta も無いなら何も出せない（真っ白回避したいなら別UI出す）
        if ((posts?.length ?? 0) === 0 && !meta) return false;
        return true;
    }, [meId, posts, meta]);

    // ✅ meta を SuggestFollowCard の型に合わせて整形（あなたの SuggestFollowCard.tsx に合わせる）
    const suggestBlock = useMemo(() => {
        const sug = meta?.suggestion;
        if (!sug?.users?.length) return null;

        return (
            <SuggestFollowCard
                title={sug.title}
                subtitle={sug.subtitle ?? null}
                users={sug.users.map((u) => ({
                    id: u.id,
                    display_name: u.display_name,
                    avatar_url: u.avatar_url,
                    is_following: false, // APIで持てるなら差し替え
                    reason: u.subtitle ?? null,
                }))}
            />
        );
    }, [meta]);

    const suggestAtIndex = useMemo(() => {
        const x = meta?.suggestAtIndex;
        return typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 1;
    }, [meta]);

    // ✅ Hooks を全部呼び終わってから return
    if (!shouldRender) return null;

    return (
        <div>
            <div className="flex flex-col items-stretch gap-6">
                {(posts ?? []).map((p, idx) => (
                    <React.Fragment key={p?.id ?? `row-${idx}`}>
                        {/* ✅ 指定indexでサジェスト差し込み */}
                        {idx === suggestAtIndex ? suggestBlock : null}

                        {/* ✅ 既存の表示 */}
                        <TimelinePostList posts={[p]} meId={meId} />
                    </React.Fragment>
                ))}

                {/* posts が少なすぎて idx==suggestAtIndex に届かない時のフォールバック */}
                {(posts?.length ?? 0) <= suggestAtIndex ? suggestBlock : null}
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
    );
}
