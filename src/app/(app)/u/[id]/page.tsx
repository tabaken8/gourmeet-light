// src/app/(app)/u/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { HydrationBoundary } from "@tanstack/react-query";
import type { HeatmapDay } from "@/components/VisitHeatmap";
import type { AlbumPost } from "@/components/AlbumBrowser";
import {
  queryKeys,
  subtractDaysKeyJST,
  type UserPublicProfileData,
  type UserPublicPostsData,
} from "@/lib/queries";
import UserProfileContent from "./UserProfileContent";

export const dynamic = "force-dynamic";

function normalizePlacesShape(row: any) {
  const pl = row?.places;
  const places = Array.isArray(pl) ? (pl[0] ?? null) : (pl ?? null);
  return { ...row, places };
}

export default async function UserPublicPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (!me) redirect("/auth/login");

  const userId = params.id;
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