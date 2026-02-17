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

  const station_place_id = (searchParams.get("station_place_id") ?? "").trim();
  const station_name = (searchParams.get("station_name") ?? "").trim();
  const radius_m = clamp(toInt(searchParams.get("radius_m"), 3000), 100, 20000);
  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);
  const followOnly = searchParams.get("follow") === "1";
  const cursorIso = toIsoOrNull(searchParams.get("cursor"));

  // ★自由入力（ジャンル含む）を受け取る：辞書を効かせるため v3 に渡す
  const q = (searchParams.get("q") ?? "").trim();

  if (!station_place_id) {
    return NextResponse.json({ ok: false, error: "station_place_id is required" }, { status: 400 });
  }

  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id ?? null;

  // 1) まず station 対象の place_id を引く（距離込み）
  const { data: linkRows, error: linkErr } = await supabase
    .from("place_station_links")
    .select("place_id, station_name, distance_m")
    .eq("station_place_id", station_place_id)
    .or(`distance_m.is.null,distance_m.lte.${radius_m}`)
    .limit(5000); // 安全のため上限（多すぎる駅はそもそも異常）

  if (linkErr) {
    return NextResponse.json({ ok: false, error: linkErr.message }, { status: 400 });
  }

  const links = Array.isArray(linkRows) ? linkRows : [];
  const placeIds = Array.from(new Set(links.map((r: any) => r?.place_id).filter(Boolean)));

  if (placeIds.length === 0) {
    return NextResponse.json({
      ok: true,
      mode: "station",
      station_place_id,
      station_name: station_name || null,
      radius_m,
      count: 0,
      posts: [],
      nextCursor: null,
    });
  }

  // place_id -> distance のmap
  const distMap = new Map<string, number | null>();
  for (const r of links) {
    const pid = r?.place_id ? String(r.place_id) : null;
    if (!pid) continue;
    const dm = typeof r?.distance_m === "number" ? r.distance_m : null;
    // 近い方を採用
    if (!distMap.has(pid)) distMap.set(pid, dm);
    else {
      const prev = distMap.get(pid);
      if (prev == null && dm != null) distMap.set(pid, dm);
      else if (prev != null && dm != null && dm < prev) distMap.set(pid, dm);
    }
  }

  // 2) posts を取得
  // - q がある → v3（辞書あり）で検索 → placeIds で絞る
  // - q が空 → “駅だけ検索”として posts を単純に station内で新着取得
  let posts: any[] = [];
  let nextCursor: string | null = null;

  if (q) {
    const { data: v3data, error: v3err } = await supabase.rpc("search_posts_v3", {
      q,
      me,
      follow_only: followOnly,
      lim: limit,
      cur: cursorIso,
    });
    if (v3err) return NextResponse.json({ ok: false, error: v3err.message }, { status: 400 });

    const v3rows = Array.isArray(v3data) ? v3data : [];
    const filtered = v3rows.filter((p: any) => p?.place_id && placeIds.includes(String(p.place_id)));

    posts = filtered.map((p: any) => {
      const pid = p?.place_id ? String(p.place_id) : "";
      const dm = distMap.get(pid) ?? null;
      return {
        ...p,
        // station UI fields
        search_station_distance_m: dm,
        search_station_minutes: typeof dm === "number" ? Math.max(1, Math.ceil(dm / 80)) : null,
      };
    });

    nextCursor = posts.length === limit ? (posts[posts.length - 1]?.created_at ?? null) : null;
  } else {
    // 駅だけ：station内の投稿を新着順で
    // postsテーブルを直接：profileは別途付与
    const { data: postRows, error: perr } = await supabase
      .from("posts")
      .select("id, user_id, created_at, visited_on, content, image_urls, image_variants, image_assets, cover_square_url, cover_full_url, cover_pin_url, place_id, place_name, place_address, recommend_score, price_yen, price_range")
      .in("place_id", placeIds)
      .lt("created_at", cursorIso ?? "infinity")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (perr) return NextResponse.json({ ok: false, error: perr.message }, { status: 400 });

    const rows = Array.isArray(postRows) ? postRows : [];

    // profilesを一括付与
    const userIds = Array.from(new Set(rows.map((p: any) => p?.user_id).filter(Boolean).map(String)));
    const profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profRows } = await supabase.from("profiles").select("id, display_name, avatar_url, is_public").in("id", userIds);
      if (Array.isArray(profRows)) {
        for (const pr of profRows) if (pr?.id) profileMap.set(String(pr.id), pr);
      }
    }

    posts = rows.map((p: any) => {
      const pid = p?.place_id ? String(p.place_id) : "";
      const dm = distMap.get(pid) ?? null;
      return {
        ...p,
        profile: profileMap.get(String(p.user_id)) ?? null,
        search_station_distance_m: dm,
        search_station_minutes: typeof dm === "number" ? Math.max(1, Math.ceil(dm / 80)) : null,
      };
    });

    nextCursor = posts.length === limit ? (posts[posts.length - 1]?.created_at ?? null) : null;
  }

  return NextResponse.json({
    ok: true,
    mode: "station",
    station_place_id,
    station_name: station_name || null,
    radius_m,
    count: posts.length,
    posts,
    nextCursor,
  });
}
