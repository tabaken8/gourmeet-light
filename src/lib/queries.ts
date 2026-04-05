// src/lib/queries.ts
// クライアントサイドのデータフェッチ関数（TanStack Query の queryFn として使用）

import { createClient } from "@/lib/supabase/client";
import type { HeatmapDay } from "@/components/VisitHeatmap";
import type { AlbumPost } from "@/components/AlbumBrowser";
import type { MiniPost } from "@/app/(app)/posts/[id]/parts/UserOtherPostsStrip";

// ---- utils（サーバー側と共用できる純粋関数） ----

function dtfJstYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function subtractDaysKeyJST(days: number): {
  startKey: string;
  startIsoUtc: string;
  todayKey: string;
} {
  const dtf = dtfJstYmd();
  const todayKey = dtf.format(new Date());
  const [y, m, d] = todayKey.split("-").map(Number);
  const jstNoonUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 9 * 60 * 60 * 1000;
  const targetUtcMs = jstNoonUtcMs - days * 24 * 60 * 60 * 1000;
  const startKey = dtf.format(new Date(targetUtcMs + 9 * 60 * 60 * 1000));
  const [yy, mm, dd] = startKey.split("-").map(Number);
  const startUtcMs = Date.UTC(yy, mm - 1, dd, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const startIsoUtc = new Date(startUtcMs).toISOString();
  return { startKey, startIsoUtc, todayKey };
}

function normalizePlacesShape(row: any) {
  const pl = row?.places;
  const places = Array.isArray(pl) ? (pl[0] ?? null) : (pl ?? null);
  return { ...row, places };
}

function toMiniPost(p: any): MiniPost {
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

// ---- Types ----

export type UserPublicProfileData = {
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    is_public: boolean | null;
  } | null;
  counts: {
    posts_count: number;
    wants_count: number;
    followers_count: number;
    following_count: number;
  } | null;
};

export type UserPublicPostsData = {
  earliestKey: string | null;
  heatmapDays: HeatmapDay[];
  albumPosts: AlbumPost[];
  pinnedPostIds: string[];
};

export type PDR = {
  id: string;
  category: string;
  template_ids: string[];
  free_text: string | null;
  created_at: string;
};

export type PDRAnswer = {
  id: string;
  request_id: string;
  body: string;
  is_public: boolean;
  created_at: string;
};

export type PostDetailData = {
  post: any;
  publicReqs: PDR[];
  ansByReq: Record<string, PDRAnswer[]>;
  miniRecent: MiniPost[];
  miniSameGenre: MiniPost[];
};

// ---- Query Keys ----

export const queryKeys = {
  userPublicProfile: (userId: string) => ["user-public-profile", userId] as const,
  userPublicPosts: (userId: string) => ["user-public-posts", userId] as const,
  postDetail: (postId: string) => ["post-detail", postId] as const,
};

// ---- Query Functions ----

/** u/[id] ページ: プロフィール + カウント */
export async function fetchUserPublicProfile(userId: string): Promise<UserPublicProfileData> {
  const supabase = createClient();
  const [profileRes, countsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, is_public")
      .eq("id", userId)
      .maybeSingle(),
    supabase.rpc("get_profile_counts", { p_user_id: userId }),
  ]);
  return {
    profile: profileRes.data,
    counts: countsRes.data,
  };
}

/** u/[id] ページ: ヒートマップ + アルバム + ピン */
export async function fetchUserPublicPosts(userId: string): Promise<UserPublicPostsData> {
  const supabase = createClient();
  const { startKey: startJstKey, startIsoUtc, todayKey: todayJstKey } = subtractDaysKeyJST(364);

  const [earliestRes, heatmapRes, albumRes, pinsRes] = await Promise.all([
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

  return {
    earliestKey: (earliestRes.data as string | null) ?? null,
    heatmapDays: (heatmapRes.data ?? []) as HeatmapDay[],
    albumPosts: (albumRes.data ?? []).map(normalizePlacesShape) as AlbumPost[],
    pinnedPostIds: (pinsRes.data ?? []).map((r: any) => String(r.post_id)),
  };
}

/** posts/[id] ページ: 投稿本体 + Q&A + 同じユーザーの他の投稿 */
export async function fetchPostDetail(postId: string): Promise<PostDetailData | null> {
  const supabase = createClient();

  const { data: post, error } = await supabase
    .from("posts")
    .select(
      `id, content, user_id, created_at, visited_on, time_of_day,
       image_urls, image_variants, place_name, place_address, place_id,
       recommend_score, price_yen, price_range, tag_ids,
       profiles (id, display_name, avatar_url, is_public, username),
       places (place_id, name, address, primary_genre, area_label_ja)`
    )
    .eq("id", postId)
    .maybeSingle();

  if (error || !post) return null;

  const currentGenre = ((post as any).places?.primary_genre ?? "").trim() || null;

  const baseSelect = `
    id, user_id, created_at, visited_on, recommend_score, image_urls, image_variants,
    place_id, place_name, place_address,
    places!inner (place_id, name, address, primary_genre, area_label_ja)
  `;

  const [pdrRes, recentRes, sameGenreRes] = await Promise.all([
    supabase
      .from("post_detail_requests")
      .select("id, category, template_ids, free_text, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("posts")
      .select(baseSelect)
      .eq("user_id", (post as any).user_id)
      .neq("id", postId)
      .order("created_at", { ascending: false })
      .limit(12),
    currentGenre
      ? supabase
          .from("posts")
          .select(baseSelect)
          .eq("user_id", (post as any).user_id)
          .eq("places.primary_genre", currentGenre)
          .neq("id", postId)
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const reqs = (pdrRes.data ?? []) as PDR[];
  const reqIds = reqs.map((r) => r.id).filter(Boolean);

  let answers: PDRAnswer[] = [];
  if (reqIds.length) {
    const { data: ansRows } = await supabase
      .from("post_detail_request_answers")
      .select("id, request_id, body, is_public, created_at")
      .in("request_id", reqIds)
      .eq("is_public", true)
      .order("created_at", { ascending: true });
    answers = (ansRows ?? []) as PDRAnswer[];
  }

  const ansByReq: Record<string, PDRAnswer[]> = {};
  for (const a of answers) {
    if (!a?.request_id) continue;
    (ansByReq[a.request_id] ||= []).push(a);
  }

  return {
    post,
    publicReqs: reqs.filter((r) => (ansByReq[r.id]?.length ?? 0) > 0),
    ansByReq,
    miniRecent: (recentRes.data ?? []).map(toMiniPost),
    miniSameGenre: (sameGenreRes.data ?? []).map(toMiniPost),
  };
}
