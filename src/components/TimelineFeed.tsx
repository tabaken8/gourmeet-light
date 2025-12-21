// src/components/TimelineFeed.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Lock, ChevronDown, ChevronUp } from "lucide-react";

import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";
import LoginCard from "@/components/LoginCard";

type ImageVariant = {
  thumb?: string | null;
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
  place_name: string | null;
  place_address: string | null;
  place_id: string | null;

  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;

  profile: ProfileLite | null;

  likeCount?: number;
  likedByMe?: boolean;

  k_hop?: number | null;
};

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

function getTimelineImageUrls(p: PostRow): string[] {
  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];

  const fromVariants = variants
    .map((v) => (v?.full ?? v?.thumb ?? null))
    .filter((x): x is string => !!x);

  if (fromVariants.length > 0) return fromVariants;

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy.filter((x): x is string => !!x);
}

function getFirstThumb(p: PostRow): string | null {
  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const v = variants[0];
  const best = v?.thumb ?? v?.full ?? null;
  if (best) return best;

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy[0] ?? null;
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

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "orange";
}) {
  const cls =
    tone === "orange"
      ? "border-orange-200 bg-orange-50 text-orange-800"
      : "border-black/10 bg-white text-slate-700";

  return (
    <span
      className={[
        "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium",
        cls,
      ].join(" ")}
    >
      {children}
    </span>
  );
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
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  // friends用：モバイルで「Google写真」を開いた投稿だけ展開
  const [openPhotos, setOpenPhotos] = useState<Record<string, boolean>>({});

  // ✅ refreshごとに順序が変わるseed（描画中は固定）
  const [seed] = useState(() => makeSeed());

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  async function loadMore(reset = false) {
    if (loading) return;
    if (!reset && done) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("tab", activeTab);
    params.set("limit", activeTab === "discover" ? "24" : "5");
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

  // ✅ discover用に「seedで順序を揺らした配列」をHooksの外で生成しておく（if内でuseMemoしない）
  const discoverBase = useMemo(() => {
    const base = meId ? posts.filter((p) => p.user_id !== meId) : posts;
    return base;
  }, [posts, meId]);

  const discoverGridPosts = useMemo(() => {
    // APIの順位を壊しすぎないシャッフル（強度はここで調整）
    const jitterWeight = 8;

    const scored = discoverBase.map((p, rank) => {
      const jitter = (hashString(`${seed}:order:${p.id}`) % 1000) / 1000; // 0..1
      const key = rank + jitter * jitterWeight;
      return { p, key };
    });

    scored.sort((a, b) => a.key - b.key);
    return scored.map((x) => x.p);
  }, [discoverBase, seed]);

  // friendsタブで未ログインなら統一LoginCardへ
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
  // ✅ DISCOVER: 3列固定 + 正方形タイル + たまに2x2大正方形（seedで変化）
  // =========================
  if (activeTab === "discover") {
    return (
      <div className="w-full">
        <div
          className="
            grid grid-cols-3
            gap-[2px] md:gap-2
            [grid-auto-flow:dense]
          "
        >
          {discoverGridPosts.map((p, idx) => {
            const prof = p.profile;
            const display = prof?.display_name ?? "ユーザー";
            const isPublic = prof?.is_public ?? true;

            const thumb = getFirstThumb(p);

            // ✅ seedで「どれが大正方形か」も決める
            const h = hashString(`${seed}:big:${p.id}`);
            const big = idx > 3 && h % 4 === 0; // 13小さく→増える

            const tileSpan = big ? "col-span-2 row-span-2" : "col-span-1 row-span-1";

            return (
              <Link
                key={p.id}
                href={`/posts/${p.id}`}
                className={[
                  "relative block overflow-hidden",
                  "rounded-none",
                  "bg-slate-100",
                  "focus:outline-none focus:ring-2 focus:ring-orange-400",
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
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-slate-100">
                      <div className="p-2 text-[11px] text-slate-500 line-clamp-6">
                        {p.place_name ? `📍 ${p.place_name}\n` : ""}
                        {p.content ? p.content : "投稿"}
                      </div>
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/45 to-transparent" />

                  <div className="absolute left-2 top-2 flex items-center gap-1 text-[11px] font-medium text-white drop-shadow">
                    <span className="max-w-[120px] truncate">{display}</span>
                    {!isPublic && <Lock size={12} className="text-white/90" />}
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-2">
                    <div className="truncate text-[10px] text-white/90">
                      {p.place_name ? p.place_name : " "}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div ref={sentinelRef} className="h-10" />

        {loading && (
          <div className="pb-8 pt-4 text-center text-xs text-slate-500">読み込み中...</div>
        )}

        {error && !error.includes("Unauthorized") && (
          <div className="pb-8 pt-4 text-center text-xs text-red-600">{error}</div>
        )}

        {done && posts.length > 0 && (
          <div className="pb-8 pt-4 text-center text-[11px] text-slate-400">
            これ以上ありません
          </div>
        )}
      </div>
    );
  }

  // =========================
  // ✅ FRIENDS: 既存タイムライン
  // =========================
  const MOBILE_THUMBS = 3;

  return (
    <div className="flex flex-col items-stretch gap-6">
      {posts.map((p) => {
        const prof = p.profile;
        const display = prof?.display_name ?? "ユーザー";
        const avatar = prof?.avatar_url ?? null;
        const isPublic = prof?.is_public ?? true;
        const initial = (display || "U").slice(0, 1).toUpperCase();

        const mapUrl = p.place_id
          ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
          : p.place_address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_address)}`
          : null;

        const timelineImageUrls = getTimelineImageUrls(p);

        const initialLikeCount = p.likeCount ?? 0;
        const initialLiked = p.likedByMe ?? false;

        const hasPlace = !!p.place_id;
        const isPhotosOpen = !!openPhotos[p.id];

        const togglePhotos = () => {
          if (!hasPlace) return;
          setOpenPhotos((prev) => ({ ...prev, [p.id]: !prev[p.id] }));
        };

        const score =
          typeof p.recommend_score === "number" && p.recommend_score >= 1 && p.recommend_score <= 10
            ? p.recommend_score
            : null;

        const priceLabel = formatPrice(p);

        return (
          <article
            key={p.id}
            className="
              bg-white
              rounded-none md:rounded-2xl
              shadow-none md:shadow-sm
              border-y border-black/[.06] md:border md:border-black/[.06]
              transition
            "
          >
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
              <div className="md:border-r md:border-black/[.05]">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/u/${p.user_id}`}
                      className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700"
                    >
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
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

                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{formatJST(p.created_at)}</span>
                        <Link href={`/posts/${p.id}`} className="text-orange-600 hover:underline">
                          詳細
                        </Link>
                      </div>
                    </div>
                  </div>

                  <PostMoreMenu postId={p.id} isMine={meId === p.user_id} />
                </div>

                {timelineImageUrls.length > 0 && (
                  <Link href={`/posts/${p.id}`} className="block">
                    <PostImageCarousel postId={p.id} imageUrls={timelineImageUrls} syncUrl={false} />
                  </Link>
                )}

                <div className="space-y-2 px-4 py-3">
                  {p.content && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                      {p.content}
                    </p>
                  )}

                  {(p.place_name || hasPlace || score || priceLabel) && (
                    <div className="flex items-center gap-2">
                      {p.place_name ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1 text-xs text-orange-700">
                          <MapPin size={14} className="shrink-0" />
                          {mapUrl ? (
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate hover:underline"
                            >
                              {p.place_name}
                            </a>
                          ) : (
                            <span className="truncate">{p.place_name}</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex-1" />
                      )}

                      {(score || priceLabel) && (
                        <div className="flex items-center gap-2 shrink-0">
                          {score ? <Badge tone="orange">おすすめ {score}/10</Badge> : null}
                          {priceLabel ? <Badge>{priceLabel}</Badge> : null}
                        </div>
                      )}

                      {hasPlace && (
                        <button
                          type="button"
                          onClick={togglePhotos}
                          aria-label={isPhotosOpen ? "Googleの写真を閉じる" : "Googleの写真を表示"}
                          className="
                            md:hidden
                            inline-flex h-8 w-8 items-center justify-center
                            rounded-full border border-black/10 bg-white
                            active:scale-[0.99]
                          "
                        >
                          <GoogleMark className="h-4 w-4" />
                          {isPhotosOpen ? (
                            <ChevronUp size={14} className="-ml-0.5 text-slate-700" />
                          ) : (
                            <ChevronDown size={14} className="-ml-0.5 text-slate-700" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-4 pb-3 pt-1">
                  <PostActions
                    postId={p.id}
                    postUserId={p.user_id}
                    initialLiked={initialLiked}
                    initialLikeCount={initialLikeCount}
                    initialWanted={false}
                    initialBookmarked={false}
                    initialWantCount={0}
                    initialBookmarkCount={0}
                  />
                  <PostCollectionButton postId={p.id} />
                </div>

                <div className="px-4 pb-4">
                  <PostComments postId={p.id} postUserId={p.user_id} meId={meId} previewCount={2} />
                </div>
              </div>

              <aside className="hidden md:block p-4">
                {p.place_id ? (
                  <PlacePhotoGallery
                    placeId={p.place_id}
                    placeName={p.place_name}
                    per={8}
                    maxThumbs={8}
                  />
                ) : (
                  <div className="text-xs text-slate-400">写真を取得できませんでした</div>
                )}
              </aside>
            </div>

            {p.place_id && isPhotosOpen ? (
              <div className="md:hidden pb-4 px-4">
                <PlacePhotoGallery
                  placeId={p.place_id}
                  placeName={p.place_name}
                  per={MOBILE_THUMBS}
                  maxThumbs={MOBILE_THUMBS}
                />
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

      {done && posts.length > 0 && (
        <div className="pb-8 text-center text-[11px] text-slate-400">これ以上ありません</div>
      )}
    </div>
  );
}
