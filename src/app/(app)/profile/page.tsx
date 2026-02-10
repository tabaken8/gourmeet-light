// src/app/(app)/profile/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Images, Globe2, Lock, Plus } from "lucide-react";
import VisitHeatmap, { type HeatmapDay } from "@/components/VisitHeatmap";
import ProfileYearStats from "@/components/ProfileYearStats";
import AlbumBrowser, { type AlbumPost } from "@/components/AlbumBrowser";

export const dynamic = "force-dynamic";

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

  const todayKey = dtf.format(new Date()); // JST
  const [y, m, d] = todayKey.split("-").map(Number);

  // JSTの正午を基準に日付を戻す（DST無しなので安全）
  const jstNoonUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 9 * 60 * 60 * 1000;
  const targetUtcMs = jstNoonUtcMs - days * 24 * 60 * 60 * 1000;

  const targetJstKey = dtf.format(new Date(targetUtcMs + 9 * 60 * 60 * 1000));

  // targetJstKey の JST 00:00 を UTC ISO に
  const [yy, mm, dd] = targetJstKey.split("-").map(Number);
  const startUtcMs = Date.UTC(yy, mm - 1, dd, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const startIsoUtc = new Date(startUtcMs).toISOString();

  return { startKey: targetJstKey, startIsoUtc };
}

function getThumbUrlFromPost(p: any): string | null {
  // ✅ thumb優先
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
  title?: string | null;
};

function normalizePlacesShape(row: any) {
  // ✅ places が object でも array でも来るので object に正規化
  const pl = row?.places;
  const places = Array.isArray(pl) ? (pl[0] ?? null) : (pl ?? null);
  return { ...row, places };
}

export default async function AccountPage() {
  const supabase = await createClient();

  // 認証
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // プロフィール
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, username, is_public, header_image_url")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl = profile?.avatar_url ?? "";
  const username = profile?.username ?? "";
  const isPublic = profile?.is_public ?? true; // null は公開扱い
  const headerImageUrl = profile?.header_image_url ?? null;

  // Joined 表示
  let joinedLabel: string | null = null;
  if (user.created_at) {
    try {
      joinedLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short" }).format(
        new Date(user.created_at)
      );
    } catch {
      joinedLabel = null;
    }
  }

  // 統計
  const [{ count: postsCount = 0 }, { count: wantsCount = 0 }] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("post_wants").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  let followersCount = 0;
  let followingCount = 0;
  {
    const followers = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", user.id)
      .eq("status", "accepted");
    if (!followers.error && typeof followers.count === "number") followersCount = followers.count;

    const following = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id)
      .eq("status", "accepted");
    if (!following.error && typeof following.count === "number") followingCount = following.count;
  }

  // --- ✅ 来店ヒートマップ（直近12ヶ月） ---
  const { startKey: heatStartKey, startIsoUtc: heatStartIsoUtc } = subtractDaysKeyJST(364);

  const { data: heatRowsRaw } = await supabase
    .from("posts")
    .select("id, image_urls, image_variants, created_at, visited_on, recommend_score")
    .eq("user_id", user.id)
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

  // --- ✅ 投稿グリッド（代表日付でソート） ---
  const { data: gridRowsRaw } = await supabase
    .from("posts")
    .select("id, image_urls, image_variants, created_at, visited_on")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(240);

  const gridRows = (gridRowsRaw ?? []) as PostRow[];

  const postsSortedForGrid = [...gridRows].sort((a, b) => {
    const aKey = a.visited_on ? a.visited_on : formatJSTDayKey(a.created_at);
    const bKey = b.visited_on ? b.visited_on : formatJSTDayKey(b.created_at);
    if (aKey !== bKey) return aKey < bKey ? 1 : -1; // desc

    const av = a.visited_on ? 1 : 0;
    const bv = b.visited_on ? 1 : 0;
    if (av !== bv) return bv - av;

    return a.created_at < b.created_at ? 1 : -1;
  });

  const posts = postsSortedForGrid.slice(0, 24);

  // 行きたい！リスト
  const { data: wantRows } = await supabase.from("post_wants").select("post_id").eq("user_id", user.id);

  let wantPosts: PostRow[] = [];
  if (wantRows?.length) {
    const ids = wantRows.map((r) => r.post_id);
    const { data } = await supabase
      .from("posts")
      .select("id, image_urls, image_variants, created_at, title")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(24);
    wantPosts = (data ?? []) as PostRow[];
  }

  // -----------------------------
  // ✅ AlbumBrowser 用（places join）+ places正規化
  // -----------------------------
  let albumPosts: AlbumPost[] = [];
  {
const { data } = await supabase
  .from("posts")
  .select(`
    id,
    place_id,
    created_at,
    visited_on,
    recommend_score,
    image_urls,
    image_variants,
    places:places (
      place_id,
      name,
      address,
      photo_url,
      primary_genre,
      genre_tags,
      area_label_ja,
      area_label_en,
      area_key,
      country_name,
      search_text
    )
  `)

      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(400);

    albumPosts = (data ?? []).map(normalizePlacesShape) as any;
  }

  // -----------------------------
  // ✅ ピン（自分）
  // -----------------------------
  let pinnedPlaceIds: string[] = [];
  {
    const { data } = await supabase
      .from("place_pins")
      .select("place_id")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .limit(80);

    pinnedPlaceIds = (data ?? []).map((r: any) => String(r.place_id));
  }

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto w-full max-w-none px-3 py-4 md:max-w-4xl md:px-6 md:py-8">
        <div className="flex flex-col gap-5 md:gap-6">
          {/* プロフィールヘッダー */}
          <section className="overflow-hidden rounded-3xl border border-orange-100 bg-white/95 shadow-sm backdrop-blur">
            <div className="relative">
              {/* カバー */}
              <div className="relative z-0 h-28 w-full overflow-hidden bg-gradient-to-r from-orange-300 via-amber-200 to-orange-400 md:h-36">
                {headerImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={headerImageUrl} alt="header" className="h-full w-full object-cover" />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-900/25 via-orange-500/5 to-transparent" />

                {!isPublic && (
                  <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    <Lock size={14} />
                    <span>非公開アカウント</span>
                  </div>
                )}
              </div>

              {/* 本文 */}
              <div className="px-4 pb-5 md:px-6 md:pb-6">
                <div className="-mt-9 flex flex-col gap-3 md:-mt-14 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3 md:gap-5">
                    <div className="relative z-10 shrink-0">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt="avatar"
                          className="h-16 w-16 rounded-full border-4 border-white bg-orange-100 object-cover shadow-md md:h-24 md:w-24"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-orange-100 text-xl font-bold text-orange-700 shadow-md md:h-24 md:w-24">
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 md:pt-10">
                      <div className="inline-block rounded-2xl bg-white/70 px-3 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur">
                        <h1 className="text-lg font-bold tracking-tight text-slate-900 md:text-2xl leading-tight">
                          {displayName}
                        </h1>

                        {username && <p className="mt-0.5 text-xs font-medium text-slate-500 md:text-sm">@{username}</p>}

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 md:text-xs">
                          <span className="inline-flex items-center gap-1">
                            {isPublic ? (
                              <>
                                <Globe2 size={14} />
                                <span>公開プロフィール</span>
                              </>
                            ) : (
                              <>
                                <Lock size={14} />
                                <span>非公開プロフィール</span>
                              </>
                            )}
                          </span>

                          {joinedLabel && (
                            <>
                              <span className="h-1 w-1 rounded-full bg-slate-400" />
                              <span>{joinedLabel} から利用</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="md:pt-4">
                    <Link
                      href="/profile/edit"
                      className="inline-flex w-full items-center justify-center rounded-full border border-orange-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-orange-400 hover:bg-orange-50 md:w-auto md:text-xs md:font-medium md:py-1.5"
                    >
                      プロフィールを編集
                    </Link>
                  </div>
                </div>

                {bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{bio}</p>}

                <ul className="mt-4 flex flex-wrap gap-6 text-xs text-slate-700 md:text-sm">
                  <li className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900">{postsCount}</span>
                    <span>投稿</span>
                  </li>

                  <li className="flex items-center gap-1.5">
                    <Link href={`/u/${user.id}/following`} className="flex items-center gap-1.5 hover:underline">
                      <span className="font-semibold text-slate-900">{followingCount}</span>
                      <span>フォロー中</span>
                    </Link>
                  </li>

                  <li className="flex items-center gap-1.5">
                    <Link href={`/u/${user.id}/followers`} className="flex items-center gap-1.5 hover:underline">
                      <span className="font-semibold text-slate-900">{followersCount}</span>
                      <span>フォロワー</span>
                    </Link>
                  </li>

                  <li className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900">{wantsCount}</span>
                    <span>行きたい</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <ProfileYearStats userId={user.id} scope="me" />

          {/* ✅ ヒートマップはそのまま */}
          <VisitHeatmap userId={user.id} days={heatDays} />

          {/* 投稿（AlbumBrowser） */}
          <section className="rounded-3xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">投稿</h2>

              <Link
                href="/posts/new"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 md:h-9 md:text-xs"
              >
                <Plus size={16} />
                Post
              </Link>
            </div>

            <AlbumBrowser posts={albumPosts} pinnedPlaceIdsInitial={pinnedPlaceIds} isOwner={true} />

          </section>

          {/* 行きたい！ */}
          <section className="rounded-3xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900 md:text-base">行きたい！</h2>

            {wantPosts.length ? (
              <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4 sm:gap-[3px] md:grid-cols-5">
                {wantPosts.map((p) => {
                  const thumb = getThumbUrlFromPost(p);
                  return (
                    <a key={p.id} href={`/posts/${p.id}`} className="group relative block overflow-hidden bg-slate-100">
                      {thumb ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumb}
                            alt={p.title ?? ""}
                            className="aspect-square w-full object-cover transition group-hover:opacity-95"
                            loading="lazy"
                            decoding="async"
                          />
                          {(p.image_urls?.length ?? 0) > 1 && (
                            <Images size={16} className="absolute right-1 top-1 text-white drop-shadow" />
                          )}
                        </>
                      ) : (
                        <div className="flex aspect-square items-center justify-center bg-orange-50 p-2 text-center text-[10px] text-orange-900/80">
                          {p.title ?? "…"}
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-orange-50 bg-orange-50/60 p-8 text-center text-sm text-slate-600">
                まだ「行きたい！」はありません。
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
