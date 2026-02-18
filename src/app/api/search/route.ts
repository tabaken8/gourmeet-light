// src/app/api/search/route.ts
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
function toNumOrNull(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function metersToWalkMinCeil(m: number | null | undefined): number | null {
  if (typeof m !== "number" || !Number.isFinite(m) || m < 0) return null;
  return Math.max(1, Math.ceil(m / 80)); // 徒歩80m/分（ceilで統一）
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const followOnly = searchParams.get("follow") === "1";
  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);
  const cursorIso = toIsoOrNull(searchParams.get("cursor"));

  // ✅ station params（あれば station mode）
  const station_place_id = (searchParams.get("station_place_id") ?? "").trim();
  const station_name = (searchParams.get("station_name") ?? "").trim();
  const radius_m = clamp(toInt(searchParams.get("radius_m"), 3000), 100, 20000);

  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id ?? null;

  const isStation = !!station_place_id;

  // geo: q空なら従来通り「検索結果なし」（discover表示用）
  // station: q空でもOK（駅周辺の投稿一覧）
  if (!isStation && !q) {
    return NextResponse.json({ posts: [], nextCursor: null });
  }

  // -----------------------------
  // station: placeIds + distMap
  // -----------------------------
  let placeIds: string[] = [];
  let distMap: Map<string, number | null> | null = null;

  if (isStation) {
    const { data: linkRows, error: linkErr } = await supabase
      .from("place_station_links")
      .select("place_id, station_name, distance_m")
      .eq("station_place_id", station_place_id)
      .or(`distance_m.is.null,distance_m.lte.${radius_m}`)
      .limit(5000);

    if (linkErr) {
      return NextResponse.json({ ok: false, error: linkErr.message }, { status: 400 });
    }

    const links = Array.isArray(linkRows) ? linkRows : [];
    placeIds = Array.from(
      new Set(links.map((r: any) => r?.place_id).filter(Boolean).map(String))
    );

    // place_id -> distance map（最小距離を採用）
    distMap = new Map<string, number | null>();
    for (const r of links) {
      const pid = r?.place_id ? String(r.place_id) : null;
      if (!pid) continue;

      const dm = toNumOrNull((r as any)?.distance_m);

      if (!distMap.has(pid)) distMap.set(pid, dm);
      else {
        const prev = distMap.get(pid);
        if (prev == null && dm != null) distMap.set(pid, dm);
        else if (prev != null && dm != null && dm < prev) distMap.set(pid, dm);
      }
    }

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
  }

  // -----------------------------
  // fetch posts
  // -----------------------------
  let posts: any[] = [];
  let nextCursor: string | null = null;

  if (q) {
    // ✅ 重要：
    // v3 は “駅” を知らない（または駅を渡していない）と
    // 「全国の上位lim件」→ その後 stationフィルタ → 件数が激減 になりがち。
    // なので station の時だけ “多めに取って” 後段で stationフィルタ後に limit に丸める。
    const fetchLim = isStation ? Math.min(200, Math.max(limit * 20, 100)) : limit;

    const { data: v3data, error: v3err } = await supabase.rpc("search_posts_v3", {
      q,
      me,
      follow_only: followOnly,
      lim: fetchLim,
      cur: cursorIso,
    });

    if (v3err) {
      return NextResponse.json({ ok: false, error: v3err.message }, { status: 400 });
    }

    let rows = Array.isArray(v3data) ? v3data : [];

    // ✅ stationなら placeIds でフィルタ（混入防止の本丸）
    if (isStation) {
      const set = new Set(placeIds);
      rows = rows.filter((p: any) => p?.place_id && set.has(String(p.place_id)));
    }

    // ✅ ここで “返す件数” を limit に丸める
    rows = rows.slice(0, limit);

    // ✅ station UI fields 付与
    if (isStation && distMap) {
      posts = rows.map((p: any) => {
        const pid = p?.place_id ? String(p.place_id) : "";
        const dm = distMap!.get(pid) ?? null;
        return {
          ...p,
          // station検索の駅（UI表示用）
          search_station_name: station_name || null,
          search_station_distance_m: dm,
          search_station_minutes: metersToWalkMinCeil(dm),
        };
      });
    } else {
      posts = rows;
    }

    // ✅ cursor（返した posts 基準）
    nextCursor = posts.length === limit ? (posts[posts.length - 1]?.created_at ?? null) : null;
  } else {
    // ✅ station + q空：駅周辺の投稿を新着順で返す（posts直）

    const { data: postRows, error: perr } = await supabase
      .from("posts")
      .select(
        "id, user_id, created_at, visited_on, content, image_urls, image_variants, image_assets, cover_square_url, cover_full_url, cover_pin_url, place_id, place_name, place_address, recommend_score, price_yen, price_range"
      )
      .in("place_id", placeIds)
      .lt("created_at", cursorIso ?? "infinity")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (perr) {
      return NextResponse.json({ ok: false, error: perr.message }, { status: 400 });
    }

    const rows = Array.isArray(postRows) ? postRows : [];

    // ✅ profiles を一括付与
    const userIds = Array.from(new Set(rows.map((p: any) => p?.user_id).filter(Boolean).map(String)));
    const profileMap = new Map<string, any>();

    if (userIds.length > 0) {
      const { data: profRows, error: profErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, is_public")
        .in("id", userIds);

      if (!profErr && Array.isArray(profRows)) {
        for (const pr of profRows) if (pr?.id) profileMap.set(String(pr.id), pr);
      }
    }

    // ✅ places の nearest_* を一括付与
    const placeIdList = Array.from(new Set(rows.map((p: any) => p?.place_id).filter(Boolean).map(String)));
    const placeMap = new Map<string, any>();

    if (placeIdList.length > 0) {
      const { data: placeRows, error: placeErr } = await supabase
        .from("places")
        .select("place_id, nearest_station_name, nearest_station_distance_m")
        .in("place_id", placeIdList);

      if (!placeErr && Array.isArray(placeRows)) {
        for (const pl of placeRows) if (pl?.place_id) placeMap.set(String(pl.place_id), pl);
      }
    }

    posts = rows.map((p: any) => {
      const pid = p?.place_id ? String(p.place_id) : "";
      const dm = distMap?.get(pid) ?? null;
      const pl = pid ? placeMap.get(pid) : null;

      return {
        ...p,
        profile: profileMap.get(String(p.user_id)) ?? null,

        // 最寄駅（places由来）
        nearest_station_name: pl?.nearest_station_name ?? null,
        nearest_station_distance_m: pl?.nearest_station_distance_m ?? null,

        // station検索の駅（UI表示用）
        search_station_name: station_name || null,
        search_station_distance_m: dm,
        search_station_minutes: metersToWalkMinCeil(dm),
      };
    });

    nextCursor = posts.length === limit ? (posts[posts.length - 1]?.created_at ?? null) : null;
  }

  // stationならメタも返す（UIで使っても使わなくてもOK）
  if (isStation) {
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

  return NextResponse.json({ posts, nextCursor });
}
