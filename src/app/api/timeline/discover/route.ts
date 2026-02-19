// src/app/api/timeline/discover/route.ts
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

  const limit = clamp(toInt(searchParams.get("limit"), 24), 1, 60);
  const cursor = toIsoOrNull(searchParams.get("cursor"));

  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id ?? null;

  const selectPublic = `
    id, content, user_id, created_at,
    image_urls, image_variants, image_assets,
    cover_square_url, cover_full_url, cover_pin_url,
    place_name, place_address, place_id,
    recommend_score, price_yen, price_range,
    profiles!inner ( id, display_name, avatar_url, is_public )
  `;

  let q = supabase
    .from("posts")
    .select(selectPublic)
    .eq("profiles.is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt("created_at", cursor);
  if (meId) q = q.neq("user_id", meId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ posts: [], nextCursor: null, error: error.message }, { status: 200 });

  const raw = (data ?? []) as any[];
  const posts = raw.map((r) => ({
    id: r.id,
    content: r.content ?? null,
    user_id: r.user_id,
    created_at: r.created_at,

    image_urls: r.image_urls ?? null,
    image_variants: r.image_variants ?? null,
    image_assets: r.image_assets ?? null,

    cover_square_url: r.cover_square_url ?? null,
    cover_full_url: r.cover_full_url ?? null,
    cover_pin_url: r.cover_pin_url ?? null,

    place_name: r.place_name ?? null,
    place_address: r.place_address ?? null,
    place_id: r.place_id ?? null,
    place_genre: null,

    recommend_score: r.recommend_score ?? null,
    price_yen: r.price_yen ?? null,
    price_range: r.price_range ?? null,

    profile: r.profiles
      ? {
          id: r.profiles.id,
          display_name: r.profiles.display_name,
          avatar_url: r.profiles.avatar_url,
          is_public: r.profiles.is_public,
        }
      : null,
  }));

  const nextCursor = raw.length ? raw[raw.length - 1].created_at : null;
  return NextResponse.json({ posts, nextCursor }, { status: 200 });
}
