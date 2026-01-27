// src/app/api/profile/stats/year/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Scope = "me" | "public";

type BadgeTier = "none" | "bronze" | "silver" | "gold" | "diamond";

type TitleMeta = {
  kind: "starter" | "king" | "allrounder" | "traveler" | "steady" | "celebrity" | "local";
  emoji: string;
  accent: "amber" | "violet" | "rose" | "sky";
};

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
  year: "all";
  title: string;
  titleMeta: TitleMeta;
  totals: { posts: number };
  topGenre: null | { genre: string; topPercent: number };
  pie: Array<{ name: string; value: number }>;
  badges: { genre: BadgeProgress; posts: BadgeProgress };
};

type PublicResponse = {
  ok: true;
  scope: "public";
  userId: string;
  year: "all";
  title: string;
  titleMeta: TitleMeta;
  totals: { posts: number };
  topGenre: null | { genre: string; topPercent: number };
  badges: { genreTier: BadgeTier; postsTier: BadgeTier };
};

function hash32(s: string) {
  // FNV-1a 32bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickStable<T>(seed: string, arr: T[]): T {
  if (!arr.length) throw new Error("pickStable: empty");
  const i = hash32(seed) % arr.length;
  return arr[i];
}

function pctWithStableDecimals(intPart: number, seed: string) {
  // 整数部分は rank 由来、少数第2位は userId で固定の “揺らぎ”
  const frac = (hash32(seed) % 100) / 100; // 0.00..0.99
  const v = Math.min(100, Math.max(0, intPart + frac));
  // 2桁にしたいので丸め
  return Math.round(v * 100) / 100;
}

function badgeFromValue(v: number): { tier: BadgeTier; nextTier: BadgeTier | null; nextAt: number | null } {
  const x = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  const steps = [
    { tier: "bronze" as const, at: 10 },
    { tier: "silver" as const, at: 25 },
    { tier: "gold" as const, at: 50 },
    { tier: "diamond" as const, at: 100 },
  ];

  let cur: BadgeTier = "none";
  for (const s of steps) {
    if (x >= s.at) cur = s.tier;
  }

  if (cur === "diamond") return { tier: "diamond", nextTier: null, nextAt: null };

  const next = cur === "none" ? steps[0] : steps[steps.findIndex((s) => s.tier === cur) + 1];
  return { tier: cur, nextTier: next?.tier ?? null, nextAt: next?.at ?? null };
}

function clampNum(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
}

function parsePrice(post: any): number | null {
  const yen = clampNum(post?.price_yen);
  if (yen !== null) return yen;

  const pr = typeof post?.price_range === "string" ? post.price_range.trim() : "";
  if (!pr) return null;

  // "xからy", "x-y", "x〜y" などを雑に拾う
  const nums =
  pr
    .match(/(\d[\d,]*)/g)
    ?.map((s: string) => Number(s.replace(/,/g, ""))) ?? [];

  const a = nums[0];
  if (!Number.isFinite(a)) return null;
  const b = nums[1];
  if (Number.isFinite(b)) return (a + b) / 2;
  return a;
}

function dateKey(post: any): string | null {
  // visited_on があれば最優先
  const v = post?.visited_on;
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  // created_at は timestamptz（文字列想定）
  const c = post?.created_at;
  if (typeof c === "string" && c.length >= 10) return c.slice(0, 10);
  return null;
}

function normalizedEntropy(counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const k = counts.length;
  if (k <= 1) return 0;
  let h = 0;
  for (const c of counts) {
    const p = c / total;
    if (p <= 0) continue;
    h += -p * Math.log(p);
  }
  return h / Math.log(k); // 0..1
}

function balanceScoreFromMap(m: Map<string, number>) {
  const counts = Array.from(m.values()).filter((x) => x > 0);
  const k = counts.length;
  if (k <= 1) return 0;
  const ent = normalizedEntropy(counts);
  const kGain = Math.log(1 + k);
  return ent * kGain;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const A =
    s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * (s2 * s2);
  const c = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
  return R * c;
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function robustDispersionKm(points: Array<{ lat: number; lng: number }>) {
  // 中心A = median(lat), median(lng)
  const lats = points.map((p) => p.lat).slice().sort((a, b) => a - b);
  const lngs = points.map((p) => p.lng).slice().sort((a, b) => a - b);
  const A = { lat: quantile(lats, 0.5), lng: quantile(lngs, 0.5) };

  const d = points.map((p) => haversineKm(A, p)).sort((a, b) => a - b);
  if (!d.length) return { D: 0, farCount: 0 };

  const q1 = quantile(d, 0.25);
  const q3 = quantile(d, 0.75);
  const iqr = Math.max(0, q3 - q1);
  const upper = q3 + 1.5 * iqr;

  const trimmed = d.filter((x) => x <= upper);
  const med = quantile(trimmed.length ? trimmed : d, 0.5);

  // “旅行好き”っぽさ：中心から離れた投稿が最低3つ欲しい（距離はユーザーのスケールに合わせる）
  const thresh = Math.max(10, med * 1.8); // 10km or 1.8*median
  const farCount = trimmed.filter((x) => x >= thresh).length;

  return { D: med, farCount };
}

function titleFromMetric(metric: string, extra?: { genre?: string }) {
  // 呼び名は複数用意して userId で固定ランダム
  if (metric === "starter") {
    return { title: "はじめたて", meta: { kind: "starter", emoji: "✨", accent: "sky" } as TitleMeta };
  }

  if (metric === "traveler") {
    const candidates = ["遠征グルメ", "食べ歩き旅人", "グルメ遠征家", "旅するグルメ"];
    return {
      title: candidates[0],
      meta: { kind: "traveler", emoji: "🧳", accent: "violet" } as TitleMeta,
      variants: candidates,
    };
  }

  if (metric === "local") {
    const candidates = ["ご近所グルメ", "街の常連", "近場グルメ", "地元の名人"];
    return {
      title: candidates[0],
      meta: { kind: "local", emoji: "📍", accent: "sky" } as TitleMeta,
      variants: candidates,
    };
  }

  if (metric === "celebrity") {
    const candidates = ["贅沢グルメ", "ラグジュアリー", "セレブ飯", "ご褒美名人"];
    return {
      title: candidates[0],
      meta: { kind: "celebrity", emoji: "💎", accent: "rose" } as TitleMeta,
      variants: candidates,
    };
  }

  if (metric === "steady") {
    const candidates = ["継続の人", "コツコツ派", "記録家", "積み上げタイプ"];
    return {
      title: candidates[0],
      meta: { kind: "steady", emoji: "🗓️", accent: "amber" } as TitleMeta,
      variants: candidates,
    };
  }

  if (metric === "balance") {
    const candidates = ["バランス型", "オールラウンダー", "幅広グルメ", "ジャンル横断"];
    return {
      title: candidates[0],
      meta: { kind: "allrounder", emoji: "🎯", accent: "amber" } as TitleMeta,
      variants: candidates,
    };
  }

  // genre_focus
  const g = extra?.genre ?? "グルメ";
  const candidates = [`${g}好き`, `${g}派`, `${g}マスター`, `${g}キング`];
  return {
    title: candidates[0],
    meta: { kind: "king", emoji: "👑", accent: "amber" } as TitleMeta,
    variants: candidates,
  };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const url = new URL(req.url);

  const userId = url.searchParams.get("user_id") || "";
  const scope = (url.searchParams.get("scope") || "public") as Scope;

  if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

  // scope=me は本人のみ
  if (scope === "me") {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (user.id !== userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // public は公開プロフィールのみ
  if (scope === "public") {
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("is_public")
      .eq("id", userId)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!prof?.is_public) return NextResponse.json({ error: "private" }, { status: 403 });
  }

  // 全投稿（全ユーザー分）を取得（現状データ量が小さい前提でJS集計）
  const { data: postsRaw, error: postsErr } = await supabase
    .from("posts")
    .select("user_id, place_id, price_yen, price_range, visited_on, created_at")
    .range(0, 9999);

  if (postsErr) return NextResponse.json({ error: postsErr.message }, { status: 400 });
  const posts = postsRaw ?? [];

  // totals（全投稿数）
  const totalByUser = new Map<string, number>();
  for (const p of posts) {
    const uid = String((p as any).user_id);
    totalByUser.set(uid, (totalByUser.get(uid) ?? 0) + 1);
  }
  const myTotal = totalByUser.get(userId) ?? 0;

  // place_id 一覧
  const placeIds = Array.from(
    new Set(
      posts
        .map((p: any) => p.place_id)
        .filter((x: any) => typeof x === "string" && x.length > 0)
    )
  );

  // places を引く（genre + lat/lng）
  const placeInfo = new Map<string, { genre: string | null; lat: number | null; lng: number | null }>();

  const chunk = <T,>(arr: T[], n: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  for (const ids of chunk(placeIds, 800)) {
    const { data: placesRaw, error: placesErr } = await supabase
      .from("places")
      .select("place_id, primary_genre, lat, lng")
      .in("place_id", ids);

    if (placesErr) return NextResponse.json({ error: placesErr.message }, { status: 400 });

    for (const r of placesRaw ?? []) {
      const pid = String((r as any).place_id);
      placeInfo.set(pid, {
        genre: (r as any).primary_genre ?? null,
        lat: clampNum((r as any).lat),
        lng: clampNum((r as any).lng),
      });
    }
  }

  // known totals（ジャンルが取れた投稿のみ）
  const knownTotalByUser = new Map<string, number>();
  const countByUserGenre = new Map<string, Map<string, number>>();

  // latlng by user
  const pointsByUser = new Map<string, Array<{ lat: number; lng: number; place_id: string }>>();

  // price by user
  const pricesByUser = new Map<string, number[]>();

  // date by user
  const datesByUser = new Map<string, string[]>();

  for (const p of posts) {
    const uid = String((p as any).user_id);
    const pid = typeof (p as any).place_id === "string" ? String((p as any).place_id) : "";
    const info = pid ? placeInfo.get(pid) : undefined;

    // dates
    const dk = dateKey(p);
    if (dk) {
      if (!datesByUser.has(uid)) datesByUser.set(uid, []);
      datesByUser.get(uid)!.push(dk);
    }

    // prices
    const pr = parsePrice(p);
    if (pr !== null) {
      if (!pricesByUser.has(uid)) pricesByUser.set(uid, []);
      pricesByUser.get(uid)!.push(pr);
    }

    // points
    if (info?.lat != null && info?.lng != null && pid) {
      if (!pointsByUser.has(uid)) pointsByUser.set(uid, []);
      pointsByUser.get(uid)!.push({ lat: info.lat, lng: info.lng, place_id: pid });
    }

    // genre counts
    const genre = info?.genre ?? null;
    if (!genre) continue;

    knownTotalByUser.set(uid, (knownTotalByUser.get(uid) ?? 0) + 1);
    if (!countByUserGenre.has(uid)) countByUserGenre.set(uid, new Map());
    const m = countByUserGenre.get(uid)!;
    m.set(genre, (m.get(genre) ?? 0) + 1);
  }

  // 参加権：投稿4件以上
  const activeUsers = Array.from(totalByUser.entries())
    .filter(([_, c]) => c >= 4)
    .map(([u]) => u);

  const activeSet = new Set(activeUsers);

  // -----------------------------
  // 得意ジャンル or バランス（表示用）
  // -----------------------------
  const myGenreCounts = countByUserGenre.get(userId) ?? new Map<string, number>();
  const myKnownTotal = knownTotalByUser.get(userId) ?? 0;

  // 各ジャンルで share を作って、そのジャンル内での上位%を計算 → 一番強いジャンル
  let bestGenre: null | { genre: string; topPercent: number; count: number } = null;

  if (activeSet.has(userId) && myKnownTotal > 0 && myGenreCounts.size > 0) {
    for (const [genre, myCount] of myGenreCounts.entries()) {
      const myShare = myCount / myKnownTotal;

      const shares: number[] = [];
      for (const uid of activeUsers) {
        const denom = knownTotalByUser.get(uid) ?? 0;
        if (denom <= 0) continue;
        const m = countByUserGenre.get(uid);
        const c = m?.get(genre) ?? 0;
        if (c <= 0) continue;
        shares.push(c / denom);
      }
      if (!shares.length) continue;

      const greater = shares.filter((x) => x > myShare).length;
      const rank = 1 + greater;
      const basePctInt = Math.floor((rank / shares.length) * 100); // 整数部分
      const topPercent = pctWithStableDecimals(basePctInt, `${userId}|genre|${genre}`);
      const cand = { genre, topPercent, count: myCount };

      if (!bestGenre) bestGenre = cand;
      else if (cand.topPercent < bestGenre.topPercent) bestGenre = cand;
      else if (cand.topPercent === bestGenre.topPercent && cand.count > bestGenre.count) bestGenre = cand;
      else if (cand.topPercent === bestGenre.topPercent && cand.count === bestGenre.count && cand.genre < bestGenre.genre) bestGenre = cand;
    }
  }

  // バランス指標（全ユーザー順位）
  let bestBalance: null | { topPercent: number } = null;
  if (activeSet.has(userId) && myKnownTotal > 0) {
    const myBal = balanceScoreFromMap(myGenreCounts);
    if (myBal > 0) {
      const scores: number[] = [];
      for (const uid of activeUsers) {
        const denom = knownTotalByUser.get(uid) ?? 0;
        if (denom <= 0) continue;
        const m = countByUserGenre.get(uid);
        if (!m || m.size <= 0) continue;
        const s = balanceScoreFromMap(m);
        if (s > 0) scores.push(s);
      }

      if (scores.length) {
        const greater = scores.filter((x) => x > myBal).length;
        const rank = 1 + greater;
        const basePctInt = Math.floor((rank / scores.length) * 100);
        bestBalance = { topPercent: pctWithStableDecimals(basePctInt, `${userId}|balance`) };
      }
    }
  }

  // 表示用 topGenre は「バランスがジャンルより上位ならバランス」
  let topGenre: null | { genre: string; topPercent: number } = null;
  if (bestBalance && (!bestGenre || bestBalance.topPercent < bestGenre.topPercent)) {
    topGenre = { genre: "バランス", topPercent: bestBalance.topPercent };
  } else if (bestGenre) {
    topGenre = { genre: bestGenre.genre, topPercent: bestGenre.topPercent };
  }

  // -----------------------------
  // 称号：複数指標で “一番上位” を採用
  // -----------------------------
  // 投稿3件以下：強制
  if (myTotal <= 3) {
    const t = titleFromMetric("starter");
    const pie =
      scope === "me"
        ? Array.from(myGenreCounts.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
        : [];

    const postsProg = badgeFromValue(myTotal);
    const genreCountForBadge =
      topGenre?.genre === "バランス"
        ? Math.max(0, ...Array.from(myGenreCounts.values()))
        : topGenre?.genre
          ? (myGenreCounts.get(topGenre.genre) ?? 0)
          : 0;
    const genreProg = badgeFromValue(genreCountForBadge);

    if (scope === "me") {
      const res: MeResponse = {
        ok: true,
        scope: "me",
        userId,
        year: "all",
        title: t.title,
        titleMeta: t.meta,
        totals: { posts: myTotal },
        topGenre,
        pie,
        badges: {
          posts: { ...postsProg, value: Math.floor(myTotal) },
          genre: { ...genreProg, value: Math.floor(genreCountForBadge) },
        },
      };
      return NextResponse.json(res);
    }

    const pub: PublicResponse = {
      ok: true,
      scope: "public",
      userId,
      year: "all",
      title: t.title,
      titleMeta: t.meta,
      totals: { posts: myTotal },
      topGenre,
      badges: {
        postsTier: postsProg.tier,
        genreTier: genreProg.tier,
      },
    };
    return NextResponse.json(pub);
  }

  // 参加権なし（= 投稿4未満）はここには来ないが念のため
  const eligible = activeSet.has(userId);

  // 指標を作る（ユーザーごと）
  type MetricKey = "traveler" | "local" | "celebrity" | "steady" | "balance" | "genre_focus";
  type MetricCand = { key: MetricKey; topPercent: number; extra?: any };

  const candidates: MetricCand[] = [];

  if (eligible) {
    // balance
    if (bestBalance) candidates.push({ key: "balance", topPercent: bestBalance.topPercent });

    // genre_focus
    if (bestGenre) candidates.push({ key: "genre_focus", topPercent: bestGenre.topPercent, extra: { genre: bestGenre.genre } });

    // traveler/local: points がそこそこある人のみ
    const pts = pointsByUser.get(userId) ?? [];
    const uniqPlaces = new Set(pts.map((x) => x.place_id));
    if (pts.length >= 4 && uniqPlaces.size >= 3) {
      const { D, farCount } = robustDispersionKm(pts.map((x) => ({ lat: x.lat, lng: x.lng })));

      // traveler: farCount が3以上で評価対象（「1回の旅行」だけで旅人扱いにならない）
      if (farCount >= 3) {
        const myScore = D; // 大きいほど遠征
        const scores: number[] = [];
        for (const uid of activeUsers) {
          const ptu = pointsByUser.get(uid) ?? [];
          const up = new Set(ptu.map((x) => x.place_id));
          if (ptu.length < 4 || up.size < 3) continue;
          const { D: d2, farCount: f2 } = robustDispersionKm(ptu.map((x) => ({ lat: x.lat, lng: x.lng })));
          if (f2 < 3) continue;
          if (d2 > 0) scores.push(d2);
        }
        if (scores.length) {
          const greater = scores.filter((x) => x > myScore).length;
          const rank = 1 + greater;
          const basePctInt = Math.floor((rank / scores.length) * 100);
          candidates.push({
            key: "traveler",
            topPercent: pctWithStableDecimals(basePctInt, `${userId}|traveler`),
          });
        }
      }

      // local: 近いほど強い（farCount 条件は不要）
      if (D > 0) {
        const myScore = -D; // 大きいほどローカル
        const scores: number[] = [];
        for (const uid of activeUsers) {
          const ptu = pointsByUser.get(uid) ?? [];
          const up = new Set(ptu.map((x) => x.place_id));
          if (ptu.length < 4 || up.size < 3) continue;
          const { D: d2 } = robustDispersionKm(ptu.map((x) => ({ lat: x.lat, lng: x.lng })));
          if (d2 <= 0) continue;
          scores.push(-d2);
        }
        if (scores.length) {
          const greater = scores.filter((x) => x > myScore).length;
          const rank = 1 + greater;
          const basePctInt = Math.floor((rank / scores.length) * 100);
          candidates.push({
            key: "local",
            topPercent: pctWithStableDecimals(basePctInt, `${userId}|local`),
          });
        }
      }
    }

    // celebrity: price がある程度ある人のみ
    const myPrices = pricesByUser.get(userId) ?? [];
    if (myPrices.length >= 4) {
      const sp = myPrices.slice().sort((a, b) => a - b);
      const myMed = quantile(sp, 0.5);

      const meds: number[] = [];
      for (const uid of activeUsers) {
        const pp = pricesByUser.get(uid) ?? [];
        if (pp.length < 4) continue;
        const s = pp.slice().sort((a, b) => a - b);
        meds.push(quantile(s, 0.5));
      }

      if (meds.length) {
        const greater = meds.filter((x) => x > myMed).length;
        const rank = 1 + greater;
        const basePctInt = Math.floor((rank / meds.length) * 100);
        candidates.push({
          key: "celebrity",
          topPercent: pctWithStableDecimals(basePctInt, `${userId}|celebrity`),
        });
      }
    }

    // steady: 日付がある程度ある人のみ（間隔のばらつきが小さいほど強い）
    const myDates = (datesByUser.get(userId) ?? []).slice().sort();
    const uniqDays = Array.from(new Set(myDates));
    if (uniqDays.length >= 6) {
      const dayNums = uniqDays.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
      const gaps: number[] = [];
      for (let i = 1; i < dayNums.length; i++) gaps.push(Math.max(1, Math.round((dayNums[i] - dayNums[i - 1]) / 86400000)));
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length);
      const cv = mean > 0 ? sd / mean : 999;
      const myScore = -cv + Math.log(1 + myTotal) * 0.15; // ちょいだけ投稿量も加点

      const scores: number[] = [];
      for (const uid of activeUsers) {
        const ds = (datesByUser.get(uid) ?? []).slice().sort();
        const u = Array.from(new Set(ds));
        if (u.length < 6) continue;
        const t = u.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
        const g: number[] = [];
        for (let i = 1; i < t.length; i++) g.push(Math.max(1, Math.round((t[i] - t[i - 1]) / 86400000)));
        const m = g.reduce((a, b) => a + b, 0) / g.length;
        const s = Math.sqrt(g.reduce((a, b) => a + (b - m) * (b - m), 0) / g.length);
        const c = m > 0 ? s / m : 999;
        const sc = -c + Math.log(1 + (totalByUser.get(uid) ?? 0)) * 0.15;
        if (Number.isFinite(sc)) scores.push(sc);
      }

      if (scores.length) {
        const greater = scores.filter((x) => x > myScore).length;
        const rank = 1 + greater;
        const basePctInt = Math.floor((rank / scores.length) * 100);
        candidates.push({
          key: "steady",
          topPercent: pctWithStableDecimals(basePctInt, `${userId}|steady`),
        });
      }
    }
  }

  // 候補がない場合のフォールバック
  let chosen: MetricCand | null = null;
  if (candidates.length) {
    // topPercent が最小（＝最も上位）の指標を採用
    chosen = candidates.slice().sort((a, b) => a.topPercent - b.topPercent)[0];
  } else {
    // 参加権あるのに候補ゼロの場合は、とりあえず “オールラウンダー”
    chosen = { key: "balance", topPercent: 100 };
  }

  // 称号生成（同指標内の呼び名は userId で固定）
  const baseTitle = titleFromMetric(
    chosen.key === "genre_focus" ? "genre_focus" : chosen.key,
    chosen.key === "genre_focus" ? { genre: chosen.extra?.genre } : undefined
  );

  const variants = (baseTitle as any).variants as string[] | undefined;
  const title = variants ? pickStable(`${userId}|title|${chosen.key}|${chosen.extra?.genre ?? ""}`, variants) : baseTitle.title;

  const titleMeta: TitleMeta = baseTitle.meta;

  // pie（meだけ）
  const pie =
    scope === "me"
      ? Array.from(myGenreCounts.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      : [];

  // badges
  const postsProgRaw = badgeFromValue(myTotal);

  const genreCountForBadge =
    topGenre?.genre === "バランス"
      ? Math.max(0, ...Array.from(myGenreCounts.values()))
      : topGenre?.genre
        ? (myGenreCounts.get(topGenre.genre) ?? 0)
        : 0;

  const genreProgRaw = badgeFromValue(genreCountForBadge);

  if (scope === "me") {
    const res: MeResponse = {
      ok: true,
      scope: "me",
      userId,
      year: "all",
      title,
      titleMeta,
      totals: { posts: myTotal },
      topGenre,
      pie,
      badges: {
        posts: { ...postsProgRaw, value: Math.floor(myTotal) },
        genre: { ...genreProgRaw, value: Math.floor(genreCountForBadge) },
      },
    };
    return NextResponse.json(res);
  }

  const pub: PublicResponse = {
    ok: true,
    scope: "public",
    userId,
    year: "all",
    title,
    titleMeta,
    totals: { posts: myTotal },
    topGenre,
    badges: {
      postsTier: postsProgRaw.tier,
      genreTier: genreProgRaw.tier,
    },
  };
  return NextResponse.json(pub);
}
