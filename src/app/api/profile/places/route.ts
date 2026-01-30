// src/app/api/profile/stats/year/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Scope = "me" | "public";
type BadgeTier = "none" | "bronze" | "silver" | "gold" | "diamond";

type TitleMeta = {
  kind: "starter" | "king" | "allrounder" | "traveler" | "steady" | "celebrity" | "local";
  emoji: string;
  accent: "amber" | "violet" | "rose" | "sky";
};

function clampNum(x: any): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function pctWithStableDecimals(intPct: number, seed: string) {
  // “整数がダサい”対策：seedから 0.00〜0.99 を安定生成して足す
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const frac = (h >>> 0) % 100; // 0..99
  return Math.max(0.01, Math.min(99.99, intPct + frac / 100));
}

function areaLabelFromAddress(addr: string | null): string | null {
  if (!addr) return null;
  const s = addr.trim();

  // 東京：市区町村
  if (s.includes("東京都")) {
    const m = s.match(/東京都([^0-9\s]+?(?:市|区|町|村))/);
    if (m?.[1]) return m[1];
    return "東京都";
  }

  // 日本：都道府県
  const pref = s.match(/(北海道|東京都|大阪府|京都府|.{2,3}県)/);
  if (pref?.[1]) return pref[1];

  // 海外：雑に先頭トークン
  const parts = s.split(/[,\s]/).filter(Boolean);
  if (parts.length) return parts[0];

  return null;
}

function tierFromValue(value: number, thresholds: { bronze: number; silver: number; gold: number; diamond: number }): BadgeTier {
  if (value >= thresholds.diamond) return "diamond";
  if (value >= thresholds.gold) return "gold";
  if (value >= thresholds.silver) return "silver";
  if (value >= thresholds.bronze) return "bronze";
  return "none";
}

function nextTier(value: number, thresholds: { bronze: number; silver: number; gold: number; diamond: number }) {
  if (value < thresholds.bronze) return { nextTier: "bronze" as BadgeTier, nextAt: thresholds.bronze };
  if (value < thresholds.silver) return { nextTier: "silver" as BadgeTier, nextAt: thresholds.silver };
  if (value < thresholds.gold) return { nextTier: "gold" as BadgeTier, nextAt: thresholds.gold };
  if (value < thresholds.diamond) return { nextTier: "diamond" as BadgeTier, nextAt: thresholds.diamond };
  return { nextTier: null, nextAt: null };
}

function titleFromMetric(metric: TitleMeta["kind"], extra?: any) {
  if (metric === "starter") {
    return { title: "はじめたて", meta: { kind: "starter", emoji: "🌱", accent: "amber" } as TitleMeta };
  }
  if (metric === "traveler") {
    return { title: "行脚の達人", meta: { kind: "traveler", emoji: "🧭", accent: "violet" } as TitleMeta };
  }
  if (metric === "steady") {
    return { title: "コツコツ職人", meta: { kind: "steady", emoji: "📅", accent: "rose" } as TitleMeta };
  }
  if (metric === "local") {
    const area = extra?.area as string | undefined;
    if (area) {
      return { title: `${area}の名人`, meta: { kind: "local", emoji: "📍", accent: "sky" } as TitleMeta };
    }
    return { title: "地元の名人", meta: { kind: "local", emoji: "📍", accent: "sky" } as TitleMeta };
  }
  // fallback
  return { title: "バランス型", meta: { kind: "allrounder", emoji: "🪄", accent: "sky" } as TitleMeta };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// dispersion: 平均距離（簡易）
function dispersionKm(points: Array<{ lat: number; lng: number }>) {
  if (points.length < 2) return 0;
  const base = points[0];
  let s = 0;
  for (let i = 1; i < points.length; i++) s += haversineKm(base, points[i]);
  return s / (points.length - 1);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id") || "";
  const scope = (url.searchParams.get("scope") || "public") as Scope;
  const yearParam = url.searchParams.get("year") || "all";
  const year: number | "all" = yearParam === "all" ? "all" : Number(yearParam);

  if (!userId) return NextResponse.json({ error: "missing user_id" }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });

  // posts: yearフィルタ（allのみ前提でも残しておく）
  // ※ created_at が null のデータは落とす
  let postsQ = supabase
    .from("posts")
    .select("id, user_id, place_id, created_at")
    .eq("user_id", userId);

  if (year !== "all" && Number.isFinite(year)) {
    const y = year as number;
    const from = `${y}-01-01T00:00:00.000Z`;
    const to = `${y + 1}-01-01T00:00:00.000Z`;
    postsQ = postsQ.gte("created_at", from).lt("created_at", to);
  }

  const { data: myPosts, error: myErr } = await postsQ;
  if (myErr) return NextResponse.json({ error: myErr.message }, { status: 500 });

  const myRows = (myPosts ?? []) as Array<{ id: string; user_id: string; place_id: string | null; created_at: string | null }>;
  const totalsPosts = myRows.length;

  // starter判定：3以下なら称号は starter（topPercentはUI側で出さない）
  const isStarter = totalsPosts <= 3;

  // places: genre/address/lat/lng を引く（あなたの places.address は “〒… 京都府…” 形式）
  const placeIds = Array.from(new Set(myRows.map((r) => r.place_id).filter(Boolean))) as string[];
  const placeInfo = new Map<
    string,
    { genre: string | null; lat: number | null; lng: number | null; address: string | null; name: string | null }
  >();

  if (placeIds.length) {
    const { data: places, error: pErr } = await supabase
      .from("places")
      .select("place_id, primary_genre, lat, lng, address, name")
      .in("place_id", placeIds);

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    for (const r of (places ?? []) as any[]) {
      const pid = String(r.place_id);
      placeInfo.set(pid, {
        genre: (r.primary_genre ?? null) as string | null,
        lat: clampNum(r.lat),
        lng: clampNum(r.lng),
        address: typeof r.address === "string" ? r.address : null,
        name: typeof r.name === "string" ? r.name : null,
      });
    }
  }

  // pie: genre counts
  const genreCounts = new Map<string, number>();
  for (const r of myRows) {
    const pid = r.place_id;
    const g = pid ? placeInfo.get(pid)?.genre : null;
    const key = (g && String(g).trim()) ? String(g).trim() : "未設定";
    genreCounts.set(key, (genreCounts.get(key) ?? 0) + 1);
  }

  const pie = Array.from(genreCounts.entries()).map(([name, value]) => ({ name, value }));

  // topGenre: count最大（ただし “信用”条件：同ジャンル2投稿以上が候補）
  let topGenre: null | { genre: string; count: number; topPercent: number } = null;

  // 同ジャンル2投稿以上の候補のみ
  const eligible = Array.from(genreCounts.entries())
    .filter(([g, c]) => g !== "未設定" && c >= 2);

  if (eligible.length) {
    eligible.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [g, c] = eligible[0];

    // 全ユーザー分布：このジャンル投稿数で順位（投稿少ない人も 0 として分母に含める）
    // ※ yearがallなら全期間対象
    let allQ = supabase.from("posts").select("user_id, place_id, created_at");
    if (year !== "all" && Number.isFinite(year)) {
      const y = year as number;
      const from = `${y}-01-01T00:00:00.000Z`;
      const to = `${y + 1}-01-01T00:00:00.000Z`;
      allQ = allQ.gte("created_at", from).lt("created_at", to);
    }
    const { data: allPosts, error: aErr } = await allQ.limit(20000);
    if (!aErr && allPosts) {
      const allRows = allPosts as Array<{ user_id: string; place_id: string | null; created_at: string | null }>;
      const allPlaceIds = Array.from(new Set(allRows.map((r) => r.place_id).filter(Boolean))) as string[];

      // 必要な place genre だけ引く（最小）
      const allPlaceGenre = new Map<string, string | null>();
      if (allPlaceIds.length) {
        const { data: pls2 } = await supabase
          .from("places")
          .select("place_id, primary_genre")
          .in("place_id", allPlaceIds.slice(0, 5000)); // 安全側

        for (const r of (pls2 ?? []) as any[]) {
          allPlaceGenre.set(String(r.place_id), (r.primary_genre ?? null) as string | null);
        }
      }

      const byUserCount = new Map<string, number>();
      for (const r of allRows) {
        const pid = r.place_id;
        if (!pid) continue;
        const gg = allPlaceGenre.get(pid) ?? null;
        if ((gg ?? "").toString().trim() !== g) continue;
        byUserCount.set(r.user_id, (byUserCount.get(r.user_id) ?? 0) + 1);
      }

      // 分母：投稿者全員（= allRows に登場する user を含める）
      const allUsers = new Set(allRows.map((r) => r.user_id));
      const scores: number[] = [];
      for (const uid of allUsers) scores.push(byUserCount.get(uid) ?? 0);

      const myScore = c;
      const greater = scores.filter((x) => x > myScore).length;
      const rank = 1 + greater;
      const intPct = Math.floor((rank / Math.max(1, scores.length)) * 100);
      topGenre = { genre: g, count: c, topPercent: pctWithStableDecimals(intPct, `${userId}|topGenre|${g}`) };
    } else {
      topGenre = { genre: g, count: c, topPercent: 50.0 };
    }
  }

  // 称号（行動特徴ベース）：traveler / steady / local を比較して最良を採用
  // starter は最優先
  let chosenKind: TitleMeta["kind"] = "allrounder";
  let chosenExtra: any = null;

  if (isStarter) {
    chosenKind = "starter";
  } else {
    // my points
    const pts = myRows
      .map((r) => {
        const pid = r.place_id;
        if (!pid) return null;
        const inf = placeInfo.get(pid);
        if (!inf || inf.lat == null || inf.lng == null) return null;
        return { lat: inf.lat, lng: inf.lng, place_id: pid, area: areaLabelFromAddress(inf.address ?? null) };
      })
      .filter(Boolean) as Array<{ lat: number; lng: number; place_id: string; area: string | null }>;

    const uniqPlaces = new Set(pts.map((p) => p.place_id)).size;

    // traveler: 分散が大きいほど強い（points>=4 & uniq>=3）
    let travelerPct = 1000;
    if (pts.length >= 4 && uniqPlaces >= 3) {
      const myScore = dispersionKm(pts);
      // 他人分布（簡易：places.lat/lng ありの人だけ）
      const { data: others, error: oErr } = await supabase
        .from("posts")
        .select("user_id, place_id")
        .neq("user_id", userId)
        .limit(20000);

      if (!oErr && others) {
        const otherRows = others as Array<{ user_id: string; place_id: string | null }>;
        const users = Array.from(new Set(otherRows.map((r) => r.user_id)));
        // まとめて place を引く
        const opids = Array.from(new Set(otherRows.map((r) => r.place_id).filter(Boolean))) as string[];
        const op = new Map<string, { lat: number | null; lng: number | null }>();
        if (opids.length) {
          const { data: opl } = await supabase.from("places").select("place_id, lat, lng").in("place_id", opids.slice(0, 5000));
          for (const r of (opl ?? []) as any[]) op.set(String(r.place_id), { lat: clampNum(r.lat), lng: clampNum(r.lng) });
        }

        const scoreList: number[] = [];
        for (const uid of users) {
          const ps = otherRows
            .filter((r) => r.user_id === uid && r.place_id)
            .map((r) => {
              const inf = r.place_id ? op.get(r.place_id) : null;
              if (!inf || inf.lat == null || inf.lng == null) return null;
              return { lat: inf.lat, lng: inf.lng };
            })
            .filter(Boolean) as Array<{ lat: number; lng: number }>;
          const up = new Set(otherRows.filter((r) => r.user_id === uid).map((r) => r.place_id).filter(Boolean)).size;
          if (ps.length < 4 || up < 3) continue;
          scoreList.push(dispersionKm(ps));
        }
        const greater = scoreList.filter((x) => x > myScore).length;
        const rank = 1 + greater;
        travelerPct = (rank / Math.max(1, scoreList.length)) * 100;
      }
    }

    // steady: 投稿日のバラつきが小さいほど強い（簡易：投稿日の標準偏差が小さい）
    let steadyPct = 1000;
    {
      const times = myRows.map((r) => (r.created_at ? Date.parse(r.created_at) : NaN)).filter((x) => Number.isFinite(x)) as number[];
      if (times.length >= 5) {
        times.sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < times.length; i++) gaps.push(Math.max(1, times[i] - times[i - 1]));
        const mean = gaps.reduce((s, x) => s + x, 0) / gaps.length;
        const varr = gaps.reduce((s, x) => s + (x - mean) * (x - mean), 0) / gaps.length;
        const cv = Math.sqrt(varr) / Math.max(1, mean); // 小さいほど規則的
        // 分布は雑：cv を 0..1 で 0に近いほど上位扱い
        steadyPct = Math.max(0.01, Math.min(99.99, cv * 100));
      }
    }

    // local: 分散が小さいほど強い（= -dispersion）
    let localPct = 1000;
    let localArea: string | null = null;
    if (pts.length >= 4 && uniqPlaces >= 3) {
      const d = dispersionKm(pts);
      // area は最頻
      const m = new Map<string, number>();
      for (const p of pts) if (p.area) m.set(p.area, (m.get(p.area) ?? 0) + 1);
      localArea = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      // “小さいほど上位” なので pct は d を 0..30km を 0..100 くらいに当てる簡易
      localPct = Math.max(0.01, Math.min(99.99, (d / 30) * 100));
    }

    // 一番 “上位（pctが小さい）” の行動特徴を称号に
    const candidates = [
      { kind: "traveler" as const, pct: travelerPct, extra: null },
      { kind: "steady" as const, pct: steadyPct, extra: null },
      { kind: "local" as const, pct: localPct, extra: { area: localArea } },
    ].filter((c) => Number.isFinite(c.pct) && c.pct < 1000);

    if (candidates.length) {
      candidates.sort((a, b) => a.pct - b.pct);
      chosenKind = candidates[0].kind;
      chosenExtra = candidates[0].extra;
    } else {
      chosenKind = "allrounder";
    }
  }

  const { title, meta } = titleFromMetric(chosenKind, chosenExtra);

  // badges（例：投稿数・ユニークジャンル数）
  const uniqueGenres = Array.from(genreCounts.keys()).filter((g) => g !== "未設定").length;

  const postsTier = tierFromValue(totalsPosts, { bronze: 10, silver: 30, gold: 70, diamond: 150 });
  const genreTier = tierFromValue(uniqueGenres, { bronze: 4, silver: 7, gold: 10, diamond: 14 });

  const postsNext = nextTier(totalsPosts, { bronze: 10, silver: 30, gold: 70, diamond: 150 });
  const genreNext = nextTier(uniqueGenres, { bronze: 4, silver: 7, gold: 10, diamond: 14 });

  if (scope === "me") {
    return NextResponse.json({
      ok: true,
      scope: "me",
      userId,
      year,
      title,
      titleMeta: meta,
      totals: { posts: totalsPosts },
      topGenre,
      globalRank: null,
      pie,
      badges: {
        posts: { tier: postsTier, value: totalsPosts, ...postsNext },
        genre: { tier: genreTier, value: uniqueGenres, ...genreNext },
      },
    });
  }

  // public
  return NextResponse.json({
    ok: true,
    scope: "public",
    userId,
    year,
    title,
    titleMeta: meta,
    totals: { posts: totalsPosts },
    topGenre,
    globalRank: null,
    badges: { postsTier, genreTier },
  });
}
