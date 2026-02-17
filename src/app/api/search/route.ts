import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function toInt(x: string | null, d: number) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

function toIsoOrNull(x: string | null) {
  if (!x) return null;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function splitTerms(q: string) {
  return q
    .trim()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

type StationHit = {
  station_place_id: string;
  station_name: string;
};

type LinkRow = {
  place_id: string;
  station_place_id: string;
  station_name: string;
  distance_m: number | null;
  rank: number | null;
};

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const followOnly = searchParams.get("follow") === "1";
  const limit = Math.max(1, Math.min(50, toInt(searchParams.get("limit"), 20)));
  const cursorIso = toIsoOrNull(searchParams.get("cursor"));

  // 駅近傍検索の半径（UI用）
  const radiusM = Math.max(100, Math.min(20000, toInt(searchParams.get("radius_m"), 2000)));

  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id ?? null;

  if (!q) return NextResponse.json({ posts: [], nextCursor: null });

  // 1) 通常検索（v3）
  const { data: v3Data, error: v3Err } = await supabase.rpc("search_posts_v3", {
    q,
    me,
    follow_only: followOnly,
    lim: limit,
    cur: cursorIso,
  });
  if (v3Err) return NextResponse.json({ error: v3Err.message }, { status: 400 });

  const v3Rows = Array.isArray(v3Data) ? v3Data : [];

  // 2) q から「検索駅」を推定（place_station_links.station_name から当てる）
  //    - トークンごとに station_name ILIKE を投げて最初にヒットしたものを採用（rankが小さいもの優先）
  const terms = splitTerms(q);

  let searchStation: StationHit | null = null;

  // 駅名の候補ヒット：rank優先→距離優先→短すぎるトークンはスキップ
  for (const t of terms.sort((a, b) => b.length - a.length)) {
    if (t.length <= 1) continue;

    const { data: cand, error: candErr } = await supabase
      .from("place_station_links")
      .select("station_place_id, station_name, rank, distance_m")
      .ilike("station_name", `%${t}%`)
      .order("rank", { ascending: true, nullsFirst: false })
      .order("distance_m", { ascending: true, nullsFirst: false })
      .limit(1);

    if (!candErr && Array.isArray(cand) && cand.length > 0) {
      searchStation = {
        station_place_id: cand[0].station_place_id,
        station_name: cand[0].station_name,
      };
      break;
    }
  }

  // 3) （任意）検索駅が取れたら、駅近傍投稿も少しだけ追加で混ぜる
  //    - あなたが作った「駅検索専用RPC」がある前提
  //    - 無ければこのブロックを丸ごと消してOK（距離付与は下だけで動く）
  let stationRows: any[] = [];
  if (searchStation) {
    const { data: stData, error: stErr } = await supabase.rpc("search_posts_by_station_ui", {
      station_place_id: searchStation.station_place_id,
      me,
      follow_only: followOnly,
      radius_m: radiusM,
      lim: Math.min(20, limit), // 混ぜる分は少なめ
      cur: cursorIso,
    });
    if (!stErr) stationRows = Array.isArray(stData) ? stData : [];
  }

  // 4) v3Rows を基準に、stationRows を後ろに「重複排除して追加」
  const merged: any[] = [];
  const seen = new Set<string>();

  for (const r of v3Rows) {
    const id = String(r?.id ?? "");
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(r);
  }
  for (const r of stationRows) {
    const id = String(r?.id ?? "");
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(r);
  }

  // 5) 付与用に place_id を集める
  const placeIds = uniq(
    merged
      .map((r) => (r?.place_id ? String(r.place_id) : ""))
      .filter((x) => x && x.length > 0)
  );

  // 6) place_station_links から
  //    A) 各placeの最寄駅（rank=1）
  //    B) 検索駅からの距離（station_place_id一致）
  //    を引いて合成する
  const nearestMap = new Map<string, { name: string; distance_m: number | null }>();
  const fromSearchMap = new Map<string, { distance_m: number | null }>();

  if (placeIds.length > 0) {
    // A) nearest
    const { data: nearestLinks, error: nErr } = await supabase
      .from("place_station_links")
      .select("place_id, station_name, distance_m, rank")
      .in("place_id", placeIds)
      .eq("rank", 1);

    if (!nErr && Array.isArray(nearestLinks)) {
      for (const row of nearestLinks as any[]) {
        const pid = String(row.place_id ?? "");
        if (!pid) continue;
        nearestMap.set(pid, {
          name: String(row.station_name ?? ""),
          distance_m: row.distance_m ?? null,
        });
      }
    }

    // B) distance from searched station
    if (searchStation) {
      const { data: fromLinks, error: fErr } = await supabase
        .from("place_station_links")
        .select("place_id, station_place_id, distance_m")
        .in("place_id", placeIds)
        .eq("station_place_id", searchStation.station_place_id);

      if (!fErr && Array.isArray(fromLinks)) {
        for (const row of fromLinks as any[]) {
          const pid = String(row.place_id ?? "");
          if (!pid) continue;
          fromSearchMap.set(pid, { distance_m: row.distance_m ?? null });
        }
      }
    }
  }

  // 7) merged に駅UIフィールドを付与
  const enriched = merged.map((r) => {
    const pid = r?.place_id ? String(r.place_id) : "";
    const nearest = pid ? nearestMap.get(pid) : undefined;
    const fromS = pid ? fromSearchMap.get(pid) : undefined;

    return {
      ...r,

      // 検索駅（推定できた時だけ）
      searched_station_place_id: searchStation?.station_place_id ?? null,
      searched_station_name: searchStation?.station_name ?? null,
      searched_distance_m: fromS?.distance_m ?? null,

      // 店の最寄駅（rank=1）
      nearest_station_name: nearest?.name ?? null,
      nearest_station_distance_m: nearest?.distance_m ?? null,
    };
  });

  // nextCursor は v3 のページングを維持（混ぜた分は “おまけ” として扱う）
  const nextCursor = v3Rows.length === limit ? (v3Rows[v3Rows.length - 1]?.created_at ?? null) : null;

  return NextResponse.json({
    posts: enriched,
    nextCursor,
    // デバッグ用に返しても便利（不要なら消してOK）
    inferredStation: searchStation,
  });
}
