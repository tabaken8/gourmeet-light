// src/app/(app)/u/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { HydrationBoundary } from "@tanstack/react-query";
import type { HeatmapDay } from "@/components/VisitHeatmap";
import type { AlbumPost } from "@/components/AlbumBrowser";
import type { Metadata } from "next";
import {
  queryKeys,
  subtractDaysKeyJST,
  type UserPublicProfileData,
  type UserPublicPostsData,
} from "@/lib/queries";
import UserProfileContent from "./UserProfileContent";

export const dynamic = "force-dynamic";

// ── OGP metadata ──
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = await createClient();
  const paramId = params.id;

  // resolve username → UUID if needed
  let userId: string;
  if (UUID_RE.test(paramId)) {
    userId = paramId;
  } else {
    const { data: resolved } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", paramId)
      .maybeSingle();
    if (!resolved) return {};
    userId = resolved.id;
  }

  // fetch profile + post count + top post image
  const [profileRes, countRes, topPostRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url, bio")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("posts")
      .select("image_urls, image_variants")
      .eq("user_id", userId)
      .order("recommend_score", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profileRes.data) return {};

  const p = profileRes.data;
  const name = p.display_name || p.username || "ユーザー";
  const postCount = countRes.count ?? 0;

  const title = `${name} | Gourmeet`;
  const bio = (p.bio ?? "").slice(0, 100).replace(/\n/g, " ");
  const description = bio
    ? `${bio} — ${postCount}件のレビュー`
    : `${name}さんのグルメプロフィール — ${postCount}件のレビュー`;

  // OGP image: top post image → avatar → site default
  const topPost = topPostRes.data as any;
  const variants = Array.isArray(topPost?.image_variants) ? topPost.image_variants : [];
  const legacyUrls = Array.isArray(topPost?.image_urls) ? topPost.image_urls : [];
  const ogImage =
    variants[0]?.full ??
    variants[0]?.thumb ??
    legacyUrls[0] ??
    p.avatar_url ??
    "/ogp.png";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage }],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

function normalizePlacesShape(row: any) {
  const pl = row?.places;
  const places = Array.isArray(pl) ? (pl[0] ?? null) : (pl ?? null);
  return { ...row, places };
}

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function UserPublicPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (!me) redirect("/auth/login");

  const paramId = params.id;

  // --- resolve paramId → UUID ---
  let userId: string;
  if (UUID_RE.test(paramId)) {
    // UUID がそのまま渡された場合
    userId = paramId;
  } else {
    // username として解決を試みる
    const { data: resolved } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", paramId)
      .maybeSingle();
    if (!resolved) return notFound();
    userId = resolved.id;
  }

  if (userId === me.id) redirect("/profile");

  const { startKey: startJstKey, startIsoUtc, todayKey: todayJstKey } = subtractDaysKeyJST(364);

  // 全部1発で並列取得（公開プロフィール前提で投稿データも同時に取る）
  const [
    profileRes,
    relRes,
    reverseRelRes,
    countsRes,
    bellRes,
    earliestRes,
    heatmapRes,
    albumRes,
    pinsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, is_public")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("follows")
      .select("status")
      .eq("follower_id", me.id)
      .eq("followee_id", userId)
      .maybeSingle(),
    supabase
      .from("follows")
      .select("status")
      .eq("follower_id", userId)
      .eq("followee_id", me.id)
      .eq("status", "accepted")
      .maybeSingle(),
    supabase.rpc("get_profile_counts", { p_user_id: userId }),
    supabase
      .from("user_post_subscriptions")
      .select("enabled")
      .eq("user_id", me.id)
      .eq("target_user_id", userId)
      .maybeSingle(),
    supabase.rpc("get_earliest_post_key", { p_user_id: userId }),
    supabase.rpc("get_heatmap_days", {
      p_user_id: userId,
      p_start_jst: startJstKey,
      p_today_jst: todayJstKey,
      p_start_iso: startIsoUtc,
      p_end_iso: new Date(Date.now() + 86400000).toISOString(),
    }),
    supabase
      .from("posts")
      .select(
        `id, place_id, created_at, visited_on, recommend_score, image_urls, image_variants,
         places:places (place_id, name, address, primary_genre, area_label_ja, search_text)`
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(400),
    supabase
      .from("post_pins")
      .select("post_id")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .limit(80),
  ]);

  if (!profileRes.data) return notFound();

  const profile = profileRes.data;
  const initiallyFollowing = relRes.data?.status === "accepted";
  const initiallyRequested = relRes.data?.status === "pending";
  const isFollowing = !!reverseRelRes.data;
  const canViewPosts = (profile.is_public ?? true) || initiallyFollowing;

  const initialBellEnabled = (bellRes.data as any)?.enabled ?? true;
  const earliestKey = canViewPosts ? ((earliestRes.data as string | null) ?? null) : null;
  const heatmapDays = canViewPosts ? ((heatmapRes.data ?? []) as HeatmapDay[]) : [];
  const albumPosts = canViewPosts
    ? ((albumRes.data ?? []).map(normalizePlacesShape) as AlbumPost[])
    : [];
  const pinnedPostIds = canViewPosts
    ? (pinsRes.data ?? []).map((r: any) => String(r.post_id))
    : [];

  const queryClient = new QueryClient();

  queryClient.setQueryData<UserPublicProfileData>(queryKeys.userPublicProfile(userId), {
    profile,
    counts: countsRes.data,
  });

  if (canViewPosts) {
    queryClient.setQueryData<UserPublicPostsData>(queryKeys.userPublicPosts(userId), {
      earliestKey,
      heatmapDays,
      albumPosts,
      pinnedPostIds,
    });
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfileContent
        userId={userId}
        initiallyFollowing={initiallyFollowing}
        initiallyRequested={initiallyRequested}
        isFollowing={isFollowing}
        initialBellEnabled={initialBellEnabled}
        canViewPosts={canViewPosts}
      />
    </HydrationBoundary>
  );
}