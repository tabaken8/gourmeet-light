import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostActions from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

type PostRow = {
  id: string;
  content: string | null;
  user_id: string;
  created_at: string;
  image_urls: string[] | null;
  place_name: string | null;
  place_address: string | null;
  place_id: string | null;
  profiles: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
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

export default async function PostPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { img_index?: string };
}) {
  const supabase = await createClient();;

  // ログインユーザー
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 投稿 + 投稿者プロフィール + 位置情報
  const { data } = await supabase
    .from("posts")
    .select(
      `
      id,
      content,
      user_id,
      created_at,
      image_urls,
      place_name,
      place_address,
      place_id,
      profiles (
        id,
        display_name,
        avatar_url
      )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  const post = data as PostRow | null;
  if (!post) return notFound();

  // ---- 画像インデックス（常に number にする） ------------------------
  let safeIndex = 0;
  if (searchParams?.img_index) {
    const n = Number(searchParams.img_index);
    if (Number.isFinite(n) && n > 0) safeIndex = n - 1;
  }

  // ---- Like 情報 ---------------------------------------------------
  let likeCount = 0;
  let initiallyLiked = false;

  {
    const { count } = await supabase
      .from("post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id);

    likeCount = count ?? 0;
  }

  if (user) {
    const { count } = await supabase
      .from("post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id)
      .eq("user_id", user.id);

    initiallyLiked = (count ?? 0) > 0;
  }

  // ---- プロフィール表示用 -----------------------------------------
  const prof = post.profiles;
  const display = prof?.display_name ?? "ユーザー";
  const avatar = prof?.avatar_url ?? null;
  const initial = (display || "U").slice(0, 1).toUpperCase();

  // ---- Map リンク --------------------------------------------------
  const mapUrl = post.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${post.place_id}`
    : post.place_address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        post.place_address
      )}`
      : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <article className="w-full overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
        {/* 投稿者ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/u/${post.user_id}`}
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-100 font-semibold text-orange-900 ring-1 ring-orange-200"
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </Link>

            <div className="min-w-0">
              <Link
                href={`/u/${post.user_id}`}
                className="truncate text-sm font-semibold text-neutral-900 hover:underline"
              >
                {display}
              </Link>
              <div className="text-xs text-black/50">{formatJST(post.created_at)}</div>
            </div>
          </div>

          <PostMoreMenu postId={post.id} isMine={user?.id === post.user_id} />
        </div>

        {/* 画像カルーセル */}
        {post.image_urls && post.image_urls.length > 0 && (
          <PostImageCarousel
            postId={post.id}
            imageUrls={post.image_urls}
            initialIndex={safeIndex}
            syncUrl={false}
          />
        )}

        {/* 本文 + 店舗情報 */}
        <section className="space-y-2 px-4 py-4">
          {post.content && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/80">
              {post.content}
            </p>
          )}

          {post.place_name && (
            <div className="flex items-center gap-1 text-sm text-orange-700">
              <MapPin size={16} />
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {post.place_name}
                </a>
              ) : (
                <span>{post.place_name}</span>
              )}
            </div>
          )}
        </section>

        {/* アクション */}
        <div className="flex items-center justify-between px-4 pb-4">
          <PostActions
            postId={post.id}
            postUserId={post.user_id}
            initialLiked={initiallyLiked}
            initialLikeCount={likeCount}
            initialWanted={false}
            initialBookmarked={false}
            initialWantCount={0}
            initialBookmarkCount={0}
          />
          <PostCollectionButton postId={post.id} />
        </div>

        {/* ✅ コメント */}
        <div className="border-t border-orange-50 px-4 py-3">
          <PostComments
            postId={post.id}
            postUserId={post.user_id}
            meId={user?.id ?? null}
          />
        </div>
      </article>
    </main>
  );
}
