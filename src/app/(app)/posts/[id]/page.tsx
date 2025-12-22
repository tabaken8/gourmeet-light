// app/(app)/posts/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

import PostImageCarousel from "@/components/PostImageCarousel";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostActions from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";

import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

type ImageVariant = {
  thumb?: string | null;
  full?: string | null;
  [k: string]: any;
};

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_public?: boolean | null;
};

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

function getAllImageUrls(p: PostRow): string[] {
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
  const v0 = variants[0];
  const best = v0?.thumb ?? v0?.full ?? null;
  if (best) return best;

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy[0] ?? null;
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { img_index?: string };
}) {
  const supabase = await createClient();

  // ログインユーザー
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 投稿 + 投稿者プロフィール + 位置情報
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

  if (postErr) {
    // ここは notFound に寄せた方が安全（RLS等も含め）
    return notFound();
  }

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
  const isPublic = prof?.is_public ?? true;
  const initial = (display || "U").slice(0, 1).toUpperCase();

  const score =
    typeof post.recommend_score === "number" &&
    post.recommend_score >= 1 &&
    post.recommend_score <= 10
      ? post.recommend_score
      : null;

  const priceLabel = formatPrice(post);

  // ---- Map リンク --------------------------------------------------
  const mapUrl = post.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${post.place_id}`
    : post.place_address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          post.place_address
        )}`
      : null;

  // ---- 画像 --------------------------------------------------------
  const imageUrls = getAllImageUrls(post);

  // ---- 「もっと見つける」用：非フォロー中心で取得 -------------------
  // 1) フォローしてるID一覧（取れれば除外）
  let followingIds: string[] = [];
  if (user) {
    try {
      // 典型的な follows テーブル想定（違っても落ちないように握る）
      // follower_id = 自分, following_id = 相手
      const { data: fData, error: fErr } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);

      if (!fErr && Array.isArray(fData)) {
        followingIds = fData
          .map((r: any) => r?.following_id)
          .filter((x: any) => typeof x === "string");
      }
    } catch {
      // ignore
    }
  }

  // 2) おすすめ投稿（主役=このpostを壊さないため、カードは小さく・控えめ）
  //   - 自分の投稿は除外
  //   - この投稿自体も除外
  //   - できれば「フォローしてない人」中心
  //   - 画像あり優先はDB設計に依存するので、ここでは軽く
  const recLimit = 9;

  let recPosts: PostRow[] = [];
  {
    let q = supabase
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
      .neq("id", post.id)
      .order("created_at", { ascending: false })
      .limit(recLimit);

    // 自分の投稿は外す（ログイン時）
    if (user) q = q.neq("user_id", user.id);

    // できれば「フォロー中は外す」
    // ※ Supabase の .not('user_id','in',...) は配列を文字列化する必要あり
if (user && followingIds.length > 0) {
  const csv = `(${followingIds.map((x) => `"${x}"`).join(",")})`;

  // Supabaseの型定義が `not(..., 'in', string)` をうまく推論できないことがあるので
  // ここだけクエリビルダを any に落として型エラーとlint回避（実行時挙動は同じ）
  const qa: any = q;
  q = qa.not("user_id", "in", csv);
}


    const { data: rData } = await q;
    recPosts = (rData as any[])?.filter(Boolean) as PostRow[];
  }

  return (
    <main className="mx-auto max-w-5xl px-3 md:px-6 py-6 md:py-10">
      {/* =========================
          主役：投稿詳細カード（大）
         ========================= */}
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
                <Link
                  href={`/u/${post.user_id}`}
                  className="truncate text-sm font-semibold text-slate-900 hover:underline"
                >
                  {display}
                </Link>
                {!isPublic ? <span className="text-[11px] text-slate-400">🔒</span> : null}
              </div>
              <div className="text-[11px] text-slate-500">投稿の詳細</div>
            </div>
          </div>

          <PostMoreMenu postId={post.id} isMine={user?.id === post.user_id} />
        </div>

        {/* 署名ストリップ（Timelineと揃える） */}
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {post.place_name ? (
              <div className="gm-chip inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-800">
                <MapPin size={13} className="opacity-70" />
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-[260px] truncate hover:underline"
                  >
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
        </div>

        {/* Media */}
        {imageUrls.length > 0 ? (
          <PostImageCarousel
            postId={post.id}
            imageUrls={imageUrls}
            initialIndex={safeIndex}
            syncUrl={false}
          />
        ) : (
          <div className="px-4 pb-4">
            <div className="rounded-2xl border border-black/[.06] bg-white/70 p-6 text-center text-xs text-slate-500">
              画像がありません
            </div>
          </div>
        )}

        {/* Content */}
        {(post.content || post.place_id) && (
          <section className="px-4 py-5">
            {post.content ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {post.content}
              </p>
            ) : null}

            {/* Google写真（このページにも追加） */}
            {post.place_id ? (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium text-slate-700">
                  </div>
                  {mapUrl ? (
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-orange-700 hover:underline"
                    >
                      Googleで開く
                    </a>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-black/[.06] bg-white/70 p-3">
                  <PlacePhotoGallery
                    placeId={post.place_id}
                    placeName={post.place_name}
                    per={8}
                    maxThumbs={8}
                  />
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between px-4 pb-4 pt-0">
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

        {/* Comments */}
        <div className="border-t border-black/[.06] px-4 py-4">
          <PostComments postId={post.id} postUserId={post.user_id} meId={user?.id ?? null} />
        </div>
      </article>

      {/* =========================
          サブ：もっと見つける（主役を邪魔しない控えめカード）
         ========================= */}
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">もっと見つける</div>
            <div className="text-[11px] text-slate-500">
              テイストが似ているお店
            </div>
          </div>
          <Link
            href="/timeline?tab=discover"
            className="gm-chip gm-press inline-flex items-center px-2 py-1 text-[11px] text-orange-700 hover:underline"
          >
            もっと見る
          </Link>
        </div>

        {recPosts.length === 0 ? (
          <div className="rounded-2xl border border-black/[.06] bg-white/70 p-6 text-center text-xs text-slate-500">
            まだおすすめがありません。
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {recPosts.map((rp) => {
              const rprof = rp.profiles;
              const rdisplay = rprof?.display_name ?? "ユーザー";
              const rthumb = getFirstThumb(rp);

              const rscore =
                typeof rp.recommend_score === "number" &&
                rp.recommend_score >= 1 &&
                rp.recommend_score <= 10
                  ? rp.recommend_score
                  : null;

              const rprice = formatPrice(rp);

              return (
                <Link
                  key={rp.id}
                  href={`/posts/${rp.id}`}
                  className="
                    gm-press
                    group
                    overflow-hidden
                    rounded-2xl
                    border border-black/[.06]
                    bg-white/80
                    backdrop-blur
                  "
                >
                  <div className="relative aspect-square bg-slate-100">
                    {rthumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={rthumb}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-slate-100" />
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10" />

                    {/* place name badge */}
                    <div className="pointer-events-none absolute inset-x-2 bottom-2">
                      <div className="inline-flex max-w-full items-center rounded-full bg-black/35 px-2 py-1 text-[10px] text-white/90 backdrop-blur">
                        <span className="truncate">{rp.place_name ?? " "}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="truncate text-[11px] font-medium text-slate-900">
                      {rdisplay}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-1">
                      {rscore ? (
                        <span className="gm-chip inline-flex items-center px-2 py-1 text-[10px] text-orange-800">
                          {rscore}/10
                        </span>
                      ) : null}
                      {rprice ? (
                        <span className="gm-chip inline-flex items-center px-2 py-1 text-[10px] text-slate-700">
                          {rprice}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
