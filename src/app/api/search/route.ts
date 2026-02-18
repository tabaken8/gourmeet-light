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
  return Math.max(1, Math.ceil(m / 80));
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NudgeSuggestion = {
  kind: "nearby" | "hub";
  station_place_id: string;
  station_name: string | null;
  reason: string;
  approx_shared_places?: number | null;

  sample_friend?: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;

  sample_post?: {
    id: string;
    recommend_score: number | null;
    place_id: string | null;
    place_name: string | null;

    cover_square_url?: string | null;
    cover_full_url?: string | null;
    cover_pin_url?: string | null;
    image_variants?: any[] | null;
    image_urls?: string[] | null;
  } | null;
};

type Nudge =
  | {
      type: "zero_results_suggestions";
      origin: {
        station_place_id: string;
        station_name: string | null;
        radius_m: number;
      };
      suggestions: NudgeSuggestion[];
      note: string;
    }
  | null;

// -----------------------------
// ✅ 駅 -> placeIds (強制フィルタ用)
// -----------------------------
async function getPlaceIdsForStation(params: {
  supabase: any;
  station_place_id: string;
  radius_m: number;
  limit?: number;
}) {
  const { supabase, station_place_id, radius_m } = params;

  const { data, error } = await supabase
    .from("place_station_links")
    .select("place_id")
    .eq("station_place_id", station_place_id)
    .or(`distance_m.is.null,distance_m.lte.${radius_m}`)
    .limit(params.limit ?? 8000);

  if (error) return { placeIds: [] as string[], ok: false as const };

  const rows = Array.isArray(data) ? data : [];
  const placeIds = Array.from(
    new Set(rows.map((r: any) => r?.place_id).filter(Boolean).map(String))
  );
  return { placeIds, ok: true as const };
}

// -----------------------------
// ✅ 候補駅ごとに「代表投稿」を取る（必ず駅フィルタを強制）
// - search_posts_v3 を複数件取り、API側で place_id を絞り込む
// - postId が既に使われてたらスキップ（重複排除）
// -----------------------------
async function fetchSampleForStationStrict(params: {
  supabase: any;
  q: string;
  me: string;
  station_place_id: string;
  station_name: string | null;
  radius_m: number;
  seenPostIds: Set<string>;
}) {
  const { supabase, q, me, station_place_id, radius_m, seenPostIds } = params;

  // 1) 強制フィルタ用 placeIds
  const { placeIds } = await getPlaceIdsForStation({ supabase, station_place_id, radius_m, limit: 9000 });
  if (placeIds.length === 0) return null;

  const placeSet = new Set(placeIds);

  // 2) RPCは多めに取る（ここ重要）
  const rpcArgs: any = {
    q,
    me,
    follow_only: true, // nudge はフォロー中のみ
    lim: 80,           // ✅ 1件ではなく多めに
    cur: null,
  };

  // station_place_id / radius_m を渡せるなら渡す（RPC側で使えるなら精度UP）
  rpcArgs.station_place_id = station_place_id;
  rpcArgs.radius_m = radius_m;

  const { data, error } = await supabase.rpc("search_posts_v3", rpcArgs);
  if (error) return null;

  let rows = Array.isArray(data) ? data : [];

  // 3) ✅ API側で station の placeIds に強制フィルタ
  rows = rows.filter((p: any) => p?.place_id && placeSet.has(String(p.place_id)));

  // 4) ✅ 同じ投稿が複数候補に出ないようにする
  const picked = rows.find((p: any) => {
    const id = p?.id ? String(p.id) : "";
    return id && !seenPostIds.has(id);
  });

  if (!picked?.id || !picked?.user_id) return null;

  const id = String(picked.id);
  seenPostIds.add(id);

  const prof = picked?.profile ?? null;

  return {
    friend: {
      user_id: String(picked.user_id),
      display_name: (prof?.display_name ?? null) as any,
      avatar_url: (prof?.avatar_url ?? null) as any,
    },
    post: {
      id,
      recommend_score: toNumOrNull(picked.recommend_score),
      place_id: picked.place_id ? String(picked.place_id) : null,
      place_name: (picked.place_name ?? null) as any,

      cover_square_url: (picked.cover_square_url ?? null) as any,
      cover_full_url: (picked.cover_full_url ?? null) as any,
      cover_pin_url: (picked.cover_pin_url ?? null) as any,
      image_variants: (picked.image_variants ?? null) as any,
      image_urls: (picked.image_urls ?? null) as any,
    },
  };
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const followOnly = searchParams.get("follow") === "1";
  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);
  const cursorIso = toIsoOrNull(searchParams.get("cursor"));

  const station_place_id = (searchParams.get("station_place_id") ?? "").trim();
  const station_name = (searchParams.get("station_name") ?? "").trim();
  const radius_m = clamp(toInt(searchParams.get("radius_m"), 3000), 100, 20000);

  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id ?? null;

  const isStation = !!station_place_id;

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
    placeIds = Array.from(new Set(links.map((r: any) => r?.place_id).filter(Boolean).map(String)));

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
        nudge: null,
      });
    }
  }

  // -----------------------------
  // fetch posts (main)
  // -----------------------------
  let posts: any[] = [];
  let nextCursor: string | null = null;

  if (q) {
    const fetchLim = isStation ? Math.min(200, Math.max(limit * 20, 100)) : limit;

    const rpcArgs: any = {
      q,
      me,
      follow_only: followOnly,
      lim: fetchLim,
      cur: cursorIso,
    };
    if (isStation) {
      rpcArgs.station_place_id = station_place_id;
      rpcArgs.radius_m = radius_m;
    }

    const { data: v3data, error: v3err } = await supabase.rpc("search_posts_v3", rpcArgs);
    if (v3err) return NextResponse.json({ ok: false, error: v3err.message }, { status: 400 });

    let rows = Array.isArray(v3data) ? v3data : [];

    if (isStation) {
      const set = new Set(placeIds);
      rows = rows.filter((p: any) => p?.place_id && set.has(String(p.place_id)));
    }

    rows = rows.slice(0, limit);

    if (isStation && distMap) {
      posts = rows.map((p: any) => {
        const pid = p?.place_id ? String(p.place_id) : "";
        const dm = distMap!.get(pid) ?? null;
        return {
          ...p,
          search_station_name: station_name || null,
          search_station_distance_m: dm,
          search_station_minutes: metersToWalkMinCeil(dm),
        };
      });
    } else {
      posts = rows;
    }

    nextCursor = posts.length === limit ? (posts[posts.length - 1]?.created_at ?? null) : null;
  } else {
    // station + q空
    const { data: postRows, error: perr } = await supabase
      .from("posts")
      .select(
        "id, user_id, created_at, visited_on, content, image_urls, image_variants, image_assets, cover_square_url, cover_full_url, cover_pin_url, place_id, place_name, place_address, recommend_score, price_yen, price_range"
      )
      .in("place_id", placeIds)
      .lt("created_at", cursorIso ?? "infinity")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (perr) return NextResponse.json({ ok: false, error: perr.message }, { status: 400 });

    posts = Array.isArray(postRows) ? postRows : [];
    nextCursor = posts.length === limit ? (posts[posts.length - 1]?.created_at ?? null) : null;
  }

  // -----------------------------
  // ✅ nudge (fixed): station + qあり + 結果0件 + meあり
  // - stationごとに placeIds を作って “必ず” 駅内の投稿から選ぶ
  // - 同じ投稿を複数候補に使わない
  // -----------------------------
  let nudge: Nudge = null;

  if (isStation && !!q && posts.length === 0 && me) {
    try {
      const altRadius = Math.min(12000, Math.max(3000, radius_m * 3));

      const suggestions: NudgeSuggestion[] = [];
      const seenStation = new Set<string>([station_place_id]);
      const seenPostIds = new Set<string>();

      // ---------- A) nearby候補（共通placeが多い駅 Top2） ----------
      const { data: baseLinks, error: baseErr } = await supabase
        .from("place_station_links")
        .select("place_id")
        .eq("station_place_id", station_place_id)
        .or(`distance_m.is.null,distance_m.lte.${altRadius}`)
        .limit(12000);

      if (!baseErr) {
        const basePlaceIds = Array.from(
          new Set((Array.isArray(baseLinks) ? baseLinks : []).map((r: any) => r?.place_id).filter(Boolean).map(String))
        );

        if (basePlaceIds.length > 0) {
          const sliced = basePlaceIds.slice(0, 2000);

          const { data: candLinks, error: candErr } = await supabase
            .from("place_station_links")
            .select("station_place_id, station_name, place_id")
            .in("place_id", sliced)
            .or(`distance_m.is.null,distance_m.lte.${altRadius}`)
            .limit(20000);

          if (!candErr && Array.isArray(candLinks) && candLinks.length > 0) {
            const stationCounts = new Map<string, { name: string | null; shared: number; placeSet: Set<string> }>();

            for (const r of candLinks) {
              const sid = r?.station_place_id ? String(r.station_place_id) : null;
              if (!sid) continue;
              if (sid === station_place_id) continue;

              const pid = r?.place_id ? String(r.place_id) : null;
              if (!pid) continue;

              if (!stationCounts.has(sid)) {
                stationCounts.set(sid, { name: (r as any)?.station_name ?? null, shared: 0, placeSet: new Set() });
              }
              const e = stationCounts.get(sid)!;
              if (!e.placeSet.has(pid)) {
                e.placeSet.add(pid);
                e.shared += 1;
              }
            }

            const nearSorted = Array.from(stationCounts.entries())
              .map(([sid, e]) => ({ sid, name: e.name, shared: e.shared }))
              .sort((a, b) => b.shared - a.shared);

            for (const c of nearSorted.slice(0, 2)) {
              if (!c.sid || seenStation.has(c.sid)) continue;

              const sample = await fetchSampleForStationStrict({
                supabase,
                q,
                me,
                station_place_id: c.sid,
                station_name: c.name ?? null,
                radius_m: altRadius,
                seenPostIds,
              });

              if (!sample) continue;
              seenStation.add(c.sid);

              suggestions.push({
                kind: "nearby",
                station_place_id: c.sid,
                station_name: c.name ?? null,
                approx_shared_places: c.shared,
                reason: "近い駅（周辺スポットの重なりが多い）",
                sample_friend: sample.friend,
                sample_post: sample.post,
              });
            }
          }
        }
      }

      // ---------- B) hub候補（主要駅 Top3 ただしヒットしたものだけ） ----------
      const { data: hubRows, error: hubErr } = await supabase
        .from("hub_stations")
        .select("station_place_id, station_name, priority")
        .eq("region", "tokyo")
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .limit(10);

      if (!hubErr && Array.isArray(hubRows)) {
        for (const hr of hubRows) {
          if (suggestions.length >= 5) break;

          const sid = hr?.station_place_id ? String(hr.station_place_id) : null;
          if (!sid) continue;
          if (seenStation.has(sid)) continue;

          const sample = await fetchSampleForStationStrict({
            supabase,
            q,
            me,
            station_place_id: sid,
            station_name: (hr?.station_name ?? null) as any,
            radius_m: altRadius,
            seenPostIds,
          });

          if (!sample) continue;
          seenStation.add(sid);

          suggestions.push({
            kind: "hub",
            station_place_id: sid,
            station_name: (hr?.station_name ?? null) as any,
            reason: "",
            sample_friend: sample.friend,
            sample_post: sample.post,
          });
        }
      }

      if (suggestions.length > 0) {
        nudge = {
          type: "zero_results_suggestions",
          origin: {
            station_place_id,
            station_name: station_name || null,
            radius_m,
          },
          suggestions: suggestions.slice(0, 5),
          note: "友達の投稿を表示しています。",
        };
      }
    } catch {
      nudge = null;
    }
  }

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
      nudge,
    });
  }

  return NextResponse.json({ posts, nextCursor });
}
