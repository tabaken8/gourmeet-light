// src/components/HeatmapBlock.tsx (例)
import { createClient } from "@/lib/supabase/server";
import VisitHeatmap, { type HeatmapDay } from "@/components/VisitHeatmap";

// ---- utils ----
const JST_TZ = "Asia/Tokyo";

function dtfJstYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** ISO(timestamp) -> JST YYYY-MM-DD */
function formatJstYmdFromIso(iso: string): string {
  return dtfJstYmd().format(new Date(iso));
}

/**
 * JST基準で「今日」を YYYY-MM-DD にしてから days 引いた開始日を返す。
 * created_at で使うために「開始日の JST 0:00」をUTC ISOに変換したものも返す。
 */
function subtractDaysKeyJST(days: number): { startKey: string; startIsoUtc: string; todayKey: string } {
  const dtf = dtfJstYmd();

  // 今日(JST)の YYYY-MM-DD
  const todayKey = dtf.format(new Date());
  const [y, m, d] = todayKey.split("-").map(Number);

  // JSTの「今日 12:00」をUTCmsにして、daysぶん引く（DSTの影響を受けにくい）
  // JST=UTC+9 なので UTC = JST - 9h
  const jstNoonUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 9 * 60 * 60 * 1000;
  const targetUtcMs = jstNoonUtcMs - days * 24 * 60 * 60 * 1000;

  // days引いた日(JST)の YYYY-MM-DD
  const startKey = dtf.format(new Date(targetUtcMs + 9 * 60 * 60 * 1000));
  const [yy, mm, dd] = startKey.split("-").map(Number);

  // startKey の JST 0:00 を UTC ISO に変換
  const startUtcMs = Date.UTC(yy, mm - 1, dd, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const startIsoUtc = new Date(startUtcMs).toISOString();

  return { startKey, startIsoUtc, todayKey };
}

/** 代表日付：visited_on があればそれ、無ければ created_at の JST日付 */
function getRepresentativeDayKey(r: any): string | null {
  if (typeof r?.visited_on === "string" && r.visited_on.length === 10) return r.visited_on;
  if (typeof r?.created_at === "string") return formatJstYmdFromIso(r.created_at);
  return null;
}

function scoreAsNumber(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
}

function getThumbUrlFromPostRow(r: any): string | null {
  const v = r?.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;

  const urls = r?.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];

  return null;
}

export default async function HeatmapBlock({ userId }: { userId: string }) {
  const supabase = await createClient();

  // ✅ JSTカレンダー基準で「今日〜過去364日」
  const { startKey: startJstKey, startIsoUtc: startIsoUtc, todayKey: todayJstKey } = subtractDaysKeyJST(364);

  // ✅ visited_on 系と created_at 系を安全に分けて並列取得（B方式に統一）
  const [withVisitedRes, noVisitedRes] = await Promise.all([
    supabase
      .from("posts")
      .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
      .eq("user_id", userId)
      .not("visited_on", "is", null)
      .gte("visited_on", startJstKey)
      .lte("visited_on", todayJstKey)
      .limit(2000),

    supabase
      .from("posts")
      .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
      .eq("user_id", userId)
      .is("visited_on", null)
      .gte("created_at", startIsoUtc) // JST開始日の 0:00 を UTC ISO にした境界
      .limit(2000),
  ]);

  const withVisited = withVisitedRes.data ?? [];
  const noVisited = noVisitedRes.data ?? [];

  // 重複排除（念のため）
  const rowsById = new Map<string, any>();
  for (const r of withVisited) rowsById.set(String(r.id), r);
  for (const r of noVisited) rowsById.set(String(r.id), r);

  type DayPost = { id: string; thumbUrl: string | null; score: number | null; created_at: string };
  type DayAcc = { date: string; count: number; maxScore: number | null; posts: DayPost[] };
  const dayMap = new Map<string, DayAcc>();

  for (const r of rowsById.values()) {
    const dateKey = getRepresentativeDayKey(r);
    if (!dateKey) continue;

    // JST日付で範囲チェック（visited_on / created_at どっちでも統一的に）
    if (dateKey < startJstKey || dateKey > todayJstKey) continue;

    const score = scoreAsNumber(r?.recommend_score);
    const thumbUrl = getThumbUrlFromPostRow(r);

    const cur: DayAcc = dayMap.get(dateKey) ?? { date: dateKey, count: 0, maxScore: null, posts: [] };
    cur.count += 1;
    if (score !== null) cur.maxScore = cur.maxScore === null ? score : Math.max(cur.maxScore, score);

    cur.posts.push({
      id: String(r.id),
      thumbUrl,
      score,
      created_at: String(r.created_at ?? ""),
    });

    dayMap.set(dateKey, cur);
  }

  const heatmapDays: HeatmapDay[] = Array.from(dayMap.values())
    .map((d) => {
      const sorted = d.posts.slice().sort((a, b) => {
        const as = a.score ?? -Infinity;
        const bs = b.score ?? -Infinity;
        if (as !== bs) return bs - as;
        return a.created_at < b.created_at ? 1 : -1;
      });

      const top3 = sorted.slice(0, 3).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl }));
      return { date: d.date, count: d.count, maxScore: d.maxScore, posts: top3 };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // 新しい日付を先頭に

  // ✅ 長方形の角丸（外枠）
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <VisitHeatmap userId={userId} days={heatmapDays} />
    </div>
  );
}
