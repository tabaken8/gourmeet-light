// src/components/timeline/FriendsTimelineClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TimelinePostList from "@/components/timeline/TimelinePostList";
import PostsSkeleton from "@/components/PostsSkeleton";
import SuggestFollowCard from "@/components/SuggestFollowCard";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { Lock, ChevronDown } from "lucide-react";

type PostLite = any;

type SuggestMeta =
  | {
      followCount?: number;
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

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
};

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

// =========================
// Full bleed helper (parent padding independent)
// =========================
function FullBleed({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        // force full viewport width even inside padded containers
        "relative left-1/2 right-1/2 w-screen -translate-x-1/2",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function CTASection({
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
    <div className="rounded-2xl border border-black/[.06] dark:border-white/[.08] bg-white dark:bg-[#16181e] p-6">
      <div className="text-base font-semibold text-slate-900 dark:text-gray-100">{title}</div>
      {desc ? (
        <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-400">{desc}</div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={primaryHref}
          className="inline-flex items-center justify-center rounded-full bg-orange-700 px-4 py-2 text-sm font-semibold !text-white hover:bg-orange-800"
        >
          {primaryLabel}
        </Link>

        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-white/15"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// =========================
// Guest FAQ (no height:auto jank)
// - 表記揺れ: 「なに」統一
// - ログイン/無料/詳細リクエストを上へ
// =========================
function GuestFAQ() {
  const reduceMotion = useReducedMotion();

  const items = [
    {
      q: "Gourmeetってなに？",
      a: "Gourmeetは、遠くの誰だかわからない人の口コミよりも、あなたの大切な人たちの「ここ良かった」で店に出会える、グルメSNSです。写真だけの投稿でもOK。気軽にシェアして、あとから自分のコレクションとして見返せます。",
    },
    {
      q: "投稿を見るだけでも使える？",
      a: "はい。ログインなしでも一部の公開投稿はプレビューできます。ログインすると、フォローした人の投稿や非公開投稿（承認制）など、より自分向けのタイムラインが使えるようになります。",
    },
    {
      q: "ほんとに無料？後から課金ある？",
      a: "いまは完全無料です。後から急に課金されることはありません。",
    },
    {
      q: "アカウント作成に必要なものはなに？",
      a: "メールアドレスまたはGoogleアカウントでサインアップできます。だれでも数秒（体感5秒）で始められます。",
    },
    {
      q: "店選びにどう役立つ？",
      a: "写真・店名に加えて、雰囲気や価格感などが投稿にまとまっているので、候補の比較がスムーズになります。",
    },
    {
      q: "どんな人に向いてる？",
      a: "「友達のお気に入りを知りたい」「自分のお気に入りを友達に勧めたい」「次どこ行くか一緒に考えたい」そんな人に合います。",
    },
    {
      q: "友達がいなくても楽しめる？",
      a: "発見タブで雰囲気は掴めます。友達や家族、恋人と一緒に使うとさらに楽しくなります。",
    },
    {
      q: "フォローすると相手に通知される？",
      a: "はい。フォローしたことは相手に分かります。相手が非公開アカウントの場合、フォローリクエストが承認されると投稿が見えるようになります。",
    },
    {
      q: "非公開アカウントってなに？",
      a: "フォローが承認された人だけに投稿を見せる設定です。友達だけに共有したい人向けです。",
    },
    {
      q: "ブロックはできる？",
      a: "できます。ブロックすると、お互いの投稿やプロフィールが表示されなくなります。",
    },
    {
      q: "投稿にはなにを書けばいい？",
      a: "イチオシポイントやおすすめ度、タグなどを自由に書けます。もちろん一言でもOK。写真＋店名だけでも十分おすすめになります。",
    },
    {
      q: "投稿するとき、店情報はどうやって入れるの？",
      a: "店名を入力すると、Googleマップの店舗情報（店名・住所など）を自動で取得して表示します。",
    },
    {
      q: "詳細リクエスト機能ってなに？",
      a: "気になる投稿に「詳細リクエスト」を送って、雰囲気やおすすめポイントを追加で聞ける機能です。匿名でも送れるので、気軽に質問できます。",
    },
    {
      q: "発見タブってなに？",
      a: "全国の公開投稿から、新しい店やユーザーを見つけるためのタブです。",
    },
    {
      q: "お店検索はできる？",
      a: "できます。エリアや駅名、ジャンルやタグなど、条件を組み合わせて絞り込めます。",
    },
    {
      q: "コレクションってなに？",
      a: "「行きたい」「あとで見返したい」投稿やお店を、自分専用のリストとして保存できる機能です。",
    },
    {
      q: "保存した店をあとから見返せる？",
      a: "はい。自分のコレクションからいつでも見返せます。",
    },
  ];

  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set([0]));

  const t = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.2, 0.9, 0.2, 1] as any };

  const toggle = useCallback((idx: number) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[.06] dark:border-white/[.08] bg-white dark:bg-[#16181e]">
      <div className="px-4 pb-2 pt-4">
        <div className="text-base font-semibold text-slate-900 dark:text-gray-100">よくある質問</div>
      </div>

      <div className="divide-y divide-black/[.06] dark:divide-white/[.08]">
        {items.map((it, idx) => {
          const isOpen = openSet.has(idx);
          const panelId = `faq-panel-${idx}`;
          const buttonId = `faq-btn-${idx}`;

          return (
            <div key={idx}>
              <button
                id={buttonId}
                type="button"
                aria-controls={panelId}
                aria-expanded={isOpen}
                onClick={() => toggle(idx)}
                className={[
                  "w-full text-left px-4 py-4",
                  "hover:bg-black/[.02] dark:hover:bg-white/[.03] active:bg-black/[.03] dark:active:bg-white/[.05]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[15px] font-semibold text-slate-900 dark:text-gray-100">
                    {it.q}
                  </div>

                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={t}
                    className="shrink-0 text-slate-500 dark:text-gray-400"
                    aria-hidden="true"
                  >
                    <ChevronDown size={18} />
                  </motion.span>
                </div>
              </button>

              <motion.div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                initial={false}
                animate={{
                  gridTemplateRows: isOpen ? "1fr" : "0fr",
                  opacity: isOpen ? 1 : 0,
                }}
                transition={t}
                className="grid px-4"
                style={{ willChange: "grid-template-rows, opacity" }}
              >
                <div className="overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{
                      y: isOpen ? 0 : -2,
                      filter: isOpen ? "blur(0px)" : "blur(2px)",
                    }}
                    transition={t}
                    className="pb-4"
                  >
                    <div className="text-[13px] leading-6 text-slate-600 dark:text-gray-400">
                      {it.a}
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      <div className="p-4">
        <Link
          href="/auth/signup"
          className="block w-full rounded-xl bg-orange-600 py-3 text-center text-sm font-semibold !text-white hover:bg-orange-800"
        >
          サインアップはこちら
        </Link>
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
function planDiscoverTiles(
  posts: PostRow[],
  seed: string,
  opts?: { maxTiles?: number; maxBig?: number }
) {
  const maxTiles = opts?.maxTiles ?? 12; // 3x4
  const maxBig = opts?.maxBig ?? 3;

  const base = posts.slice(0, Math.max(maxTiles, 1));
  const tiles: PlannedTile[] = [];

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

function gateHref(next: string) {
  return next;
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

  const href = post?.id ? gateHref(`/posts/${post.id}`) : "#";

  return (
    <Link
      ref={ref}
      href={href}
      aria-disabled={!post}
      className={[
        "relative block overflow-hidden bg-slate-100 dark:bg-[#1e2026]",
        "focus:outline-none focus:ring-2 focus:ring-orange-400",
        "gm-press",
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
            transition={{ duration: 0.6, ease: [0.15, 0.85, 0.2, 1] }}
            style={{ transformStyle: "preserve-3d" }}
          >
            {thumb ? (
              <motion.div
                className="absolute inset-0"
                initial={{
                  opacity: 0,
                  filter: "blur(14px) brightness(0.8)",
                  transform: "translateX(-12px) scale(1.03)",
                }}
                animate={{
                  opacity: 1,
                  filter: "blur(0px) brightness(1)",
                  transform: "translateX(0px) scale(1)",
                }}
                transition={{ duration: 1.05, ease: [0.2, 0.9, 0.2, 1] }}
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
              <div className="absolute inset-0 bg-gradient-to-br from-white to-slate-100 dark:from-[#1e2026] dark:to-[#16181e]">
                <div className="p-2 text-[11px] text-slate-500 dark:text-gray-400 line-clamp-6">
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
  const discoverBase = useMemo(
    () => (meId ? posts.filter((p) => p.user_id !== meId) : posts),
    [posts, meId]
  );

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
    return planDiscoverTiles(discoverGridPosts, seed, {
      maxTiles: 12,
      maxBig: 3,
    });
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
      <div className="bg-black/[.06] p-[1px]">
        <div className="grid grid-cols-3 gap-[1px] md:gap-[2px] [grid-auto-flow:dense]">
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
      </div>

      <div className="pb-2 pt-4 text-center text-[11px] text-slate-500">
        <Link
          className="font-semibold text-orange-700 hover:underline"
          href={gateHref("/timeline?tab=discover")}
        >
          発見タブで全部見る
        </Link>
      </div>
    </div>
  );
}

// =========================
// FriendsTimelineClient
// =========================
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
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialNextCursor ?? null
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [meta, setMeta] = useState<SuggestMeta>(initialMeta ?? null);

  // guest/zero-follow 共通：discover grid 投稿
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

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore(); },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

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
    return typeof x === "number" && Number.isFinite(x)
      ? Math.max(0, Math.floor(x))
      : 1;
  }, [meta]);

  // guest でも zero-follow でも "プレビューgrid" を取る（必要時のみ）
  useEffect(() => {
    const needPreview =
      (!meId && discoverPosts.length === 0) ||
      (meId &&
        followCount === 0 &&
        (posts?.length ?? 0) === 0 &&
        discoverPosts.length === 0);

    if (!needPreview) return;
    if (discoverLoading) return;

    (async () => {
      setDiscoverLoading(true);
      try {
        const params = new URLSearchParams({ limit: "60" });
        const res = await fetch(`/api/timeline/discover?${params.toString()}`, {
          cache: "no-store",
        });
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

  // ✅ 未ログイン：枠なし説明 → 上にログイン導線 → 端までgrid → FAQ
  if (!meId) {
    return (
      <div className="flex flex-col gap-4">
{/* 先頭説明（枠なし） */}
<div className="mt-2 px-1">
  <div className="text-[24px] leading-tight font-extrabold text-slate-900 dark:text-gray-100">
    ようこそGourmeetへ！
          </div>

  <div className="mt-2 text-[14px] leading-6 text-slate-600 dark:text-gray-400">
    Gourmeetは、「星3.3の平均点」や「知らない人の口コミ」よりも、身近な友達の
    <span className="font-semibold text-slate-900 dark:text-gray-100"> &ldquo;ここ良かったよ&rdquo; </span>
    でお店に出会える、グルメ専用SNSです。
    <br />
    <br />
    お店を探すときは友達の写真・場所・価格感がまとまった友達の投稿を眺めるだけで候補が絞れて、良かったお店はタイムラインで気軽にシェアして、充実したプロフィール機能に蓄積できます。
  </div>
        </div>

        {/* ログイン/サインアップ導線（上へ） */}
        <div className="rounded-2xl border border-black/[.06] dark:border-white/[.08] bg-white dark:bg-[#16181e] p-5">
          <div className="text-sm font-semibold text-slate-900 dark:text-gray-100">
            だれでも5秒でサインアップ
          </div>
          <div className="mt-1 text-[13px] leading-6 text-slate-600 dark:text-gray-400">
            メールアドレス or Googleからから、すぐ始められます。
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-full bg-orange-700 px-4 py-2 text-sm font-semibold !text-white hover:bg-orange-800"
            >
              アカウント作成
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-white/15"
            >
              ログイン
            </Link>
          </div>
        </div>

        {/* ✅ 端まで表示（Searchと同じ "余白ゼロ感"） */}
        <FullBleed className="md:relative md:left-auto md:right-auto md:w-auto md:translate-x-0">
          {discoverLoading && discoverPosts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">読み込み中...</div>
          ) : discoverPosts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              表示できる投稿がありません
            </div>
          ) : (
            <div className="md:rounded-2xl md:border md:border-black/[.06] dark:md:border-white/[.08] md:bg-white dark:md:bg-[#16181e] overflow-hidden">
              <DiscoverGrid posts={discoverPosts} meId={null} seed="guest-welcome" />
            </div>
          )}
        </FullBleed>

        <GuestFAQ />
      </div>
    );
  }

  // ✅ フォローゼロ：welcome + suggestion + grid + 導線
  if (followCount === 0 && (posts?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-black/[.06] dark:border-white/[.08] bg-white dark:bg-[#16181e] p-6">
          <div className="text-base font-semibold text-slate-900 dark:text-gray-100">
            ようこそGourmeetへ
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-400">
            まずは発見タブで、友達や気になる人をフォローしてタイムラインを育ててみましょう。
          </div>
        </div>

        {suggestBlock ? <div>{suggestBlock}</div> : null}

        {/* ここも同様に端までOK（好み） */}
        <FullBleed className="md:relative md:left-auto md:right-auto md:w-auto md:translate-x-0">
          {discoverLoading && discoverPosts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">読み込み中...</div>
          ) : discoverPosts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              表示できる投稿がありません
            </div>
          ) : (
            <div className="md:rounded-2xl md:border md:border-black/[.06] dark:md:border-white/[.08] md:bg-white dark:md:bg-[#16181e] overflow-hidden">
              <DiscoverGrid
                posts={discoverPosts}
                meId={meId}
                seed={`friends-welcome:${meId}`}
              />
            </div>
          )}
        </FullBleed>

        <CTASection
          title="友達を探してフォローする"
          desc="検索からユーザーを見つけたり、発見タブで新しい投稿を追いかけられます。"
          primaryHref="/search"
          primaryLabel="友達を検索する"
          secondaryHref="/timeline?tab=discover"
          secondaryLabel="発見してみる"
        />
      </div>
    );
  }

  // 投稿が0件で、サジェストだけはある
  if ((posts?.length ?? 0) === 0 && suggestBlock) {
    return (
      <div className="flex flex-col gap-4">
        {suggestBlock}
        <CTASection
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

  // 投稿が0件で、サジェストも無い
  if ((posts?.length ?? 0) === 0) {
    return (
      <CTASection
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
    <div className="rounded-2xl bg-white dark:bg-[#16181e]">
      <div className="flex flex-col items-stretch gap-6">
        {(posts ?? []).map((p, idx) => (
          <React.Fragment key={p?.id ?? `row-${idx}`}>
            {idx === suggestAtIndex ? suggestBlock : null}
            <TimelinePostList posts={[p]} meId={meId} />
          </React.Fragment>
        ))}

        {(posts?.length ?? 0) <= suggestAtIndex ? suggestBlock : null}
      </div>

      {hasMore ? <div ref={sentinelRef} className="h-px" /> : null}

      {loadingMore ? (
        <div className="mt-4">
          <PostsSkeleton />
        </div>
      ) : null}
    </div>
  );
}