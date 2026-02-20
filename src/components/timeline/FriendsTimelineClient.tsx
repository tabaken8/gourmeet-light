// src/components/timeline/FriendsTimelineClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TimelinePostList from "@/components/timeline/TimelinePostList";
import PostsSkeleton from "@/components/PostsSkeleton";
import SuggestFollowCard from "@/components/SuggestFollowCard";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { Lock } from "lucide-react";

type PostLite = any;

type SuggestMeta =
  | {
      followCount?: number; // ✅ 追加
      suggestOnce?: boolean;
      suggestAtIndex?: number; // 0-based
      suggestion?: {
        title: string;
        subtitle?: string | null;
        users: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          is_following?: boolean;
          reason?: string | null;

          mode?: "follow" | "followback";
          subtitle?: string | null;
        }[];
      };
    }
  | null
  | undefined;

type ProfileLite = { id: string; display_name: string | null; avatar_url: string | null; is_public: boolean | null };
type PostRow = {
  id: string;
  user_id: string;
  content?: string | null;
  place_name?: string | null;
  place_genre?: string | null;
  image_urls?: string[] | null;
  image_variants?: any[] | null;
  image_assets?: any[] | null;
  cover_square_url?: string | null;
  profile?: ProfileLite | null;
};

function EmptyState({
  title,
  desc,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  desc?: string | null;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[.06] bg-white p-6">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      {desc ? <div className="mt-2 text-sm text-slate-600">{desc}</div> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={primaryHref}
          className="inline-flex items-center justify-center rounded-full bg-orange-700 px-4 py-2 text-sm font-semibold !text-white hover:bg-orange-800"
        >
          {primaryLabel}
        </Link>

        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex items-center justify-center rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// -------------------------
// Helpers for DiscoverGrid
// -------------------------
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getFirstSquareThumb(p: PostRow): string | null {
  if (p.cover_square_url) return p.cover_square_url;

  const assets = Array.isArray(p.image_assets) ? p.image_assets : [];
  for (const a of assets) {
    const sq = a?.square ?? null;
    if (typeof sq === "string" && sq) return sq;
  }

  const vars = Array.isArray(p.image_variants) ? p.image_variants : [];
  for (const v of vars) {
    const th = v?.thumb ?? null;
    if (typeof th === "string" && th) return th;
  }

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy[0] ?? null;
}

type PlannedTile = { big: boolean; p: PostRow };
function planDiscoverTiles(posts: PostRow[], seed: string, opts?: { maxTiles?: number; maxBig?: number }) {
  const maxTiles = opts?.maxTiles ?? 12; // 3x4 相当
  const maxBig = opts?.maxBig ?? 3;

  const base = posts.slice(0, Math.max(maxTiles, 1));
  const tiles: PlannedTile[] = [];

  // big を seed で散らす（完全再現じゃなくても雰囲気OK）
  const bigIdx = new Set<number>();
  const nBig = Math.min(maxBig, Math.floor(base.length / 5));
  for (let k = 0; k < nBig; k++) {
    const idx = hashString(`${seed}:big:${k}`) % Math.max(1, base.length);
    bigIdx.add(idx);
  }

  for (let i = 0; i < base.length; i++) {
    tiles.push({ big: bigIdx.has(i), p: base[i] });
  }
  return tiles;
}

// =========================
// Discover flip tile
// =========================
function DiscoverFlipTile({
  slotIndex,
  big,
  post,
  onInViewChange,
}: {
  slotIndex: number;
  big: boolean;
  post: PostRow | null;
  onInViewChange: (slotIndex: number, inView: boolean) => void;
}) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const inView = useInView(ref as any, { margin: "120px" });

  useEffect(() => {
    onInViewChange(slotIndex, inView);
  }, [inView, onInViewChange, slotIndex]);

  const tileSpan = big ? "col-span-2 row-span-2" : "col-span-1 row-span-1";

  const thumb = post ? getFirstSquareThumb(post) : null;
  const display = post?.profile?.display_name ?? "ユーザー";
  const isPublic = post?.profile?.is_public ?? true;
  const placeName = post?.place_name ?? "";
  const genre = post?.place_genre ?? null;
  const href = post?.id ? `/posts/${post.id}` : "#";

  return (
    <Link
      ref={ref}
      href={href}
      aria-disabled={!post}
      className={[
        "relative block overflow-hidden bg-slate-100",
        "focus:outline-none focus:ring-2 focus:ring-orange-400",
        "gm-press ring-1 ring-black/[.05]",
        tileSpan,
      ].join(" ")}
      onClick={(e) => {
        if (!post) e.preventDefault();
      }}
    >
      <div className="relative w-full aspect-square">
        <AnimatePresence mode="wait">
          <motion.div
            key={post?.id ?? `empty-${slotIndex}`}
            className="absolute inset-0"
            initial={{ rotateY: 90, opacity: 0.9 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0.9 }}
            transition={{ duration: 0.55, ease: [0.2, 0.9, 0.2, 1] }}
            style={{ transformStyle: "preserve-3d" }}
          >
            {thumb ? (
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0, filter: "blur(12px) brightness(0.75)", transform: "translateX(-10px) scale(1.02)" }}
                animate={{ opacity: 1, filter: "blur(0px) brightness(1)", transform: "translateX(0px) scale(1)" }}
                transition={{ duration: 0.9, ease: [0.2, 0.9, 0.2, 1] }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </motion.div>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-white to-slate-100">
                <div className="p-2 text-[11px] text-slate-500 line-clamp-6">
                  {placeName ? `📍 ${placeName}\n` : ""}
                  {post?.content ? post.content : "投稿"}
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/15" />

            <div className="hidden md:flex absolute left-2 top-2 items-center gap-1 text-[11px] font-medium text-white drop-shadow">
              <span className="max-w-[120px] truncate">{display}</span>
              {!isPublic && <Lock size={12} className="text-white/90" />}
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 space-y-1">
              <div className="inline-flex max-w-full items-center rounded-full bg-black/35 px-2 py-1 text-[10px] text-white/90 backdrop-blur">
                <span className="truncate">{placeName ? placeName : " "}</span>
              </div>
              {genre ? (
                <div className="inline-flex max-w-full items-center rounded-full bg-black/35 px-2 py-1 text-[10px] text-white/90 backdrop-blur">
                  <span className="truncate">{genre}</span>
                </div>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[radial-gradient(circle_at_20%_10%,#000,transparent_40%),radial-gradient(circle_at_80%_90%,#000,transparent_40%)]" />
      </div>
    </Link>
  );
}

// =========================
// DiscoverGrid
// =========================
type DiscoverSlot = { big: boolean; postId: string };

function DiscoverGrid({
  posts,
  meId,
  seed,
}: {
  posts: PostRow[];
  meId: string | null;
  seed: string;
}) {
  const discoverBase = useMemo(() => (meId ? posts.filter((p) => p.user_id !== meId) : posts), [posts, meId]);

  const discoverGridPosts = useMemo(() => {
    const jitterWeight = 8;
    const scored = discoverBase.map((p, rank) => {
      const jitter = (hashString(`${seed}:order:${p.id}`) % 1000) / 1000;
      const key = rank + jitter * jitterWeight;
      return { p, key };
    });
    scored.sort((a, b) => a.key - b.key);
    return scored.map((x) => x.p);
  }, [discoverBase, seed]);

  const discoverTiles = useMemo(() => {
    return planDiscoverTiles(discoverGridPosts, seed, { maxTiles: 12, maxBig: 3 });
  }, [discoverGridPosts, seed]);

  const [discoverSlots, setDiscoverSlots] = useState<DiscoverSlot[]>([]);
  const visibleSlotsRef = useRef<Set<number>>(new Set());

  const onInViewChange = (slotIndex: number, inView: boolean) => {
    const s = visibleSlotsRef.current;
    if (inView) s.add(slotIndex);
    else s.delete(slotIndex);
  };

  useEffect(() => {
    const initial = discoverTiles.map((t) => ({ big: t.big, postId: t.p.id }));
    setDiscoverSlots(initial);
  }, [discoverTiles]);

  const cursorRef = useRef(0);
  const getNextCandidateId = (avoid: Set<string>) => {
    const arr = discoverGridPosts;
    if (arr.length === 0) return null;

    const start = cursorRef.current;
    for (let k = 0; k < arr.length; k++) {
      const i = (start + k) % arr.length;
      const id = arr[i]?.id;
      if (id && !avoid.has(id)) {
        cursorRef.current = (i + 1) % arr.length;
        return id;
      }
    }
    return arr[Math.floor(Math.random() * arr.length)]?.id ?? null;
  };

  useEffect(() => {
    if (discoverSlots.length === 0) return;
    if (discoverGridPosts.length === 0) return;

    const t = window.setInterval(() => {
      const visible = Array.from(visibleSlotsRef.current);
      if (visible.length === 0) return;

      const slotIndex = visible[Math.floor(Math.random() * visible.length)];
      if (slotIndex == null) return;

      setDiscoverSlots((prev) => {
        if (!prev[slotIndex]) return prev;

        const currentIds = new Set(prev.map((s) => s.postId));
        const nextId = getNextCandidateId(currentIds);
        if (!nextId) return prev;
        if (nextId === prev[slotIndex].postId) return prev;

        const copy = prev.slice();
        copy[slotIndex] = { ...copy[slotIndex], postId: nextId };
        return copy;
      });
    }, 2000);

    return () => window.clearInterval(t);
  }, [discoverSlots.length, discoverGridPosts]);

  const postById = useMemo(() => {
    const m = new Map<string, PostRow>();
    for (const p of discoverGridPosts) m.set(p.id, p);
    for (const p of posts) m.set(p.id, p);
    return m;
  }, [discoverGridPosts, posts]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-[2px] md:gap-2 [grid-auto-flow:dense]">
        {discoverSlots.map((slot, slotIndex) => {
          const p = postById.get(slot.postId) ?? null;
          return (
            <DiscoverFlipTile
              key={`slot-${slotIndex}`}
              slotIndex={slotIndex}
              big={slot.big}
              post={p}
              onInViewChange={onInViewChange}
            />
          );
        })}
      </div>

      <div className="pb-2 pt-4 text-center text-[11px] text-slate-500">
        <Link className="font-semibold text-orange-700 hover:underline" href="/timeline?tab=discover">
          発見タブで全部見る
        </Link>
      </div>
    </div>
  );
}

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
  const [posts, setPosts] = useState<PostLite[]>(initialPosts ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [meta, setMeta] = useState<SuggestMeta>(initialMeta ?? null);

  // ✅ 追加：ゼロフォロー用 discover grid の投稿
  const [discoverPosts, setDiscoverPosts] = useState<PostRow[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  const followCount = meta?.followCount ?? 0;
  const hasMore = !!nextCursor;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (nextCursor) params.set("cursor", nextCursor);
      params.set("limit", "20");

      const res = await fetch(`/api/timeline/friends?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!res.ok) return;

      const json = await res.json();
      const newPosts = (json.posts ?? []) as PostLite[];
      const newCursor = (json.nextCursor ?? null) as string | null;

      setPosts((prev) => [...prev, ...newPosts]);
      setNextCursor(newCursor);

      if (!meta && json.meta) setMeta(json.meta as SuggestMeta);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor, meta]);

  const suggestBlock = useMemo(() => {
    const sug = meta?.suggestion;
    const users = sug?.users ?? [];
    if (!sug?.title || users.length === 0) return null;

    return (
      <SuggestFollowCard
        title={sug.title}
        subtitle={sug.subtitle ?? null}
        users={users.map((u) => ({
          id: u.id,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          is_following: !!u.is_following,
          reason: (u.reason ?? u.subtitle ?? null) as any,
        }))}
      />
    );
  }, [meta]);

  const suggestAtIndex = useMemo(() => {
    const x = meta?.suggestAtIndex;
    return typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 1;
  }, [meta]);

  // ✅ followCount==0 で posts==0 のときだけ discover grid を取りに行く
  useEffect(() => {
    if (!meId) return;
    if (followCount !== 0) return;
    if ((posts?.length ?? 0) > 0) return;
    if (discoverPosts.length > 0 || discoverLoading) return;

    (async () => {
      setDiscoverLoading(true);
      try {
        const params = new URLSearchParams({ limit: "60" });
        const res = await fetch(`/api/timeline/discover?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const arr = (json.posts ?? []) as PostRow[];
        setDiscoverPosts(arr);
      } finally {
        setDiscoverLoading(false);
      }
    })();
  }, [meId, followCount, posts, discoverPosts.length, discoverLoading]);

  // -------------------------
  // Views
  // -------------------------
  if (!meId) {
    return (
      <EmptyState
        title="友達のタイムラインを見るにはログインが必要です"
        desc="ログインすると、フォローした人の投稿がここに並びます。"
        primaryHref="/auth/login"
        primaryLabel="ログイン"
        secondaryHref="/"
        secondaryLabel="トップへ"
      />
    );
  }

  // ✅ フォローゼロ向け：welcome + discover grid
  if (followCount === 0 && (posts?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          title="ようこそGourmeetへ！まずは発見タブから友達をフォローしてみましょう"
          desc=""
          primaryHref="/search"
          primaryLabel="友達を検索する"
          secondaryHref="/timeline?tab=discover"
          secondaryLabel="発見を見る"
        />

        {/* 0/1フォロー向け suggestion が来ていれば、そのまま併置 */}
        {suggestBlock ? <div>{suggestBlock}</div> : null}

        <div className="rounded-2xl border border-black/[.06] bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">みんなの投稿をのぞいてみる</div>

          <div className="mt-3">
            {discoverLoading && discoverPosts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">読み込み中...</div>
            ) : discoverPosts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">表示できる投稿がありません</div>
            ) : (
              <DiscoverGrid posts={discoverPosts} meId={meId} seed={`friends-welcome:${meId}`} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // 投稿が0件で、サジェストだけはある
  if ((posts?.length ?? 0) === 0 && suggestBlock) {
    return (
      <div className="flex flex-col gap-4">
        {suggestBlock}
        <EmptyState
          title="まだ友達の投稿がありません"
          desc="まずは気になる人をフォローして、タイムラインを育てよう。"
          primaryHref="/search"
          primaryLabel="ユーザー/店を探す"
          secondaryHref="/timeline?tab=discover"
          secondaryLabel="発見を見る"
        />
      </div>
    );
  }

  // 投稿が0件で、サジェストも無い（フォローはあるが投稿がない等）
  if ((posts?.length ?? 0) === 0) {
    return (
      <EmptyState
        title="フォロー中の人の投稿がまだありません"
        desc="フォローを増やすか、しばらくしてからまた見に来てね。"
        primaryHref="/search"
        primaryLabel="探す"
        secondaryHref="/timeline?tab=discover"
        secondaryLabel="発見を見る"
      />
    );
  }

  // 通常描画
  return (
    <div>
      <div className="flex flex-col items-stretch gap-6">
        {(posts ?? []).map((p, idx) => (
          <React.Fragment key={p?.id ?? `row-${idx}`}>
            {idx === suggestAtIndex ? suggestBlock : null}
            <TimelinePostList posts={[p]} meId={meId} />
          </React.Fragment>
        ))}

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