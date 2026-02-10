import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ImageVariant = { thumb?: string | null; full?: string | null };
type ProfileLite = { id: string; display_name: string | null; avatar_url: string | null; is_public?: boolean | null };
type PostRowLite = {
  id: string;
  user_id: string;
  created_at: string;
  image_urls: string[] | null;
  image_variants?: ImageVariant[] | null;
  place_name: string | null;
  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;
  profiles: ProfileLite | null;
};

function getFirstThumb(p: PostRowLite): string | null {
  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const v0 = variants[0];
  return v0?.thumb ?? v0?.full ?? (Array.isArray(p.image_urls) ? p.image_urls[0] ?? null : null);
}

function formatYen(n: number) {
  try { return new Intl.NumberFormat("ja-JP").format(n); } catch { return String(n); }
}
function formatPrice(p: PostRowLite): string | null {
  if (typeof p.price_yen === "number" && Number.isFinite(p.price_yen)) return `¥${formatYen(Math.max(0, Math.floor(p.price_yen)))}`;
  if (!p.price_range) return null;
  const m: Record<string, string> = {
    "~999": "〜¥999",
    "1000-1999": "¥1,000〜¥1,999",
    "2000-2999": "¥2,000〜¥2,999",
    "3000-3999": "¥3,000〜¥3,999",
    "4000-4999": "¥4,000〜¥4,999",
    "5000-6999": "¥5,000〜¥6,999",
    "7000-9999": "¥7,000〜¥9,999",
    "10000-14999": "¥10,000〜¥14,999",
    "15000-19999": "¥15,000〜¥19,999",
    "20000-24999": "¥20,000〜¥24,999",
    "25000-29999": "¥25,000〜¥29,999",
    "30000-49999": "¥30,000〜¥49,999",
    "50000+": "¥50,000〜",
  };
  return m[p.price_range] ?? p.price_range;
}

export default async function MoreDiscoverBlock({
  currentPostId,
  meId,
}: {
  currentPostId: string;
  meId: string | null;
}) {
  const supabase = await createClient();

  // ここは元のロジックを踏襲（必要ならさらに最適化できる）
  let followingIds: string[] = [];
  if (meId) {
    const { data: fData, error: fErr } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", meId);

    if (!fErr && Array.isArray(fData)) {
      followingIds = fData.map((r: any) => r?.following_id).filter((x: any) => typeof x === "string");
    }
  }

  const recLimit = 9;
  let q = supabase
    .from("posts")
    .select(
      `
        id,
        user_id,
        created_at,
        image_urls,
        image_variants,
        place_name,
        recommend_score,
        price_yen,
        price_range,
        profiles (
          id,
          display_name,
          avatar_url,
          is_public
        )
      `
    )
    .neq("id", currentPostId)
    .order("created_at", { ascending: false })
    .limit(recLimit);

  if (meId) q = q.neq("user_id", meId);

  if (meId && followingIds.length > 0) {
    const csv = `(${followingIds.map((x) => `"${x}"`).join(",")})`;
    const qa: any = q;
    q = qa.not("user_id", "in", csv);
  }

  const { data: rData } = await q;
  const recPosts = (rData as any[])?.filter(Boolean) as PostRowLite[];

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">もっと見つける</div>
          <div className="text-[11px] text-slate-500">テイストが似ているお店</div>
        </div>
        <Link href="/timeline?tab=discover" className="gm-chip gm-press inline-flex items-center px-2 py-1 text-[11px] text-orange-700 hover:underline">
          もっと見る
        </Link>
      </div>

      {recPosts.length === 0 ? (
        <div className="rounded-2xl border border-black/[.06] bg-white/70 p-6 text-center text-xs text-slate-500">
          まだおすすめがありません。
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {recPosts.map((rp) => {
            const rdisplay = rp.profiles?.display_name ?? "ユーザー";
            const rthumb = getFirstThumb(rp);
            const rscore = typeof rp.recommend_score === "number" && rp.recommend_score >= 1 && rp.recommend_score <= 10 ? rp.recommend_score : null;
            const rprice = formatPrice(rp);

            return (
              <Link
                key={rp.id}
                href={`/posts/${rp.id}`}
                className="gm-press group overflow-hidden rounded-2xl border border-black/[.06] bg-white/80 backdrop-blur"
              >
                <div className="relative aspect-square bg-slate-100">
                  {rthumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={rthumb} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-slate-100" />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10" />
                  <div className="pointer-events-none absolute inset-x-2 bottom-2">
                    <div className="inline-flex max-w-full items-center rounded-full bg-black/35 px-2 py-1 text-[10px] text-white/90 backdrop-blur">
                      <span className="truncate">{rp.place_name ?? " "}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3">
                  <div className="truncate text-[11px] font-medium text-slate-900">{rdisplay}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {rscore ? <span className="gm-chip inline-flex items-center px-2 py-1 text-[10px] text-orange-800">{rscore}/10</span> : null}
                    {rprice ? <span className="gm-chip inline-flex items-center px-2 py-1 text-[10px] text-slate-700">{rprice}</span> : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
