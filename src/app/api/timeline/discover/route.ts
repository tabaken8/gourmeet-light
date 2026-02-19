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

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);
  const cursor = toIsoOrNull(searchParams.get("cursor"));

  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id ?? null;

  let q = supabase
    .from("posts")
    .select("id,user_id,created_at,visited_on,content,place_id,place_name,place_address,image_urls,image_variants,image_assets,cover_square_url,cover_full_url,cover_pin_url,recommend_score,price_yen,price_range, profiles!inner(id,display_name,avatar_url,is_public)")
    .eq("profiles.is_public", true)
    .order("created_at", { ascending: false })
    .limit(Math.max(120, limit * 8));

  if (meId) q = q.neq("user_id", meId);
  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) return NextResponse.json({ posts: [], nextCursor: null }, { status: 200 });

  const raw = (data ?? []).map((r: any) => ({
    ...r,
    profile: r.profiles ?? null,
    viewer_following_author: false, // discoverでは一旦false（必要なら後で付与）
  }));

  const arranged = enforceNoRepeatWithin(raw, 3).slice(0, limit);
  const nextCursorOut = arranged.length ? arranged[arranged.length - 1].created_at : null;

  return NextResponse.json({ posts: arranged, nextCursor: nextCursorOut });
}
