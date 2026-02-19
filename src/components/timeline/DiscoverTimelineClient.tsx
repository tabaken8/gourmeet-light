// src/components/timeline/DiscoverTimelineClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  image_variants: any[] | null;
  image_assets?: any[] | null;

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
};

type DiscoverTile = { p: PostRow; big: boolean };
type DiscoverSlot = { big: boolean; postId: string };

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

function getFirstSquareThumb(p: PostRow): string | null {
  if (p.cover_square_url) return p.cover_square_url;
  const assets = Array.isArray(p.image_assets) ? p.image_assets : [];
  if (assets[0]?.square) return assets[0].square;
  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  if (variants[0]?.thumb) return variants[0].thumb;
  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy[0] ?? null;
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

// in-view
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
                <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
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

export default function DiscoverTimelineClient({
  meId,
}: {
  meId: string | null;
}) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seed] = useState(() => makeSeed());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  async function loadMore(reset = false) {
    if (loading) return;
    if (!reset && done) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", "24");
    if (!reset && cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/timeline/discover?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      const newPosts: PostRow[] = payload.posts ?? [];
      const nextCursor: string | null = payload.nextCursor ?? null;

      setPosts((prev) => {
        if (reset) return newPosts;
        const seen = new Set(prev.map((p) => p.id));
        const appended = newPosts.filter((p) => !seen.has(p.id));
        return [...prev, ...appended];
      });

      setCursor(nextCursor);
      if (!nextCursor || newPosts.length === 0) setDone(true);
    } catch (e: any) {
      setError(e?.message ?? "読み込みに失敗しました");
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [cursor, done, loading]);

  // ordering with jitter
  const discoverGridPosts = useMemo(() => {
    const jitterWeight = 8;
    const scored = posts.map((p, rank) => {
      const jitter = (hashString(`${seed}:order:${p.id}`) % 1000) / 1000;
      const key = rank + jitter * jitterWeight;
      return { p, key };
    });
    scored.sort((a, b) => a.key - b.key);
    return scored.map((x) => x.p);
  }, [posts, seed]);

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
      {error && <div className="pb-8 pt-4 text-center text-xs text-red-600">{error}</div>}
      {done && posts.length > 0 && (
        <div className="pb-8 pt-4 text-center text-[11px] text-slate-400">
          {meId ? "これ以上ありません" : "ログインしてもっと見つける"}
        </div>
      )}
    </div>
  );
}
