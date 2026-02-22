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

// =========================
// White FAQ (no height:auto jank)
// - grid-rows animation avoids the "最後にカクッ" from height:auto
// =========================
function GuestFAQ() {
  const reduceMotion = useReducedMotion();

 const items = [

  {
    q: "Gourmeetってなに？",
    a: "デート、居酒屋、会食....大切なお店選び、グルメサイトの平均評価に疲れていませんか？ Gourmeetは、遠くの誰だかわからない点数じゃなくて、あなたの大切な人たちの「ここ良かった」に出会える、グルメ専用の新しいSNSです。あなたが行って良かった店を「大切な人に勧めたい」という気持ちで気軽に投稿できます。",
  },
  {
    q: "どんな人に向いてる？",
    a: "「友達のお気に入りのお店を知りたい」「お気に入りのお店を友達に知ってほしい」「次どこ行くか友達と相談したい」そんな人にぴったりです。外食をこれまで以上に楽しみたい人におすすめです。",
  },
  {
    q: "投稿を見るだけでも使える？",
    a: "はい。ログインなしでも一部の公開投稿はプレビューできます。ログインすると全部の機能が使えます。",
  },
  {
    q: "店選びにどう役立つの？",
    a: "価格感・雰囲気・おすすめ度が投稿にまとまっているので、候補の比較が一瞬でできます。",
  },
  {
    q: "フォローすると相手に通知される？",
    a: "はい、フォローしたことが相手に分かります。相手が非公開アカウントの場合、フォローリクエストが承認されると相手の投稿が見えるようになります。",
  },
  {
    q: "非公開アカウントって何？",
    a: "フォローが承認された人だけに投稿を見せる設定です。友達だけに共有したい人向けです。",
  },
  {
    q: "ブロックはできる？",
    a: "できます。ブロックすると、お互いの投稿やプロフィールが表示されなくなります。",
  },
  {
    q: "投稿には何を書けばいい？",
    a: "お店を訪れた際に感じたイチオシポイントやおすすめ度、豊富に用意されたお店の特徴タグなどを合わせて自由に表現できます。もちろん、簡単な一言でもOK。写真＋店名があれば、十分おすすめになります。あなただけのグルメ体験をシェアしてください！",
  },
  {
    q: "投稿するとき、お店情報はどうやって入れるの？",
    a: "店名を入力すると、Googleマップの店舗情報（店名・住所など）を自動的に取得して表示します。",
  },
  {
    q: "発見タブって何？",
    a: "全国の投稿から、新しいお店やユーザーを見つけるためのタブです。",
  },
  {
    q: "友達がいなくても楽しめる？",
    a: "発見タブで雰囲気は掴めます。友達や家族、恋人と一緒に使うとさらに楽しめます！",
  },
  {
    q: "お店検索はできる？",
    a: "できます。検索機能では、エリアや駅名、ジャンルやお店の特徴タグなど、豊富な条件を使った絞り込みが可能です。今日のあなたに一番合ったお店を簡単に見つけられます！",
  },
  {
    q: "コレクションって何？",
    a: "「行きたい」「あとで見返したい」投稿やお店を、目的別に自分専用のリストとして残しておける機能です。",
  },
  {
    q: "保存した店をあとから見返せる？",
    a: "はい。自分のコレクションからいつでも見返せます。",
  },
  {
    q: "アカウント作成に必要なものは？",
    a: "メールアドレスまたはGoogleアカウントによるサインアップに対応しています。どちらも数秒で完了します！",
  },
  {
    q: "ほんとに無料？後から課金ある？",
    a: "完全無料です。",
  },
  {
    q: "友達に“詳しく教えて”って聞ける？",
    a: "できます。気になる投稿に「詳細リクエスト」を送って、雰囲気やおすすめポイントを追加で聞けます。匿名でも送れるので、気軽に質問できます。",
  },
];

  const [open, setOpen] = useState<number | null>(0);

  const t = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.2, 0.9, 0.2, 1] as any };

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[.06] bg-white">
      <div className="px-4 pb-2 pt-4">
        <div className="text-base font-semibold text-slate-900">よくある質問</div>
      </div>

      <div className="divide-y divide-black/[.06]">
        {items.map((it, idx) => {
          const isOpen = open === idx;
          const panelId = `faq-panel-${idx}`;
          const buttonId = `faq-btn-${idx}`;

          return (
            <div key={idx}>
              <button
                id={buttonId}
                type="button"
                aria-controls={panelId}
                aria-expanded={isOpen}
                onClick={() => setOpen((cur) => (cur === idx ? null : idx))}
                className={[
                  "w-full text-left px-4 py-4",
                  "hover:bg-black/[.02] active:bg-black/[.03]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[15px] font-semibold text-slate-900">
                    {it.q}
                  </div>

                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={t}
                    className="shrink-0 text-slate-500"
                    aria-hidden="true"
                  >
                    <ChevronDown size={18} />
                  </motion.span>
                </div>
              </button>

              {/* ✅ No height:auto.
                  We animate grid rows 0fr <-> 1fr, which is smooth + stable. */}
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
                    <div className="text-[13px] leading-6 text-slate-600">
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
          className="block w-full rounded-xl bg-orange-600 py-3 text-center text-sm font-semibold text-white hover:bg-orange-800"
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
        "relative block overflow-hidden bg-slate-100",
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
      {/* 線は “gap” + 親bg で作る（外周も1px） */}
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

  // ✅ guest/zero-follow 共通：discover grid 投稿
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
    return typeof x === "number" && Number.isFinite(x)
      ? Math.max(0, Math.floor(x))
      : 1;
  }, [meta]);

  // ✅ guest でも zero-follow でも “プレビューgrid” を取る（必要時のみ）
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

  // ✅ 未ログイン：welcome + grid + faq
  if (!meId) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          title="ようこそGourmeetへ！まずは雰囲気をのぞいてみましょう"
          desc="ログインすると、投稿/フォロー/いいね/コレクションなど様々な機能が使えるようになります。"
          primaryHref="/auth/login"
          primaryLabel="ログイン"
          secondaryHref="/auth/signup"
          secondaryLabel="アカウント作成"
        />

        <div className="rounded-2xl border border-black/[.06] bg-white overflow-hidden p-0">
          <div className="px-4 pt-4">
            <div className="text-sm font-semibold text-slate-900">
              みんなの投稿をのぞいてみる
            </div>
          </div>

          <div className="mt-3">
            {discoverLoading && discoverPosts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                読み込み中...
              </div>
            ) : discoverPosts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                表示できる投稿がありません
              </div>
            ) : (
              <DiscoverGrid posts={discoverPosts} meId={null} seed={`guest-welcome`} />
            )}
          </div>
        </div>

        <GuestFAQ />
      </div>
    );
  }

  // ✅ フォローゼロ：welcome + suggestion + grid
  if (followCount === 0 && (posts?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          title="ようこそGourmeetへ！まずは発見タブから友達をフォローしてみましょう。"
          desc=""
          primaryHref="/search"
          primaryLabel="友達を検索する"
          secondaryHref="/timeline?tab=discover"
          secondaryLabel="発見してみる"
        />

        {suggestBlock ? <div>{suggestBlock}</div> : null}

        <div className="rounded-2xl border border-black/[.06] bg-white overflow-hidden p-0">
          <div className="px-4 pt-4">
            <div className="text-sm font-semibold text-slate-900">
              みんなの投稿をのぞいてみる
            </div>
          </div>

          <div className="mt-3">
            {discoverLoading && discoverPosts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                読み込み中...
              </div>
            ) : discoverPosts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                表示できる投稿がありません
              </div>
            ) : (
              <DiscoverGrid
                posts={discoverPosts}
                meId={meId}
                seed={`friends-welcome:${meId}`}
              />
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