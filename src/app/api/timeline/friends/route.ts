// src/app/api/timeline/friends/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function toInt(x: string | null, d: number) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : d;
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function toIsoOrNull(x: string | null) {
  if (!x) return null;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SuggestUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_following: boolean;
  reason?: string | null;
};

// ✅ followCount を追加（suggestion無しでも meta を返せる）
type Meta =
  | {
      followCount: number;
      suggestOnce?: boolean;
      suggestAtIndex?: number; // 0-based
      suggestion?: {
        title: string;
        subtitle?: string | null;
        users: SuggestUser[];
      };
    }
  | null;

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

async function getFollowCountAccepted(supabase: any, meId: string): Promise<number> {
  // ✅ countだけ取りたいので head:true が軽い
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", meId)
    .eq("status", "accepted");

  if (error) return 0;
  return typeof count === "number" ? count : 0;
}

async function buildMetaForLoggedIn(supabase: any, meId: string): Promise<Meta> {
  const followCount = await getFollowCountAccepted(supabase, meId);

  // ✅ 0/1フォローの時だけ suggestion を作る（方針維持）
  if (followCount <= 1) {
    const exclude = new Set<string>([meId]);
    // 1フォローならその人は除外したいので followeeIdsも取る
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

  // ✅ suggestion無しでも followCount を返す
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
      title: "気になる人をフォローしてみましょう",
      subtitle: "ログインするとフォローできます（まずは覗けます）",
      users,
    },
  };
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);
  const cursor = toIsoOrNull(searchParams.get("cursor"));

  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id ?? null;

  // ✅ 未ログイン：公開投稿（discover相当） + meta（followCount=0）
  if (!meId) {
    let q = supabase
      .from("posts")
      .select(
        "id,user_id,created_at,visited_on,content,place_id,place_name,place_address,image_urls,image_variants,image_assets,cover_square_url,cover_full_url,cover_pin_url,recommend_score,price_yen,price_range, profiles!inner(id,display_name,avatar_url,is_public)"
      )
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false })
      .limit(Math.max(120, limit * 8));

    if (cursor) q = q.lt("created_at", cursor);

    const { data, error } = await q;
    if (error) return NextResponse.json({ posts: [], nextCursor: null, meta: await buildMetaForGuest(supabase) }, { status: 200 });

    const raw = (data ?? []).map((r: any) => {
      const { profiles, ...rest } = r;
      return {
        ...rest,
        profile: profiles ?? null,
        likeCount: 0,
        likedByMe: false,
        initialLikers: [],
        viewer_following_author: false,
      };
    });

    const arranged = enforceNoRepeatWithin(raw, 3).slice(0, limit);
    const nextCursorOut = arranged.length ? arranged[arranged.length - 1].created_at : null;

    const meta: Meta = cursor ? { followCount: 0, suggestOnce: false, suggestAtIndex: 1 } : await buildMetaForGuest(supabase);

    return NextResponse.json({ posts: arranged, nextCursor: nextCursorOut, meta }, { status: 200 });
  }

  // ✅ ログイン：friends RPC
  const { data, error } = await supabase.rpc("timeline_friends_v1", {
    p_limit: limit,
    p_cursor: cursor,
  });

  const rows = (data ?? []) as any[];
  const nextCursor = rows.length > 0 ? rows[rows.length - 1].created_at : null;

  const posts = error
    ? []
    : rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        created_at: r.created_at,
        visited_on: r.visited_on,
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

  // ✅ meta は “初回ページ” だけ（cursor ありなら followCount だけ返す）
  const meta: Meta = cursor ? await buildMetaForLoggedIn(supabase, meId) : await buildMetaForLoggedIn(supabase, meId);

  return NextResponse.json({ posts, nextCursor, meta }, { status: 200 });
}