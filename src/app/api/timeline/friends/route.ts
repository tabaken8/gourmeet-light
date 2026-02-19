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

type Meta =
  | {
      suggestOnce: boolean;
      suggestAtIndex: number; // 0-based
      suggestion: {
        title: string;
        subtitle?: string | null;
        users: Array<{
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          is_following: boolean;
          reason?: string | null;
        }>;
      };
    }
  | null;

async function buildSuggestMeta(supabase: any, meId: string): Promise<Meta> {
  // 自分の follow 数を見る（acceptedのみ）
  const { data: follows, error: fErr } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", meId)
    .eq("status", "accepted");

  if (fErr) return null;

  const followeeIds = (follows ?? []).map((r: any) => r.followee_id).filter(Boolean) as string[];
  const followCount = followeeIds.length;

  // ✅ 方針：0/1フォローの時だけサジェスト
  if (followCount > 1) return null;

  // 候補：publicで、自分と既フォロー以外から新しめに
  // ※本当は「フォローバック」や「友達がフォロー」なども足せるけど、まず確実に出す
  const exclude = new Set<string>([meId, ...followeeIds]);

  const { data: cand, error: cErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_public")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(30);

  if (cErr) return null;

  const users = (cand ?? [])
    .map((p: any) => ({
      id: String(p.id),
      display_name: (p.display_name ?? null) as string | null,
      avatar_url: (p.avatar_url ?? null) as string | null,
      is_following: false,
      reason: "おすすめ",
    }))
    .filter((u: any) => u.id && !exclude.has(u.id))
    .slice(0, 8);

  if (users.length === 0) return null;

  return {
    suggestOnce: true,
    suggestAtIndex: 1, // ✅ 2枚目に出す
    suggestion: {
      title: followCount === 0 ? "気になる人をフォローしてみましょう" : "この人たちも良さそう",
      subtitle: followCount === 0 ? "おすすめのユーザーを表示しています" : "フォロー中の人のつながりから提案",
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

  // ✅ friendsタブはログイン無しだと空（方針B）
  if (!meId) {
    return NextResponse.json({ posts: [], nextCursor: null, meta: null }, { status: 200 });
  }

  const { data, error } = await supabase.rpc("timeline_friends_v1", {
    p_limit: limit,
    p_cursor: cursor,
  });

  if (error) {
    // 失敗しても200で返してUI側を壊さない
    return NextResponse.json({ posts: [], nextCursor: null, meta: null }, { status: 200 });
  }

  const rows = (data ?? []) as any[];
  const nextCursor = rows.length > 0 ? rows[rows.length - 1].created_at : null;

  const posts = rows.map((r) => ({
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

  // ✅ meta は “初回ページ” だけ作る（cursorがあるときは基本出さない）
  const meta: Meta = cursor ? null : await buildSuggestMeta(supabase, meId);

  return NextResponse.json({ posts, nextCursor, meta }, { status: 200 });
}
