// src/components/TimelineFeed.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Lock, ChevronDown, ChevronUp, UserPlus } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions, { type LikerLite } from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";
import LoginCard from "@/components/LoginCard";

type ImageVariant = {
  thumb?: string | null;
  full?: string | null;
  [k: string]: any;
};

type ImageAsset = {
  pin?: string | null;
  square?: string | null;
  full?: string | null;
  [k: string]: any;
};

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

  // friends injection
  injected?: boolean;
  injected_reason?: string | null;
  recommended_by?: ProfileLite | null;
  is_following_author_by_me?: boolean;
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
 * ✅ friends Timelineでは「正方形URLのみ」を返す
 */
function getTimelineSquareUrls(p: PostRow): string[] {
  const cover = p.cover_square_url ? [p.cover_square_url] : [];

  const assets = Array.isArray(p.image_assets) ? p.image_assets : [];
  const squaresFromAssets = assets.map((a) => a?.square ?? null).filter((x): x is string => !!x);

  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const thumbsFromVariants = variants.map((v) => v?.thumb ?? null).filter((x): x is string => !!x);

  const all = [...cover, ...squaresFromAssets, ...thumbsFromVariants];
  return Array.from(new Set(all)).filter(Boolean);
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

  const m = s.match(
    /(東京都|北海道|大阪府|京都府|.{2,3}県)([^0-9\s,、]{1,20}?(市|区|町|村))/u
  );
  if (!m) return null;

  const pref = m[1];
  const city = m[2];
  return `${pref}${city}`;
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

// ---- seed & hash helpers ----
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
      for (let c = 0; c < 3; c++) {
        if (!occ[r][c]) return { r, c };
      }
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

    const wantBig =
      i > minIndexForBig && allowByTail && wantBigByRand && bigCount < maxBig && canBigAt(r, c);

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

function FollowButton({
  targetUserId,
  targetProfile,
  meId,
  initialFollowing,
}: {
  targetUserId: string;
  targetProfile: ProfileLite | null;
  meId: string | null;
  initialFollowing: boolean;
}) {
  const supabase = createClientComponentClient();
  const [state, setState] = useState<"none" | "pending" | "accepted">(initialFollowing ? "accepted" : "none");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setState(initialFollowing ? "accepted" : "none");
  }, [initialFollowing]);

  const onFollow = async () => {
    if (!meId) return alert("ログインが必要です");
    if (loading) return;
    if (state !== "none") return;
    if (meId === targetUserId) return;

    setLoading(true);

    // public なら即 accepted、そうでなければ pending（あなたの仕様に無難に寄せる）
    const nextStatus = targetProfile?.is_public ? "accepted" : "pending";
    setState(nextStatus);

    const { error } = await supabase
      .from("follows")
      .upsert(
        { follower_id: meId, followee_id: targetUserId, status: nextStatus },
        { onConflict: "follower_id,followee_id" }
      );

    if (error) {
      console.error("follow upsert error:", error);
      setState("none");
      alert("フォローに失敗しました");
    }

    setLoading(false);
  };

  const label = state === "accepted" ? "フォロー中" : state === "pending" ? "申請中" : "フォロー";

  return (
    <button
      type="button"
      onClick={onFollow}
      disabled={loading || state !== "none"}
      className={[
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold",
        state === "none"
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "bg-slate-100 text-slate-700",
        "disabled:opacity-70",
      ].join(" ")}
      aria-label="フォロー"
      title="フォロー"
    >
      <UserPlus size={14} />
      {label}
    </button>
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

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  async function loadMore(reset = false) {
    if (loading) return;
    if (!reset && done) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("tab", activeTab);
    params.set("limit", activeTab === "discover" ? "24" : "10");
    if (!reset && cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/timeline?${params.toString()}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      const newPosts: PostRow[] = payload.posts ?? [];
      const nextCursor: string | null = payload.nextCursor ?? null;

      setPosts((prev) => (reset ? newPosts : [...prev, ...newPosts]));
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

  const discoverBase = useMemo(() => {
    return meId ? posts.filter((p) => p.user_id !== meId) : posts;
  }, [posts, meId]);

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
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-2 text-xs text-slate-500">
        読み込み中...
      </div>
    );
  }

  if (posts.length === 0 && !loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-2 text-xs text-slate-500">
        まだ投稿がありません。
      </div>
    );
  }

  // =========================
  // DISCOVER
  // =========================
  if (activeTab === "discover") {
    return (
      <div className="w-full">
        <div className="grid grid-cols-3 gap-[2px] md:gap-2 [grid-auto-flow:dense]">
          {discoverTiles.map(({ p, big }) => {
            const prof = p.profile;
            const display = prof?.display_name ?? "ユーザー";
            const isPublic = prof?.is_public ?? true;

            const thumb = getFirstSquareThumb(p);
            const tileSpan = big ? "col-span-2 row-span-2" : "col-span-1 row-span-1";

            return (
              <Link
                key={p.id}
                href={`/posts/${p.id}`}
                className={[
                  "relative block overflow-hidden bg-slate-100",
                  "focus:outline-none focus:ring-2 focus:ring-orange-400",
                  "gm-press ring-1 ring-black/[.05]",
                  tileSpan,
                ].join(" ")}
              >
                <div className="relative w-full aspect-square">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-slate-100">
                      <div className="p-2 text-[11px] text-slate-500 line-clamp-6">
                        {p.place_name ? `📍 ${p.place_name}\n` : ""}
                        {p.content ? p.content : "投稿"}
                      </div>
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10" />

                  <div className="hidden md:flex absolute left-2 top-2 items-center gap-2 text-[11px] font-medium text-white drop-shadow">
                    <span className="max-w-[120px] truncate">{display}</span>
                    {!isPublic && <Lock size={12} className="text-white/90" />}
                  </div>

                  {/* ✅ genre label */}
                  {p.place_genre ? (
                    <div className="pointer-events-none absolute left-2 bottom-2">
                      <div className="inline-flex max-w-[75vw] items-center rounded-full bg-black/35 px-2 py-1 text-[10px] text-white/90 backdrop-blur">
                        <span className="truncate">{p.place_genre}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Link>
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

  // =========================
  // FRIENDS
  // =========================
  return (
    <div className="flex flex-col items-stretch gap-6">
      {posts.map((p) => {
        const prof = p.profile;
        const display = prof?.display_name ?? "ユーザー";
        const avatar = prof?.avatar_url ?? null;
        const isPublic = prof?.is_public ?? true;
        const initial = (display || "U").slice(0, 1).toUpperCase();

        const mapUrl = p.place_id
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              p.place_name ?? "place"
            )}&query_place_id=${encodeURIComponent(p.place_id)}`
          : p.place_address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_address)}`
          : null;

        const areaLabel = extractPrefCity(p.place_address);
        const timelineImageUrls = getTimelineSquareUrls(p);

        const initialLikeCount = p.likeCount ?? 0;
        const initialLiked = p.likedByMe ?? false;

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
        const injected = !!p.injected;

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

                      {/* ✅ injected説明 */}
                      {injected ? (
                        <div className="text-[11px] text-slate-500">
                          {p.injected_reason ?? "あなたの友達がフォロー"}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">最新</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* ✅ injectedだけフォローボタン */}
                    {injected && meId && meId !== p.user_id && !p.is_following_author_by_me ? (
                      <FollowButton
                        targetUserId={p.user_id}
                        targetProfile={p.profile}
                        meId={meId}
                        initialFollowing={false}
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
                      詳細
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
                  {p.content && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{p.content}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-4 pb-3 pt-0">
                  <PostActions
                    postId={p.id}
                    postUserId={p.user_id}
                    initialLiked={initialLiked}
                    initialLikeCount={initialLikeCount}
                    initialLikers={p.initialLikers ?? []}
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
      {error && !error.includes("Unauthorized") && (
        <div className="pb-8 text-center text-xs text-red-600">{error}</div>
      )}
      {done && posts.length > 0 && <div className="pb-8 text-center text-[11px] text-slate-400">これ以上ありません</div>}
    </div>
  );
}
