// src/app/api/timeline/discover/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

async function attachNearestStationsToPosts(supabase: any, posts: any[]) {
  if (posts.length === 0) return posts;

  const placeIds = Array.from(
    new Set(posts.map((p: any) => p?.place_id).filter(Boolean).map((x: any) => String(x)))
  );

  if (placeIds.length === 0) {
    return posts.map((p: any) => ({
      ...p,
      nearest_station_name: null,
      nearest_station_distance_m: null,
    }));
  }

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
    const nearestDist = hit?.dist ?? null;
    return {
      ...p,
      nearest_station_name: hit?.name ?? null,
      nearest_station_distance_m: nearestDist,
    };
  });
}

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

  // enforceNoRepeatWithin 用に「少し多めに」取って並べ替えてから limit に落とす
  // （RPC 側が 50 上限なので、ここでは最大 50 まで）
  const fetchN = Math.min(50, Math.max(limit * 6, 20));

  const { data, error } = await supabase.rpc("timeline_discover_v1", {
    p_limit: fetchN,
    p_cursor: cursor,
  });

  if (error) {
    return NextResponse.json({ posts: [], nextCursor: null }, { status: 200 });
  }

  const rows = (data ?? []) as any[];

  // TimelinePostList が読むキー名に揃える
  const raw = rows.map((r) => ({
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

    // ✅ PostActions が必要とする
    likeCount: r.like_count ?? 0,
    likedByMe: r.liked_by_me ?? false,
    initialLikers: r.initial_likers ?? [],

    // ✅ 使いたければ後でUI側へ（今は無視でもOK）
    viewer_following_author: r.viewer_following_author ?? false,
  }));

  let arranged = enforceNoRepeatWithin(raw, 3).slice(0, limit);
  arranged = await attachNearestStationsToPosts(supabase, arranged);
  const nextCursorOut = arranged.length ? arranged[arranged.length - 1].created_at : null;

  return NextResponse.json({ posts: arranged, nextCursor: nextCursorOut }, { status: 200 });
}