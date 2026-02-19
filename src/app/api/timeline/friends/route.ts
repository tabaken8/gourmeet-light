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

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);
  const cursor = toIsoOrNull(searchParams.get("cursor"));

  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id ?? null;
  if (!meId) return NextResponse.json({ posts: [], nextCursor: null }, { status: 200 });

  const { data, error } = await supabase.rpc("timeline_friends_v1", {
    p_limit: limit,
    p_cursor: cursor,
  });

  if (error) {
    return NextResponse.json({ posts: [], nextCursor: null }, { status: 200 });
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

    recommend_score: r.recommend_score,
    price_yen: r.price_yen,
    price_range: r.price_range,

    profile: {
      id: r.user_id,
      display_name: r.author_display_name,
      avatar_url: r.author_avatar_url,
      is_public: r.author_is_public ?? true,
    },
  }));

  return NextResponse.json({ posts, nextCursor });
}
