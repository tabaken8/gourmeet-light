// src/components/timeline/FriendsTimelineServer.tsx
import { createClient } from "@/lib/supabase/server";
import FriendsTimelineClient from "./FriendsTimelineClient";
import { getGoodNotFollowingUsers, fetchGoodNotFollowingPosts, interleavePosts } from "@/lib/timeline-fof";

export const dynamic = "force-dynamic";

type SuggestUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_following: boolean;
  reason?: string | null;
};

type Meta = {
  followCount: number;
  suggestOnce?: boolean;
  suggestAtIndex?: number;
  suggestion?: {
    title: string;
    subtitle?: string | null;
    users: SuggestUser[];
  };
} | null;

function enforceNoRepeatWithin(posts: any[], window = 3) {
  const out: any[] = [];
  const pool = posts.slice();
  while (pool.length) {
    const recent = new Set(out.slice(-window).map((p) => p?.user_id).filter(Boolean));
    let idx = pool.findIndex((p) => !recent.has(p?.user_id));
    if (idx === -1) idx = 0;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

async function buildSuggestUsersPublic(supabase: any, excludeIds: Set<string>, take = 8): Promise<SuggestUser[]> {
  const { data: cand, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_public")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) return [];

  return (cand ?? [])
    .map((p: any) => ({
      id: String(p.id),
      display_name: (p.display_name ?? null) as string | null,
      avatar_url: (p.avatar_url ?? null) as string | null,
      is_following: false,
      reason: "おすすめ",
    }))
    .filter((u: any) => u.id && !excludeIds.has(u.id))
    .slice(0, take);
}

async function buildMetaForLoggedIn(supabase: any, meId: string): Promise<Meta> {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", meId)
    .eq("status", "accepted");

  const followCount = !error && typeof count === "number" ? count : 0;

  if (followCount <= 1) {
    const exclude = new Set<string>([meId]);
    if (followCount === 1) {
      const { data: follows } = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", meId)
        .eq("status", "accepted");
      const followeeIds = (follows ?? []).map((r: any) => r.followee_id).filter(Boolean) as string[];
      for (const x of followeeIds) exclude.add(x);
    }

    const users = await buildSuggestUsersPublic(supabase, exclude, 8);
    if (users.length > 0) {
      return {
        followCount,
        suggestOnce: true,
        suggestAtIndex: 1,
        suggestion: {
          title: followCount === 0 ? "気になる人をフォローしてみましょう" : "この人たちも良さそう",
          subtitle: "おすすめのユーザーを表示しています",
          users,
        },
      };
    }
  }

  return { followCount, suggestOnce: false, suggestAtIndex: 1 };
}

async function buildMetaForGuest(supabase: any): Promise<Meta> {
  const users = await buildSuggestUsersPublic(supabase, new Set<string>(), 8);
  if (users.length === 0) return { followCount: 0, suggestOnce: false, suggestAtIndex: 1 };

  return {
    followCount: 0,
    suggestOnce: true,
    suggestAtIndex: 1,
    suggestion: {
      title: "気になる人をフォローしてみましょう。",
      subtitle: "ログインするとフォローできます（まずは覗けます）。",
      users,
    },
  };
}

async function attachNearestStationsToPosts(supabase: any, posts: any[]) {
  if (posts.length === 0) return posts;

  const placeIds = Array.from(
    new Set(posts.map((p: any) => p?.place_id).filter(Boolean).map((x: any) => String(x)))
  );

  if (placeIds.length === 0) return posts;

  let rows: any[] = [];
  try {
    const { data, error } = await supabase
      .from("place_station_links")
      .select("place_id, station_name, distance_m")
      .in("place_id", placeIds)
      .eq("rank", 1);

    if (!error && Array.isArray(data)) rows = data;
  } catch {
    rows = [];
  }

  const map = new Map<string, { name: string | null; dist: number | null }>();
  for (const r of rows) {
    const pid = r?.place_id ? String(r.place_id) : null;
    if (!pid) continue;
    map.set(pid, {
      name: (r?.station_name ?? null) as any,
      dist: typeof r?.distance_m === "number" ? r.distance_m : null,
    });
  }

  return posts.map((p: any) => {
    const pid = p?.place_id ? String(p.place_id) : "";
    const hit = pid ? map.get(pid) : null;
    return {
      ...p,
      nearest_station_name: hit?.name ?? null,
      nearest_station_distance_m: hit?.dist ?? null,
    };
  });
}

const LIMIT = 20;

export default async function FriendsTimelineServer({ meId }: { meId: string | null }) {
  const supabase = await createClient();

  // 未ログイン
  if (!meId) {
    const { data } = await supabase
      .from("posts")
      .select(
        "id,user_id,created_at,visited_on,time_of_day,content,place_id,place_name,place_address,image_urls,image_variants,image_assets,cover_square_url,cover_full_url,cover_pin_url,recommend_score,price_yen,price_range,profiles!inner(id,display_name,avatar_url,is_public)"
      )
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false })
      .limit(Math.max(120, LIMIT * 8));

    const raw = (data ?? []).map((r: any) => {
      const { profiles, ...rest } = r;
      return {
        ...rest,
        profile: profiles ?? null,
        likeCount: 0,
        likedByMe: false,
        initialLikers: [],
      };
    });

    let arranged = enforceNoRepeatWithin(raw, 3).slice(0, LIMIT);
    arranged = await attachNearestStationsToPosts(supabase, arranged);
    const nextCursor = arranged.length ? arranged[arranged.length - 1].created_at : null;
    const meta = await buildMetaForGuest(supabase);

    return (
      <FriendsTimelineClient
        meId={null}
        initialPosts={arranged}
        initialNextCursor={nextCursor}
        initialMeta={meta as any}
      />
    );
  }

  // ログイン済み：直接RPC呼び出し + k-hop=2投稿
  const [postsResult, meta, fofInfo] = await Promise.all([
    supabase.rpc("timeline_friends_v1", {
      p_limit: LIMIT,
      p_cursor: null,
    }),
    buildMetaForLoggedIn(supabase, meId),
    getGoodNotFollowingUsers(supabase, meId),
  ]);

  const rows = (postsResult.data ?? []) as any[];

  let friendsPosts = postsResult.error
    ? []
    : rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        created_at: r.created_at,
        visited_on: r.visited_on,
        time_of_day: r.time_of_day ?? null,
        content: r.content,
        place_id: r.place_id,
        place_name: r.place_name,
        place_address: r.place_address,
        image_urls: r.image_urls ?? null,
        image_variants: r.image_variants ?? null,
        image_assets: r.image_assets ?? null,
        cover_square_url: r.cover_square_url ?? null,
        cover_full_url: r.cover_full_url ?? null,
        cover_pin_url: r.cover_pin_url ?? null,
        recommend_score: r.recommend_score,
        price_yen: r.price_yen,
        price_range: r.price_range,
        profile: {
          id: r.user_id,
          display_name: r.author_display_name,
          avatar_url: r.author_avatar_url,
          is_public: r.author_is_public ?? true,
        },
        likeCount: r.like_count ?? r.likeCount ?? 0,
        likedByMe: r.liked_by_me ?? r.likedByMe ?? false,
        initialLikers: r.initial_likers ?? r.initialLikers ?? [],
      }));

  // "良い not-following" 投稿を取得（ランダム、リフレッシュごとに異なる）
  const nfPostCount = Math.max(3, Math.ceil(LIMIT / 5));
  const nfPosts = await fetchGoodNotFollowingPosts(
    supabase,
    fofInfo,
    meId,
    nfPostCount,
    null
  );

  // RPC結果にtime_of_dayがない場合、別途取得して補填
  const rpcPostIds = friendsPosts.map((p: any) => p.id).filter(Boolean);
  if (rpcPostIds.length > 0 && !friendsPosts[0]?.time_of_day) {
    const { data: todRows } = await supabase
      .from("posts")
      .select("id, time_of_day")
      .in("id", rpcPostIds);
    if (todRows) {
      const todMap = new Map(todRows.map((r: any) => [r.id, r.time_of_day]));
      friendsPosts = friendsPosts.map((p: any) => ({
        ...p,
        time_of_day: todMap.get(p.id) ?? p.time_of_day ?? null,
      }));
    }
  }

  // フレンド投稿優先でインターリーブ → 同一ユーザー連続回避
  let posts = enforceNoRepeatWithin(
    interleavePosts(friendsPosts, nfPosts, LIMIT),
    3
  );
  const nextCursor = posts.length > 0 ? posts[posts.length - 1].created_at : null;

  posts = await attachNearestStationsToPosts(supabase, posts);

  return (
    <FriendsTimelineClient
      meId={meId}
      initialPosts={posts}
      initialNextCursor={nextCursor}
      initialMeta={meta as any}
    />
  );
}