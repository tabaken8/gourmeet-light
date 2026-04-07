import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { HydrationBoundary } from "@tanstack/react-query";
import { queryKeys, type PostDetailData } from "@/lib/queries";
import type { Metadata } from "next";

import PostActions, { type LikerLite } from "@/components/PostActions";
import PostCommentsBlock from "./parts/PostCommentsBlock";
import PlacePhotosBlock from "./parts/PlacePhotosBlock";
import MoreDiscoverBlock from "./parts/MoreDiscoverBlock";
import PostMainContent from "./PostMainContent";

export const dynamic = "force-dynamic";

// ── OGP metadata ──
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("posts")
    .select(
      `place_name, content, recommend_score, image_urls, image_variants,
       profiles (display_name)`
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return {};

  const post = data as any;
  const authorName = post.profiles?.display_name ?? "ユーザー";
  const placeName = post.place_name ?? "";
  const score = post.recommend_score != null ? `${Number(post.recommend_score).toFixed(1)}` : null;

  // Title: "店名 - 著者名のレビュー | Gourmeet"
  const title = placeName
    ? `${placeName} - ${authorName}のレビュー | Gourmeet`
    : `${authorName}の投稿 | Gourmeet`;

  // Description: score + content preview
  const contentPreview = (post.content ?? "").slice(0, 100).replace(/\n/g, " ");
  const description = [
    score ? `おすすめ度 ${score}` : null,
    contentPreview || null,
  ].filter(Boolean).join(" — ") || `${authorName}さんのグルメレビュー`;

  // OGP image: full → thumb → legacy image_urls[0] → site default
  const variants = Array.isArray(post.image_variants) ? post.image_variants : [];
  const legacyUrls = Array.isArray(post.image_urls) ? post.image_urls : [];
  const ogImage =
    variants[0]?.full ??
    variants[0]?.thumb ??
    legacyUrls[0] ??
    "/ogp.png";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ img_index?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const imgIndexStr = sp.img_index;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let safeIndex = 0;
  if (imgIndexStr) {
    const n = Number(imgIndexStr);
    if (Number.isFinite(n) && n > 0) safeIndex = n - 1;
  }

  // ---- 投稿本体を取得 ----
  const { data, error: postErr } = await supabase
    .from("posts")
    .select(
      `id, content, user_id, created_at, visited_on, time_of_day,
       image_urls, image_variants, place_name, place_address, place_id,
       recommend_score, price_yen, price_range, tag_ids,
       profiles (id, display_name, avatar_url, is_public),
       places (place_id, name, address, primary_genre, area_label_ja)`
    )
    .eq("id", id)
    .maybeSingle();

  if (postErr || !data) return notFound();
  const post = data as any;

  const isMine = !!(user?.id && user.id === post.user_id);

  // ---- like / follow / Q&A / 他投稿 を並列取得 ----
  const currentGenre = (post.places?.primary_genre ?? "").trim() || null;
  const baseSelect = `
    id, user_id, created_at, visited_on, recommend_score, image_urls, image_variants,
    place_id, place_name, place_address,
    places!inner (place_id, name, address, primary_genre, area_label_ja)
  `;

  const [
    likeCountRes,
    likedRes,
    recentLikersRes,
    myFollowRes,
    incomingFollowRes,
    pdrRes,
    recentByUserRes,
    sameGenreRes,
  ] = await Promise.all([
    supabase.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", post.id),
    user
      ? supabase.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", post.id).eq("user_id", user.id)
      : Promise.resolve({ count: 0 } as any),
    supabase.from("post_likes").select("user_id, created_at").eq("post_id", post.id).order("created_at", { ascending: false }).limit(3),
    user && !isMine
      ? supabase.from("follows").select("status").eq("follower_id", user.id).eq("followee_id", post.user_id).in("status", ["accepted", "pending"]).maybeSingle()
      : Promise.resolve({ data: null } as any),
    user && !isMine
      ? supabase.from("follows").select("status").eq("follower_id", post.user_id).eq("followee_id", user.id).eq("status", "accepted").maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from("post_detail_requests").select("id, category, template_ids, free_text, created_at").eq("post_id", post.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("posts").select(baseSelect).eq("user_id", post.user_id).neq("id", post.id).order("created_at", { ascending: false }).limit(12),
    currentGenre
      ? supabase.from("posts").select(baseSelect).eq("user_id", post.user_id).eq("places.primary_genre", currentGenre).neq("id", post.id).order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const likeCount = likeCountRes.count ?? 0;
  const initiallyLiked = (likedRes.count ?? 0) > 0;
  const likerIds = Array.from(
    new Set((recentLikersRes.data ?? []).map((r: any) => r.user_id).filter(Boolean))
  );
  let initialLikers: LikerLite[] = [];
  if (likerIds.length) {
    const { data: likerProfs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", likerIds);
    const map: Record<string, any> = {};
    for (const p of likerProfs ?? []) map[(p as any).id] = p;
    initialLikers = likerIds
      .map((lid) => map[lid])
      .filter(Boolean)
      .map((p: any) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }));
  }

  const myStatus = (myFollowRes.data as any)?.status as "accepted" | "pending" | undefined;
  const iFollow = myStatus === "accepted";
  const requested = myStatus === "pending";
  const showFollowButton = !!(user?.id && !isMine && !iFollow && !requested);
  const isFollowedByThem = !!incomingFollowRes.data;
  const followCtaLabel = isFollowedByThem ? "フォローバックする" : "フォローする";

  // ---- Q&A のデータを整形 ----
  const reqs = (pdrRes.data ?? []) as any[];
  const reqIds = reqs.map((r: any) => r.id).filter(Boolean);
  let answers: any[] = [];
  if (reqIds.length) {
    const { data: ansRows } = await supabase
      .from("post_detail_request_answers")
      .select("id, request_id, body, is_public, created_at")
      .in("request_id", reqIds)
      .eq("is_public", true)
      .order("created_at", { ascending: true });
    answers = ansRows ?? [];
  }
  const ansByReq: Record<string, any[]> = {};
  for (const a of answers) {
    if (!a?.request_id) continue;
    (ansByReq[a.request_id] ||= []).push(a);
  }
  const publicReqs = reqs.filter((r: any) => (ansByReq[r.id]?.length ?? 0) > 0);

  // ---- 他の投稿 ----
  function toMiniPost(p: any) {
    return {
      id: String(p.id),
      place_id: p.place_id ?? null,
      created_at: p.created_at ?? null,
      visited_on: p.visited_on ?? null,
      recommend_score: p.recommend_score ?? null,
      image_urls: p.image_urls ?? null,
      image_variants: p.image_variants ?? null,
      places: p.places ?? null,
      place_name: p.place_name ?? null,
      place_address: p.place_address ?? null,
    };
  }
  const miniRecent = (recentByUserRes.data ?? []).map(toMiniPost);
  const miniSameGenre = (sameGenreRes.data ?? []).map(toMiniPost);

  // ---- mapUrl（PlacePhotosBlock にも使う） ----
  const mapUrl = post.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.place_name ?? "place")}&query_place_id=${encodeURIComponent(post.place_id)}`
    : post.place_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.place_address)}`
    : null;

  // ---- QueryClient にキャッシュとしてセット ----
  const queryClient = new QueryClient();
  queryClient.setQueryData<PostDetailData>(queryKeys.postDetail(id), {
    post,
    publicReqs,
    ansByReq,
    miniRecent,
    miniSameGenre,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PostMainContent
        postId={id}
        meId={user?.id ?? null}
        isMine={isMine}
        safeIndex={safeIndex}
        initiallyLiked={initiallyLiked}
        likeCount={likeCount}
        initialLikers={initialLikers}
        showFollowButton={showFollowButton}
        followCtaLabel={followCtaLabel}
        commentsSlot={
          <Suspense fallback={<div className="text-xs text-slate-500">コメントを読み込み中...</div>}>
            <PostCommentsBlock postId={id} postUserId={post.user_id} meId={user?.id ?? null} />
          </Suspense>
        }
        placePhotosSlot={
          post.place_id ? (
            <Suspense fallback={<div className="text-xs text-slate-500">お店の写真を読み込み中...</div>}>
              <PlacePhotosBlock placeId={post.place_id} placeName={post.place_name} mapUrl={mapUrl} />
            </Suspense>
          ) : null
        }
        discoverSlot={
          <Suspense fallback={<div className="text-xs text-slate-500">おすすめを計算中...</div>}>
            <MoreDiscoverBlock currentPostId={id} meId={user?.id ?? null} />
          </Suspense>
        }
      />
    </HydrationBoundary>
  );
}
