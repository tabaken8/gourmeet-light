// src/app/api/profile/stats/year/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Scope = "me" | "public";
type BadgeTier = "none" | "bronze" | "silver" | "gold" | "diamond";

type TitleMeta = {
  kind: "king" | "allrounder" | "gourmet" | "starter";
  emoji: string;
  accent: "amber" | "violet" | "rose" | "sky";
};

type GlobalRank = { rank: number; totalActive: number; topPercent: number; metricLabel?: string };

type BadgeProgress = {
  tier: BadgeTier;
  value: number;
  nextTier: BadgeTier | null;
  nextAt: number | null;
};

type MeResponse = {
  ok: true;
  scope: "me";
  userId: string;
  year: number | null;

  title: string;
  titleMeta: TitleMeta;

  totals: { posts: number };
  topGenre: null | { genre: string; count: number };

  globalRank: null | GlobalRank;

  pie: Array<{ name: string; value: number }>;

  badges: {
    genre: BadgeProgress;
    posts: BadgeProgress;
  };
};

type PublicResponse = {
  ok: true;
  scope: "public";
  userId: string;
  year: number | null;

  title: string;
  titleMeta: TitleMeta;

  totals: { posts: number };
  topGenre: null | { genre: string; count: number };

  globalRank: null | GlobalRank;

  badges: {
    genreTier: BadgeTier;
    postsTier: BadgeTier;
  };
};

function clampYear(y: number) {
  if (!Number.isFinite(y)) return null;
  if (y < 2000 || y > 2100) return null;
  return Math.floor(y);
}

function jstYearNow(): number {
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric" }).format(new Date());
  return Number(y);
}

function yearRangeToUtcIso(year: number) {
  // JST 00:00 を UTC にずらして ISO
  const startUtcMs = Date.UTC(year, 0, 1, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const endUtcMs = Date.UTC(year + 1, 0, 1, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString() };
}

function yearRangeToVisitedOnKey(year: number) {
  return { startKey: `${year}-01-01`, endKey: `${year}-12-31` };
}

function safeGenre(x: unknown): string {
  const s = typeof x === "string" ? x.trim() : "";
  return s ? s : "その他";
}

function tierFromValue(value: number, thresholds: { bronze: number; silver: number; gold: number; diamond: number }): BadgeTier {
  if (value >= thresholds.diamond) return "diamond";
  if (value >= thresholds.gold) return "gold";
  if (value >= thresholds.silver) return "silver";
  if (value >= thresholds.bronze) return "bronze";
  return "none";
}

function nextTarget(value: number, thresholds: { bronze: number; silver: number; gold: number; diamond: number }) {
  if (value < thresholds.bronze) return { nextTier: "bronze" as const, nextAt: thresholds.bronze };
  if (value < thresholds.silver) return { nextTier: "silver" as const, nextAt: thresholds.silver };
  if (value < thresholds.gold) return { nextTier: "gold" as const, nextAt: thresholds.gold };
  if (value < thresholds.diamond) return { nextTier: "diamond" as const, nextAt: thresholds.diamond };
  return { nextTier: null, nextAt: null };
}

function pickTitle(topGenre: { genre: string; count: number } | null, totalPosts: number, distinctGenres: number) {
  if (topGenre && topGenre.count >= 6) {
    const share = totalPosts > 0 ? topGenre.count / totalPosts : 0;
    if (share >= 0.42) {
      return {
        title: `「${topGenre.genre}」キング`,
        meta: { kind: "king", emoji: "👑", accent: "amber" } satisfies TitleMeta,
      };
    }
  }
  if (totalPosts >= 30 && distinctGenres >= 5) {
    return { title: "オールラウンダー", meta: { kind: "allrounder", emoji: "🎯", accent: "sky" } satisfies TitleMeta };
  }
  if (totalPosts >= 15) {
    return { title: "美食家", meta: { kind: "gourmet", emoji: "🍽️", accent: "violet" } satisfies TitleMeta };
  }
  return { title: "はじめたて", meta: { kind: "starter", emoji: "✨", accent: "rose" } satisfies TitleMeta };
}

async function fetchPlacesGenresByIds(
  supabase: any,
  placeIds: string[]
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (placeIds.length === 0) return m;

  // IN の上限回避のためチャンク
  const chunkSize = 500;
  for (let i = 0; i < placeIds.length; i += chunkSize) {
    const chunk = placeIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("places")
      .select("place_id, primary_genre")
      .in("place_id", chunk);

    if (error) continue;
    for (const r of data ?? []) {
      const pid = String(r.place_id ?? "");
      if (!pid) continue;
      m.set(pid, safeGenre(r.primary_genre));
    }
  }
  return m;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id")?.trim() ?? "";
  const scopeParam = (url.searchParams.get("scope") ?? "public") as Scope;
  const yearParam = url.searchParams.get("year")?.trim() ?? "";

  if (!userId) {
    return NextResponse.json({ error: "user_id が必要です" }, { status: 400 });
  }

  // ログイン（無くても公開なら見れる）
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  // 対象プロフィール（公開設定）
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, is_public")
    .eq("id", userId)
    .maybeSingle();

  if (profErr || !profile) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

  const isPublic = profile.is_public ?? true;
  const isSelf = !!viewer && viewer.id === userId;

  // フォロー済み確認（accepted）
  let isFollowingAccepted = false;
  if (viewer && !isSelf) {
    const { data: rel } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", viewer.id)
      .eq("followee_id", userId)
      .eq("status", "accepted")
      .maybeSingle();
    if (rel) isFollowingAccepted = true;
  }

  const canView = isPublic || isSelf || isFollowingAccepted;
  if (!canView) {
    return NextResponse.json({ error: "このユーザーの情報は非公開です" }, { status: 403 });
  }

  // scope は「見せ方」を切り替えるだけ。本人以外は me を要求されても public に落とす
  const resolvedScope: Scope = isSelf && scopeParam === "me" ? "me" : "public";

  // year="all" なら year=null
  let year: number | null = null;
  if (yearParam && yearParam.toLowerCase() !== "all") {
    const y = clampYear(Number(yearParam));
    year = y ?? jstYearNow();
  }

  // 年フィルタ（visited_on優先 / created_at補完）
  const orFilter =
    year === null
      ? null
      : (() => {
          const { startKey, endKey } = yearRangeToVisitedOnKey(year);
          const { startIso, endIso } = yearRangeToUtcIso(year);
          // visited_on: startKey..endKey
          // created_at: startIso..endIso(未満)
          return `and(visited_on.gte.${startKey},visited_on.lte.${endKey}),and(created_at.gte.${startIso},created_at.lt.${endIso})`;
        })();

  // 対象ユーザーの posts 取得（JOINしない）
  const postsQuery = supabase
    .from("posts")
    .select("id, user_id, created_at, visited_on, place_id")
    .eq("user_id", userId)
    .limit(20000);

  const { data: postsRaw, error: postsErr } = orFilter ? await postsQuery.or(orFilter) : await postsQuery;
  if (postsErr) {
    return NextResponse.json({ error: "投稿の取得に失敗しました" }, { status: 500 });
  }

  const posts = (postsRaw ?? []) as Array<{
    id: string;
    user_id: string;
    created_at: string;
    visited_on: string | null;
    place_id: string | null;
  }>;

  const totalPosts = posts.length;

  // place_id -> primary_genre を別取得して紐付け
  const placeIds = Array.from(
    new Set(posts.map((p) => (p.place_id ? String(p.place_id) : "")).filter(Boolean))
  );
  const placeGenreMap = await fetchPlacesGenresByIds(supabase, placeIds);

  // ジャンル集計
  const genreCount = new Map<string, number>();
  for (const p of posts) {
    const pid = p.place_id ? String(p.place_id) : "";
    const g = pid ? placeGenreMap.get(pid) ?? "その他" : "その他";
    genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  }

  const pie = Array.from(genreCount.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const topGenre = pie.length ? { genre: pie[0].name, count: pie[0].value } : null;

  const distinctGenres = genreCount.size;
  const { title, meta: titleMeta } = pickTitle(topGenre, totalPosts, distinctGenres);

  // バッジ（閾値）
  const genreThresholds = { bronze: 10, silver: 25, gold: 50, diamond: 100 };
  const postsThresholds = { bronze: 20, silver: 60, gold: 120, diamond: 250 };

  const topGenreCount = topGenre?.count ?? 0;

  const genreTier = tierFromValue(topGenreCount, genreThresholds);
  const postsTier = tierFromValue(totalPosts, postsThresholds);

  const genreNext = nextTarget(topGenreCount, genreThresholds);
  const postsNext = nextTarget(totalPosts, postsThresholds);

  // 全ユーザー内順位（同じ期間の投稿数で比較）
  let globalRank: GlobalRank | null = null;
  try {
    const allQuery = supabase.from("posts").select("user_id").limit(20000);
    const { data: allRows, error: allErr } = orFilter ? await allQuery.or(orFilter) : await allQuery;

    if (!allErr && allRows) {
      const counts = new Map<string, number>();
      for (const r of allRows as any[]) {
        const uid = String(r.user_id ?? "");
        if (!uid) continue;
        counts.set(uid, (counts.get(uid) ?? 0) + 1);
      }
      const entries = Array.from(counts.entries())
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1]);

      const totalActive = entries.length;
      if (totalActive > 0) {
        const idx = entries.findIndex(([uid]) => uid === userId);
        const rank = idx >= 0 ? idx + 1 : totalActive;
        const topPercent = (rank / totalActive) * 100;
        globalRank = { rank, totalActive, topPercent, metricLabel: "投稿" };
      }
    }
  } catch {
    globalRank = null;
  }

  if (resolvedScope === "me") {
    const res: MeResponse = {
      ok: true,
      scope: "me",
      userId,
      year,

      title,
      titleMeta,

      totals: { posts: totalPosts },
      topGenre,

      globalRank,

      pie,

      badges: {
        genre: {
          tier: genreTier,
          value: topGenreCount,
          nextTier: genreNext.nextTier,
          nextAt: genreNext.nextAt,
        },
        posts: {
          tier: postsTier,
          value: totalPosts,
          nextTier: postsNext.nextTier,
          nextAt: postsNext.nextAt,
        },
      },
    };

    return NextResponse.json(res);
  }

  const res: PublicResponse = {
    ok: true,
    scope: "public",
    userId,
    year,

    title,
    titleMeta,

    totals: { posts: totalPosts },
    topGenre,

    globalRank,

    badges: {
      genreTier,
      postsTier,
    },
  };

  return NextResponse.json(res);
}
