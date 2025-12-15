// src/components/TimelineFeed.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Lock } from "lucide-react";

import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";

type ImageVariant = {
  thumb?: string | null;
  full?: string | null;
  [k: string]: any;
};

type PlacePhotos = {
  refs: string[];
  attributionsHtml: string;
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

  profile: ProfileLite | null;
  placePhotos?: PlacePhotos | null;

  likeCount?: number;
  likedByMe?: boolean;
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

/**
 * タイムライン表示用の画像URL配列を作る。
 * - 新: image_variants があれば thumb を優先（＝軽い）
 * - 旧: image_urls を使う
 */
function getTimelineImageUrls(p: PostRow): string[] {
  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const fromVariants = variants
    .map((v) => (v?.thumb ?? v?.full ?? null))
    .filter((x): x is string => !!x);

  if (fromVariants.length > 0) return fromVariants;

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy.filter((x): x is string => !!x);
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

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  async function loadMore(reset = false) {
    if (loading) return;
    if (!reset && done) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("tab", activeTab);
    params.set("limit", "10");
    if (!reset && cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/timeline?${params.toString()}`);
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.error ?? `Failed (${res.status})`);
      }

      const newPosts: PostRow[] = payload.posts ?? [];
      const nextCursor: string | null = payload.nextCursor ?? null;

      setPosts((prev) => (reset ? newPosts : [...prev, ...newPosts]));
      setCursor(nextCursor);
      if (!nextCursor || newPosts.length === 0) setDone(true);
    } catch (e: any) {
      const msg = e?.message ?? "読み込みに失敗しました";
      setError(msg);

      // friends で未ログインならここに来る
      if (String(msg).includes("Unauthorized")) {
        setDone(true);
      }
    } finally {
      setLoading(false);
    }
  }

  // タブ切り替えでリセット
  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setDone(false);
    setError(null);
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 無限スクロール
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore(false);
      },
      { rootMargin: "600px" }
    );

    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, done, loading, activeTab]);

  // friends タブで Unauthorized のときだけログイン案内
  if (error?.includes("Unauthorized") && activeTab === "friends") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-2 text-xs text-slate-600">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="mb-3">友達タブはログインが必要です。</p>
          <Link
            className="inline-flex rounded-full bg-orange-600 px-4 py-2 text-xs font-medium text-white"
            href="/auth/login"
          >
            ログインする
          </Link>
          <div className="mt-3">
            <Link className="text-[11px] text-orange-600 underline" href="/timeline?tab=discover">
              公開投稿（discover）を見る
            </Link>
          </div>
        </div>
      </div>
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
        const placePhotos = p.placePhotos ?? null;

        const initialLikeCount = p.likeCount ?? 0;
        const initialLiked = p.likedByMe ?? false;

        return (
          <article key={p.id} className="rounded-2xl bg-white shadow-sm hover:shadow-md transition">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
              {/* 左：投稿本体 */}
              <div className="md:border-r md:border-black/[.05]">
                {/* 投稿者ヘッダー + More */}
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
                        {/* 投稿詳細へ */}
                        <Link href={`/posts/${p.id}`} className="text-orange-600 hover:underline">
                          詳細
                        </Link>
                      </div>
                    </div>
                  </div>

                  <PostMoreMenu postId={p.id} isMine={meId === p.user_id} />
                </div>

                {/* 画像（thumb優先） */}
                {timelineImageUrls.length > 0 && (
                  <Link href={`/posts/${p.id}`} className="block">
                    <PostImageCarousel
                      postId={p.id}
                      imageUrls={timelineImageUrls}
                      syncUrl={false}
                    />
                  </Link>
                )}

                {/* 本文 + 店舗 */}
                <div className="space-y-2 px-4 py-3">
                  {p.content && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                      {p.content}
                    </p>
                  )}

                  {p.place_name && (
                    <div className="flex items-center gap-1 text-xs text-orange-700">
                      <MapPin size={14} />
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
                  )}
                </div>

                {/* いいね等 + Collection */}
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

                {/* コメント */}
                <div className="px-4 pb-4">
                  <PostComments
                    postId={p.id}
                    postUserId={p.user_id}
                    meId={meId} // ✅ ここでログイン状態が伝わる → 余計なログインボタンが出なくなる
                    previewCount={2}
                  />
                </div>
              </div>

              {/* 右：Google Place写真 */}
              <aside className="hidden md:block p-4">
                {p.place_id && placePhotos?.refs?.length ? (
                  <PlacePhotoGallery
                    refs={placePhotos.refs}
                    placeName={p.place_name}
                    attributionsHtml={placePhotos.attributionsHtml}
                  />
                ) : (
                  <div className="text-xs text-slate-400">写真を取得できませんでした</div>
                )}
              </aside>
            </div>

            {/* モバイル：Place写真 */}
            {p.place_id && placePhotos?.refs?.length ? (
              <div className="md:hidden px-4 pb-4">
                <PlacePhotoGallery
                  refs={placePhotos.refs}
                  placeName={p.place_name}
                  attributionsHtml={placePhotos.attributionsHtml}
                />
              </div>
            ) : null}
          </article>
        );
      })}

      {/* 無限スクロールのトリガー */}
      <div ref={sentinelRef} className="h-10" />

      {loading && (
        <div className="pb-8 text-center text-xs text-slate-500">読み込み中...</div>
      )}

      {error && !error.includes("Unauthorized") && (
        <div className="pb-8 text-center text-xs text-red-600">{error}</div>
      )}

      {done && posts.length > 0 && (
        <div className="pb-8 text-center text-[11px] text-slate-400">これ以上ありません</div>
      )}
    </div>
  );
}
