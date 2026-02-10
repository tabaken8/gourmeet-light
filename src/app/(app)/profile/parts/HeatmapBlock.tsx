import { createClient } from "@/lib/supabase/server";
import VisitHeatmap, { type HeatmapDay } from "@/components/VisitHeatmap";

function formatJSTDayKey(iso: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date(iso));
}

function subtractDaysKeyJST(days: number): { startKey: string; startIsoUtc: string } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const todayKey = dtf.format(new Date());
  const [y, m, d] = todayKey.split("-").map(Number);

  const jstNoonUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 9 * 60 * 60 * 1000;
  const targetUtcMs = jstNoonUtcMs - days * 24 * 60 * 60 * 1000;

  const targetJstKey = dtf.format(new Date(targetUtcMs + 9 * 60 * 60 * 1000));

  const [yy, mm, dd] = targetJstKey.split("-").map(Number);
  const startUtcMs = Date.UTC(yy, mm - 1, dd, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const startIsoUtc = new Date(startUtcMs).toISOString();

  return { startKey: targetJstKey, startIsoUtc };
}

function getThumbUrlFromPost(p: any): string | null {
  const v = p?.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;

  const urls = p?.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];

  return null;
}

function scoreAsNumber(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
}

type PostRow = {
  id: string;
  image_urls: string[] | null;
  image_variants: any[] | null;
  created_at: string;
  visited_on: string | null;
  recommend_score?: any;
};

export default async function HeatmapBlock({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { startKey: heatStartKey, startIsoUtc: heatStartIsoUtc } = subtractDaysKeyJST(364);

  const { data: heatRowsRaw } = await supabase
    .from("posts")
    .select("id, image_urls, image_variants, created_at, visited_on, recommend_score")
    .eq("user_id", userId)
    .or(`created_at.gte.${heatStartIsoUtc},visited_on.gte.${heatStartKey}`)
    .limit(2000);

  const heatRows = (heatRowsRaw ?? []) as PostRow[];

  const heatMap = new Map<
    string,
    {
      count: number;
      maxScore: number | null;
      posts: Array<{ id: string; thumbUrl: string | null; score: number | null; created_at: string }>;
    }
  >();

  for (const r of heatRows) {
    const repKey =
      typeof r.visited_on === "string" && r.visited_on.length === 10
        ? r.visited_on
        : typeof r.created_at === "string"
          ? formatJSTDayKey(r.created_at)
          : null;

    if (!repKey) continue;
    if (repKey < heatStartKey) continue;

    const score = scoreAsNumber((r as any).recommend_score);
    const thumbUrl = getThumbUrlFromPost(r);

    if (!heatMap.has(repKey)) heatMap.set(repKey, { count: 0, maxScore: null, posts: [] });

    const cur = heatMap.get(repKey)!;
    cur.count += 1;
    if (typeof score === "number") cur.maxScore = cur.maxScore === null ? score : Math.max(cur.maxScore, score);

    cur.posts.push({
      id: String(r.id),
      thumbUrl,
      score,
      created_at: String(r.created_at ?? ""),
    });
  }

  const heatDays: HeatmapDay[] = Array.from(heatMap.entries())
    .map(([date, v]) => {
      const postsSorted = [...v.posts].sort((a, b) => {
        const as = a.score ?? -1;
        const bs = b.score ?? -1;
        if (as !== bs) return bs - as;
        return a.created_at < b.created_at ? 1 : -1;
      });
      return {
        date,
        count: v.count,
        maxScore: v.maxScore,
        posts: postsSorted.slice(0, 3).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl })),
      } satisfies HeatmapDay;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return <VisitHeatmap userId={userId} days={heatDays} />;
}
