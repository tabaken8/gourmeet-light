// src/app/(app)/posts/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

import PostImageCarousel from "@/components/PostImageCarousel";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostActions from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import GenreVoteInline from "@/components/GenreVoteInline";
import { MapPin } from "lucide-react";

// ✅ 重いのは遅延読み込み用の Server Components に分離
import PostCommentsBlock from "./parts/PostCommentsBlock";
import PlacePhotosBlock from "./parts/PlacePhotosBlock";
import MoreDiscoverBlock from "./parts/MoreDiscoverBlock";

export const dynamic = "force-dynamic";

type ImageVariant = { thumb?: string | null; full?: string | null; [k: string]: any };
type ProfileLite = { id: string; display_name: string | null; avatar_url: string | null; is_public?: boolean | null };

type PostRow = {
  id: string;
  content: string | null;
  user_id: string;
  created_at: string;
  image_urls: string[] | null;
  image_variants?: ImageVariant[] | null;

  place_name: string | null;
  place_address: string | null;
  place_id: string | null;

  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;

  profiles: ProfileLite | null;
};

function formatJST(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
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
      case "~999": return "〜¥999";
      case "1000-1999": return "¥1,000〜¥1,999";
      case "2000-2999": return "¥2,000〜¥2,999";
      case "3000-3999": return "¥3,000〜¥3,999";
      case "4000-4999": return "¥4,000〜¥4,999";
      case "5000-6999": return "¥5,000〜¥6,999";
      case "7000-9999": return "¥7,000〜¥9,999";
      case "10000-14999": return "¥10,000〜¥14,999";
      case "15000-19999": return "¥15,000〜¥19,999";
      case "20000-24999": return "¥20,000〜¥24,999";
      case "25000-29999": return "¥25,000〜¥29,999";
      case "30000-49999": return "¥30,000〜¥49,999";
      case "50000+": return "¥50,000〜";
      default: return p.price_range;
    }
  }
  return null;
}

function getAllImageUrls(p: PostRow): string[] {
  // ✅ まずvariantsがあればそれ優先
  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const fromVariants = variants
    .map((v) => (v?.full ?? v?.thumb ?? null))
    .filter((x): x is string => !!x);
  if (fromVariants.length > 0) return fromVariants;

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy.filter((x): x is string => !!x);
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { img_index?: string };
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- 画像インデックス（常に number） ----
  let safeIndex = 0;
  if (searchParams?.img_index) {
    const n = Number(searchParams.img_index);
    if (Number.isFinite(n) && n > 0) safeIndex = n - 1;
  }

  // ✅ ここは最小：post本体だけ先に取る
  const { data, error: postErr } = await supabase
    .from("posts")
    .select(
      `
      id,
      content,
      user_id,
      created_at,
      image_urls,
      image_variants,
      place_name,
      place_address,
      place_id,
      recommend_score,
      price_yen,
      price_range,
      profiles (
        id,
        display_name,
        avatar_url,
        is_public
      )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (postErr) return notFound();
  const post = data as PostRow | null;
  if (!post) return notFound();

  // ✅ likes系は並列にする（待ち時間削減）
  const likeCountPromise = supabase
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", post.id);

  const likedPromise = user
    ? supabase
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", post.id)
        .eq("user_id", user.id)
    : Promise.resolve({ count: 0 } as any);

  const [{ count: likeCount = 0 }, { count: likedCount = 0 }] = await Promise.all([likeCountPromise, likedPromise]);
  const initiallyLiked = (likedCount ?? 0) > 0;

  const prof = post.profiles;
  const display = prof?.display_name ?? "ユーザー";
  const avatar = prof?.avatar_url ?? null;
  const isPublic = prof?.is_public ?? true;
  const initial = (display || "U").slice(0, 1).toUpperCase();

  const score =
    typeof post.recommend_score === "number" && post.recommend_score >= 1 && post.recommend_score <= 10
      ? post.recommend_score
      : null;

  const priceLabel = formatPrice(post);

const mapUrl = post.place_id
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      post.place_name ?? "place"
    )}&query_place_id=${encodeURIComponent(post.place_id)}`
  : post.place_address
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.place_address)}`
  : null;


  const imageUrls = getAllImageUrls(post);

  return (
    <main className="mx-auto max-w-5xl px-3 md:px-6 py-6 md:py-10">
      <article className="gm-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/u/${post.user_id}`}
              className="gm-press flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700 ring-1 ring-black/[.06]"
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <Link href={`/u/${post.user_id}`} className="truncate text-sm font-semibold text-slate-900 hover:underline">
                  {display}
                </Link>
                {!isPublic ? <span className="text-[11px] text-slate-400">🔒</span> : null}
              </div>
              <div className="text-[11px] text-slate-500">投稿の詳細</div>
            </div>
          </div>

          <PostMoreMenu postId={post.id} isMine={user?.id === post.user_id} />
        </div>

        {/* Strip */}
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {post.place_name ? (
              <div className="gm-chip inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-800">
                <MapPin size={13} className="opacity-70" />
                {mapUrl ? (
                  <a target="_blank" rel="noopener noreferrer" href={mapUrl} className="max-w-[260px] truncate hover:underline">
                    {post.place_name}
                  </a>
                ) : (
                  <span className="max-w-[260px] truncate">{post.place_name}</span>
                )}
              </div>
            ) : null}

            {score ? (
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

            <span className="gm-chip inline-flex items-center px-2 py-1 text-[11px] text-slate-500">
              {formatJST(post.created_at)}
            </span>
          </div>

          {/* ✅ ジャンル投票も「表示はするが、ページ表示をブロックしない」 */}
          {post.place_id ? (
            <div className="mt-3 rounded-2xl border border-black/[.06] bg-white/70 p-3">
              <div className="mb-1 text-[11px] font-semibold text-slate-700">ジャンル</div>
              <Suspense fallback={<div className="text-xs text-slate-500">読み込み中...</div>}>
                {/* そのままでもOKだが、内部で重いなら GenreVoteInline を client fetch に寄せるとさらに速い */}
                <GenreVoteInline placeId={post.place_id} />
              </Suspense>
            </div>
          ) : null}
        </div>

        {/* Media */}
{/* ✅ Media：スマホは左右余白ゼロ（端まで） / md以上は通常 */}
{imageUrls.length > 0 ? (
  <div className="-mx-3 md:mx-0">
    <div className="block w-full aspect-square overflow-hidden bg-slate-100">
      <PostImageCarousel
        postId={post.id}
        imageUrls={imageUrls}
        initialIndex={safeIndex}
        syncUrl={false}
        // ↓ TimelineFeedで使ってるpropsが対応しているなら効く（未対応なら削除でOK）
        eager={false as any}
        preloadNeighbors={true as any}
        fit={"cover" as any}
        aspect={"square" as any}
      />
    </div>
  </div>
) : (
  <div className="px-4 pb-4">
    <div className="rounded-2xl border border-black/[.06] bg-white/70 p-6 text-center text-xs text-slate-500">
      画像がありません
    </div>
  </div>
)}



        {/* Content */}
        {post.content ? (
          <section className="px-4 py-5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{post.content}</p>
          </section>
        ) : null}

        {/* Actions */}
        <div className="flex items-center justify-between px-4 pb-4 pt-0">
          <PostActions
            postId={post.id}
            postUserId={post.user_id}
            initialLiked={initiallyLiked}
            initialLikeCount={likeCount ?? 0}
            initialWanted={false}
            initialBookmarked={false}
            initialWantCount={0}
            initialBookmarkCount={0}
          />
          <PostCollectionButton postId={post.id} />
        </div>

        {/* ✅ 以下は重いので遅延（ここが体感0.2秒に効く） */}
        <div className="border-t border-black/[.06] px-4 py-4">
          <Suspense fallback={<div className="text-xs text-slate-500">コメントを読み込み中...</div>}>
            <PostCommentsBlock postId={post.id} postUserId={post.user_id} meId={user?.id ?? null} />
          </Suspense>
        </div>

        {post.place_id ? (
          <div className="border-t border-black/[.06] px-4 py-4">
            <Suspense fallback={<div className="text-xs text-slate-500">お店の写真を読み込み中...</div>}>
              <PlacePhotosBlock placeId={post.place_id} placeName={post.place_name} mapUrl={mapUrl} />
            </Suspense>
          </div>
        ) : null}
      </article>

      {/* ✅ “もっと見つける” も遅延 */}
      <div className="mt-8">
        <Suspense fallback={<div className="text-xs text-slate-500">おすすめを計算中...</div>}>
          <MoreDiscoverBlock currentPostId={post.id} meId={user?.id ?? null} />
        </Suspense>
      </div>
    </main>
  );
}
