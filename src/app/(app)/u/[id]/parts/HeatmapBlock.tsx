import { createClient } from "@/lib/supabase/server";
import VisitHeatmap, { type HeatmapDay } from "@/components/VisitHeatmap";

// ---- utils ----
function formatJstYmdFromIso(iso: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date(iso)); // YYYY-MM-DD
}

/** 代表日付：visited_on があればそれ、無ければ created_at の JST日付 */
function getRepresentativeDayKey(r: any): string {
  if (r?.visited_on) return String(r.visited_on);
  if (r?.created_at) return formatJstYmdFromIso(String(r.created_at));
  return "0000-00-00";
}

export default async function HeatmapBlock({ userId }: { userId: string }) {
  const supabase = await createClient();

  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const today = new Date();
  const todayJst = dtf.format(today);
  const startJst = dtf.format(new Date(today.getTime() - 364 * 24 * 60 * 60 * 1000));

  const startIso = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000).toISOString();
  const endIso = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();

  // ✅ ここも並列
  const [withVisitedRes, noVisitedRes] = await Promise.all([
    supabase
      .from("posts")
      .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
      .eq("user_id", userId)
      .not("visited_on", "is", null)
      .gte("visited_on", startJst)
      .lte("visited_on", todayJst)
      .limit(2000),
    supabase
      .from("posts")
      .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
      .eq("user_id", userId)
      .is("visited_on", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(2000),
  ]);

  const withVisited = withVisitedRes.data ?? [];
  const noVisited = noVisitedRes.data ?? [];

  const rows = new Map<string, any>();
  for (const r of withVisited) rows.set(String(r.id), r);
  for (const r of noVisited) rows.set(String(r.id), r);

  type DayPost = { id: string; thumbUrl: string | null; score: number | null };
  type DayAcc = { date: string; count: number; maxScore: number | null; posts: DayPost[] };
  const dayMap = new Map<string, DayAcc>();

  const getThumbUrlFromPostRow = (r: any): string | null => {
    const v = r?.image_variants;
    if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;
    const urls = r?.image_urls;
    if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];
    return null;
  };

  for (const r of rows.values()) {
    const dateKey = getRepresentativeDayKey(r);
    if (dateKey < startJst || dateKey > todayJst) continue;

    const sRaw = (r as any)?.recommend_score;
    const score =
      typeof sRaw === "number"
        ? Number.isFinite(sRaw) ? sRaw : null
        : typeof sRaw === "string"
          ? Number.isFinite(Number(sRaw)) ? Number(sRaw) : null
          : null;

    const thumbUrl = getThumbUrlFromPostRow(r);

    const cur: DayAcc = dayMap.get(dateKey) ?? { date: dateKey, count: 0, maxScore: null, posts: [] };
    cur.count += 1;
    if (score !== null) cur.maxScore = cur.maxScore === null ? score : Math.max(cur.maxScore, score);
    cur.posts.push({ id: String(r.id), thumbUrl, score });
    dayMap.set(dateKey, cur);
  }

  const heatmapDays: HeatmapDay[] = Array.from(dayMap.values())
    .map((d) => {
      const sorted = d.posts.slice().sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
      const top3 = sorted.slice(0, 3).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl }));
      return { date: d.date, count: d.count, maxScore: d.maxScore, posts: top3 };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return <VisitHeatmap userId={userId} days={heatmapDays} />;
}
