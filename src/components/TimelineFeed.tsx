// src/components/TimelineFeed.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions, { LikerLite } from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";
import LoginCard from "@/components/LoginCard";
import SuggestFollowCard, { SuggestUser } from "@/components/SuggestFollowCard";
import FollowButton from "@/components/FollowButton";

type ImageVariant = { thumb?: string | null; full?: string | null; [k: string]: any };
type ImageAsset = { pin?: string | null; square?: string | null; full?: string | null; [k: string]: any };

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
};

type PostRow = {
  id: string;
  content: string | null;
  user_id: string;
  created_at: string;

  image_urls: string[] | null;
  image_variants: ImageVariant[] | null;

  image_assets?: ImageAsset[] | null;
  cover_square_url?: string | null;
  cover_full_url?: string | null;
  cover_pin_url?: string | null;

  place_name: string | null;
  place_address: string | null;
  place_id: string | null;
  place_genre?: string | null;

  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;

  profile: ProfileLite | null;

  likeCount?: number;
  likedByMe?: boolean;
  initialLikers?: LikerLite[];

  // 注入投稿（最新タブ用）
  injected?: boolean;
  inject_reason?: string | null;
  inject_follow_mode?: "follow" | "followback" | null;
  inject_target_user_id?: string | null;
};

type TimelineMeta = {
  suggestOnce?: boolean;
  suggestAtIndex?: number;
  suggestion?: {
    title: string;
    subtitle?: string | null;
    users: SuggestUser[];
  } | null;
};

type DiscoverTile = { p: PostRow; big: boolean };

function formatJST(iso: string) {
  const dt = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

/**
 * friends Timelineでは「正方形URLのみ」
 */
function getTimelineSquareUrls(p: PostRow): string[] {
  const cover = p.cover_square_url ? [p.cover_square_url] : [];

  const assets = Array.isArray(p.image_assets) ? p.image_assets : [];
  const squaresFromAssets = assets.map((a) => a?.square ?? null).filter((x): x is string => !!x);

  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const thumbsFromVariants = variants.map((v) => v?.thumb ?? null).filter((x): x is string => !!x);

  const all = [...cover, ...squaresFromAssets, ...thumbsFromVariants];
  const uniq = Array.from(new Set(all)).filter(Boolean);

  return uniq;
}

function getFirstSquareThumb(p: PostRow): string | null {
  if (p.cover_square_url) return p.cover_square_url;

  const assets = Array.isArray(p.image_assets) ? p.image_assets : [];
  if (assets[0]?.square) return assets[0].square;

  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  if (variants[0]?.thumb) return variants[0].thumb;

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy[0] ?? null;
}

function extractPrefCity(address: string | null | undefined): string | null {
  if (!address) return null;

  const s = address
    .replace(/^日本[、,\s]*/u, "")
    .replace(/〒\s*\d{3}-?\d{4}\s*/u, "")
    .trim();

  const m = s.match(/(東京都|北海道|大阪府|京都府|.{2,3}県)([^0-9\s,、]{1,20}?(市|区|町|村))/u);
  if (!m) return null;

  return `${m[1]}${m[2]}`;
}

function GoogleMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.7 1.2 9.1 3.5l6.8-6.8C35.3 2.7 29.9 0 24 0 14.8 0 6.7 5.1 2.4 12.6l7.9 6.1C12.4 12.1 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.2-3.2-.5-4.7H24v9h12.3c-.5 2.7-2.1 5-4.5 6.5v5.4h7.3c4.3-4 6.8-9.9 6.8-16.2z"
      />
      <path
        fill="#FBBC04"
        d="M10.3 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6v-5.4H2.4c-1.6 3.2-2.4 6.9-2.4 10.9s.9 7.7 2.4 10.9l7.9-6.2z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.3-5.4c-2 1.4-4.6 2.3-7.9 2.3-6.2 0-11.6-3.6-14-8.8l-7.9 6.2C6.7 42.9 14.8 48 24 48z"
      />
    </svg>
  );
}

function formatYen(n: number) {
  try {
    return new Intl.NumberFormat("ja-JP").format(n);
  } catch {
    return String(n);
  }
}

function formatPrice(p: PostRow): string | null {
  if (typeof p.price_yen === "number" && Number.isFinite(p.price_yen)) {
    return `¥${formatYen(Math.max(0, Math.floor(p.price_yen)))}`;
  }
  if (p.price_range) {
    switch (p.price_range) {
      case "~999":
        return "〜¥999";
      case "1000-1999":
        return "¥1,000〜¥1,999";
      case "2000-2999":
        return "¥2,000〜¥2,999";
      case "3000-3999":
        return "¥3,000〜¥3,999";
      case "4000-4999":
        return "¥4,000〜¥4,999";
      case "5000-6999":
        return "¥5,000〜¥6,999";
      case "7000-9999":
        return "¥7,000〜¥9,999";
      case "10000+":
        return "¥10,000〜";
      default:
        return p.price_range;
    }
  }
  return null;
}

// ---- discover tiles planning ----
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeSeed(): string {
  try {
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
      const a = new Uint32Array(2);
      crypto.getRandomValues(a);
      return `${a[0]}-${a[1]}`;
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function planDiscoverTiles(
  ordered: PostRow[],
  seed: string,
  opts?: { bigDenom?: number; minIndexForBig?: number; tailGuard?: number; maxBig?: number }
): DiscoverTile[] {
  const bigDenom = opts?.bigDenom ?? 4;
  const minIndexForBig = opts?.minIndexForBig ?? 3;
  const tailGuard = opts?.tailGuard ?? 7;
  const maxBig = opts?.maxBig ?? 4;

  const occ: boolean[][] = [];
  const ensureRow = (r: number) => {
    while (occ.length <= r) occ.push([false, false, false]);
  };

  const firstEmpty = () => {
    for (let r = 0; r < occ.length; r++) {
      for (let c = 0; c < 3; c++) if (!occ[r][c]) return { r, c };
    }
    ensureRow(occ.length);
    return { r: occ.length - 1, c: 0 };
  };

  const canBigAt = (r: number, c: number) => {
    if (c > 1) return false;
    ensureRow(r);
    ensureRow(r + 1);
    return !occ[r][c] && !occ[r][c + 1] && !occ[r + 1][c] && !occ[r + 1][c + 1];
  };

  const markSmall = (r: number, c: number) => {
    ensureRow(r);
    occ[r][c] = true;
  };

  const markBig = (r: number, c: number) => {
    ensureRow(r);
    ensureRow(r + 1);
    occ[r][c] = true;
    occ[r][c + 1] = true;
    occ[r + 1][c] = true;
    occ[r + 1][c + 1] = true;
  };

  let bigCount = 0;
  const out: DiscoverTile[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    const remain = ordered.length - i;
    const { r, c } = firstEmpty();

    const h = hashString(`${seed}:big:${p.id}`);
    const wantBigByRand = h % bigDenom === 0;
    const allowByTail = remain > tailGuard;

    const wantBig = i > minIndexForBig && allowByTail && wantBigByRand && bigCount < maxBig && canBigAt(r, c);

    if (wantBig) {
      markBig(r, c);
      bigCount++;
      out.push({ p, big: true });
    } else {
      markSmall(r, c);
      out.push({ p, big: false });
    }
  }

  return out;
}

// =========================
// small hook: in-view observer
// =========================
function useInView(ref: React.RefObject<Element | null>, opts?: IntersectionObserverInit) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver((entries) => {
      setInView(!!entries[0]?.isIntersecting);
    }, opts);

    io.observe(el);
    return () => io.disconnect();
  }, [ref, opts?.root, opts?.rootMargin, opts?.threshold]);

  return inView;
}

// =========================
// Discover flip tile
// - 2秒ごと差し替え時に「カード裏返り」
// - 画像は “わざとゆっくり明るく” でロード誤魔化す
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
  const inView = useInView(ref as any, { rootMargin: "120px" });

  useEffect(() => {
    onInViewChange(slotIndex, inView);
  }, [inView, onInViewChange, slotIndex]);

  const tileSpan = big ? "col-span-2 row-span-2" : "col-span-1 row-span-1";

  // 画像の「LPっぽい」出現：暗→明、ぼかし→クリア、端から軽くワイプ
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
            {/* front content */}
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

            {/* overlay */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/15" />

            {/* top label (pc) */}
            <div className="hidden md:flex absolute left-2 top-2 items-center gap-1 text-[11px] font-medium text-white drop-shadow">
              <span className="max-w-[120px] truncate">{display}</span>
              {!isPublic && <Lock size={12} className="text-white/90" />}
            </div>

            {/* bottom chips */}
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

        {/* “カード裏面”っぽい、極薄のノイズ（好みで） */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[radial-gradient(circle_at_20%_10%,#000,transparent_40%),radial-gradient(circle_at_80%_90%,#000,transparent_40%)]" />
      </div>
    </Link>
  );
}

// =========================
// DiscoverGrid (隔離してhook順序を守る)
// - 2秒ごとに visible タイルの1つを別投稿へ
// =========================
type DiscoverSlot = { big: boolean; postId: string };

function DiscoverGrid({
  posts,
  meId,
  seed,
  loading,
  done,
  error,
  sentinelRef,
}: {
  posts: PostRow[];
  meId: string | null;
  seed: string;
  loading: boolean;
  done: boolean;
  error: string | null;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
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
    return planDiscoverTiles(discoverGridPosts, seed, {
      bigDenom: 4,
      minIndexForBig: 3,
      tailGuard: 7,
      maxBig: 4,
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

    const intervalMs = 2000;

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
    }, intervalMs);

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

      <div ref={sentinelRef} className="h-10" />

      {loading && <div className="pb-8 pt-4 text-center text-xs text-slate-500">読み込み中...</div>}
      {error && !error.includes("Unauthorized") && (
        <div className="pb-8 pt-4 text-center text-xs text-red-600">{error}</div>
      )}
      {done && posts.length > 0 && (
        <div className="pb-8 pt-4 text-center text-[11px] text-slate-400">ログインしてもっと見つける</div>
      )}
    </div>
  );
}

export default function TimelineFeed({
  activeTab,
  meId,
}: {
  activeTab: "friends" | "discover";
  meId: string | null;
}) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openPhotos, setOpenPhotos] = useState<Record<string, boolean>>({});
  const [seed] = useState(() => makeSeed());

  // Suggest
  const [suggestMeta, setSuggestMeta] = useState<TimelineMeta | null>(null);
  const shownSuggestRef = useRef(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  async function loadMore(reset = false) {
    if (loading) return;
    if (!reset && done) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("tab", activeTab);
    params.set("limit", activeTab === "discover" ? "24" : "5");
    params.set("seed", seed); // ✅ リロードごとにランダム / 同一スクロール内は一貫
    if (!reset && cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/timeline?${params.toString()}`);
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      const newPosts: PostRow[] = payload.posts ?? [];
      const nextCursor: string | null = payload.nextCursor ?? null;

      // meta（最初のページだけ採用）
      if (reset) {
        setSuggestMeta(payload?.meta ?? null);
        shownSuggestRef.current = false;
      }

      setPosts((prev) => {
        if (reset) return newPosts;

        // ✅ prevの順序を維持しつつ newPosts を末尾に追加（重複は追加しない）
        const seen = new Set(prev.map((p) => p.id));
        const appended = newPosts.filter((p) => !seen.has(p.id));
        return [...prev, ...appended];
      });

      setCursor(nextCursor);
      if (!nextCursor || newPosts.length === 0) setDone(true);
    } catch (e: any) {
      const msg = e?.message ?? "読み込みに失敗しました";
      setError(msg);
      if (String(msg).includes("Unauthorized")) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);
    setOpenPhotos({});
    setSuggestMeta(null);
    shownSuggestRef.current = false;
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (!sentinelRef.current) return;
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
  }, [cursor, done, loading, activeTab]);

  // ---------- friends derived ----------
  const suggestAt = suggestMeta?.suggestAtIndex ?? 1;
  const suggest = suggestMeta?.suggestion ?? null;

  const renderItems = useMemo(() => {
    if (activeTab !== "friends") return [] as Array<any>;

    const canInsert = !!(suggest && suggest.users?.length) && !shownSuggestRef.current;
    if (!canInsert) return posts.map((p) => ({ kind: "post" as const, post: p }));

    const out: any[] = [];
    for (let i = 0; i < posts.length; i++) {
      if (i === suggestAt) out.push({ kind: "suggest" as const });
      out.push({ kind: "post" as const, post: posts[i] });
    }
    return out;
  }, [activeTab, posts, suggest, suggestAt]);

  useEffect(() => {
    if (activeTab !== "friends") return;
    if (suggest && suggest.users?.length && renderItems.some((x: any) => x.kind === "suggest")) {
      shownSuggestRef.current = true;
    }
  }, [activeTab, renderItems, suggest]);

  // login gate
  if (error?.includes("Unauthorized") && activeTab === "friends") {
    return (
      <LoginCard
        nextPath="/timeline?tab=friends"
        title="続けるにはログイン"
        description="友達の投稿を見る・投稿する・フォロー・コレクションなどが使えるようになります。"
      />
    );
  }

  if (posts.length === 0 && loading) {
    return <div className="flex min-h-[40vh] items-center justify-center px-2 text-xs text-slate-500">読み込み中...</div>;
  }

  if (posts.length === 0 && !loading) {
    return <div className="flex min-h-[40vh] items-center justify-center px-2 text-xs text-slate-500">まだ投稿がありません。</div>;
  }

  // =========================
  // DISCOVER（発見）
  // =========================
  if (activeTab === "discover") {
    return (
      <DiscoverGrid
        posts={posts}
        meId={meId}
        seed={seed}
        loading={loading}
        done={done}
        error={error}
        sentinelRef={sentinelRef}
      />
    );
  }

  // =========================
  // FRIENDS（最新）
  // =========================
  return (
    <div className="flex flex-col items-stretch gap-6">
      {renderItems.map((item: any, idx: number) => {
        if (item.kind === "suggest") {
          return (
            <SuggestFollowCard
              key={`suggest-${idx}`}
              title={suggest!.title}
              subtitle={suggest!.subtitle}
              users={suggest!.users}
            />
          );
        }

        const p: PostRow = item.post;
        const prof = p.profile;
        const display = prof?.display_name ?? "ユーザー";
        const avatar = prof?.avatar_url ?? null;
        const isPublic = prof?.is_public ?? true;
        const initial = (display || "U").slice(0, 1).toUpperCase();

        const mapUrl = p.place_id
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_name ?? "place")}&query_place_id=${encodeURIComponent(p.place_id)}`
          : p.place_address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_address)}`
          : null;

        const areaLabel = extractPrefCity(p.place_address);
        const timelineImageUrls = getTimelineSquareUrls(p);

        const initialLikeCount = p.likeCount ?? 0;
        const initialLiked = p.likedByMe ?? false;
        const initialLikers = p.initialLikers ?? [];

        const hasPlace = !!p.place_id;
        const isPhotosOpen = !!openPhotos[p.id];

        const togglePhotos = () => {
          if (!hasPlace) return;
          setOpenPhotos((prev) => ({ ...prev, [p.id]: !prev[p.id] }));
        };

        const score =
          typeof p.recommend_score === "number" && p.recommend_score >= 0 && p.recommend_score <= 10
            ? p.recommend_score
            : null;

        const priceLabel = formatPrice(p);

        const showInjectedFollow = !!(p.inject_target_user_id && p.inject_target_user_id !== meId);

        return (
          <article key={p.id} className="gm-card gm-press overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
              <div className="md:border-r md:border-black/[.05]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link
                      href={`/u/${p.user_id}`}
                      className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700"
                    >
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        initial
                      )}
                    </Link>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/u/${p.user_id}`}
                          className="truncate text-xs font-medium text-slate-900 hover:underline"
                        >
                          {display}
                        </Link>
                        {!isPublic && <Lock size={12} className="shrink-0 text-slate-500" />}
                      </div>

                      {/* 注入理由があればここで明記 */}
                      <div className="text-[11px] text-slate-500">
                        {p.injected && p.inject_reason ? p.inject_reason : "最新"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* ✅ 未フォロー注入投稿のフォローボタン（あなたの現行 FollowButton props に合わせた） */}
                    {showInjectedFollow ? (
                      <FollowButton
                        targetUserId={p.inject_target_user_id!}
                        initiallyFollowing={false}
                        className="!px-3 !py-1 !text-xs"
                      />
                    ) : null}

                    <PostMoreMenu postId={p.id} isMine={meId === p.user_id} />
                  </div>
                </div>

                {/* Strip */}
                <div className="px-4 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.place_name ? (
                      <div className="gm-chip inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-800">
                        <MapPin size={13} className="opacity-70" />

                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[280px] truncate hover:underline"
                            title={p.place_address ?? undefined}
                          >
                            {p.place_name}
                            {areaLabel ? <span className="ml-2 text-slate-500">{areaLabel}</span> : null}
                          </a>
                        ) : (
                          <span className="max-w-[280px] truncate" title={p.place_address ?? undefined}>
                            {p.place_name}
                            {areaLabel ? <span className="ml-2 text-slate-500">({areaLabel})</span> : null}
                          </span>
                        )}
                      </div>
                    ) : null}

                    {p.place_genre ? (
                      <span className="gm-chip inline-flex items-center px-2 py-1 text-[11px] text-slate-700">
                        {p.place_genre}
                      </span>
                    ) : null}

                    {score !== null ? (
                      <span className="gm-chip inline-flex items-center px-2 py-1 text-[11px] text-orange-800">
                        おすすめ <span className="ml-1 font-semibold">{score}/10</span>
                      </span>
                    ) : null}

                    {priceLabel ? (
                      <span className="gm-chip inline-flex items-center px-2 py-1 text-[11px] text-slate-700">
                        {priceLabel}
                      </span>
                    ) : null}

                    <span className="flex-1" />

                    <Link
                      href={`/posts/${p.id}`}
                      className="gm-chip inline-flex items-center px-2 py-1 text-[11px] text-orange-700 hover:underline"
                    >
                      お店の詳細
                    </Link>

                    <span className="gm-chip inline-flex items-center px-2 py-1 text-[11px] text-slate-500">
                      {formatJST(p.created_at)}
                    </span>

                    {hasPlace && (
                      <button
                        type="button"
                        onClick={togglePhotos}
                        aria-label={isPhotosOpen ? "Googleの写真を閉じる" : "Googleの写真を表示"}
                        className="md:hidden gm-chip gm-press inline-flex h-7 items-center gap-1 px-2 text-[11px] text-slate-700"
                      >
                        <GoogleMark className="h-4 w-4" />
                        <span className="leading-none">写真</span>
                        {isPhotosOpen ? (
                          <ChevronUp size={14} className="text-slate-700" />
                        ) : (
                          <ChevronDown size={14} className="text-slate-700" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Media */}
                {timelineImageUrls.length > 0 && (
                  <div className="block w-full aspect-square overflow-hidden bg-slate-100">
                    <PostImageCarousel
                      postId={p.id}
                      imageUrls={timelineImageUrls}
                      syncUrl={false}
                      eager={false}
                      preloadNeighbors={true}
                      fit="cover"
                      aspect="square"
                    />
                  </div>
                )}

                {/* Body */}
                <div className="space-y-2 px-4 py-4">
                  {p.content && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{p.content}</p>}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-4 pb-3 pt-0">
                  <PostActions
                    postId={p.id}
                    postUserId={p.user_id}
                    initialLiked={initialLiked}
                    initialLikeCount={initialLikeCount}
                    initialLikers={initialLikers}
                    meId={meId}
                    initialWanted={false}
                    initialBookmarked={false}
                    initialWantCount={0}
                    initialBookmarkCount={0}
                  />
                  <PostCollectionButton postId={p.id} />
                </div>

                {/* Comments */}
                <div className="px-4 pb-5">
                  <PostComments postId={p.id} postUserId={p.user_id} meId={meId} previewCount={2} />
                </div>
              </div>

              {/* Right panel (PC) */}
              <aside className="hidden md:block p-4">
                {p.place_id ? (
                  <PlacePhotoGallery placeId={p.place_id} placeName={p.place_name} per={8} maxThumbs={8} />
                ) : (
                  <div className="text-xs text-slate-400">写真を取得できませんでした</div>
                )}
              </aside>
            </div>

            {/* Mobile expand photos */}
            {p.place_id && isPhotosOpen ? (
              <div className="md:hidden pb-5 px-4">
                <PlacePhotoGallery placeId={p.place_id} placeName={p.place_name} per={3} maxThumbs={3} />
              </div>
            ) : null}
          </article>
        );
      })}

      <div ref={sentinelRef} className="h-10" />

      {loading && <div className="pb-8 text-center text-xs text-slate-500">読み込み中...</div>}
      {error && !error.includes("Unauthorized") && <div className="pb-8 text-center text-xs text-red-600">{error}</div>}
      {done && posts.length > 0 && <div className="pb-8 text-center text-[11px] text-slate-400">これ以上ありません</div>}
    </div>
  );
}
