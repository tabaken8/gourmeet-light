// src/app/(app)/u/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FollowButton from "@/components/FollowButton";
import PostNotifyBellButton from "@/components/PostNotifyBellButton";
import { Globe2, Lock } from "lucide-react";
import VisitHeatmap, { type HeatmapDay } from "@/components/VisitHeatmap";
import AlbumBrowser, { type AlbumPost } from "@/components/AlbumBrowser";

export const dynamic = "force-dynamic";

const JST_TZ = "Asia/Tokyo";

// ---- utils ----
function dtfJstYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatJstYmdFromIso(iso: string): string {
  return dtfJstYmd().format(new Date(iso)); // YYYY-MM-DD
}

/**
 * JSTカレンダー基準で「今日Key」と「startKey(days前)」を作り、
 * created_at用に「startKeyのJST 0:00」をUTC ISOに変換して返す。
 */
function subtractDaysKeyJST(days: number): { startKey: string; startIsoUtc: string; todayKey: string } {
  const dtf = dtfJstYmd();

  const todayKey = dtf.format(new Date());
  const [y, m, d] = todayKey.split("-").map(Number);

  // JSTの今日12:00をUTCにして days 日引く（境界ブレ回避）
  const jstNoonUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 9 * 60 * 60 * 1000;
  const targetUtcMs = jstNoonUtcMs - days * 24 * 60 * 60 * 1000;

  const startKey = dtf.format(new Date(targetUtcMs + 9 * 60 * 60 * 1000));
  const [yy, mm, dd] = startKey.split("-").map(Number);

  // startKeyのJST 0:00 -> UTC ISO
  const startUtcMs = Date.UTC(yy, mm - 1, dd, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const startIsoUtc = new Date(startUtcMs).toISOString();

  return { startKey, startIsoUtc, todayKey };
}

/** 代表日付：visited_on があればそれ、無ければ created_at の JST日付 */
function getRepresentativeDayKey(r: any): string {
  if (r?.visited_on) return String(r.visited_on);
  if (r?.created_at) return formatJstYmdFromIso(String(r.created_at));
  return "0000-00-00";
}

function normalizePlacesShape(row: any) {
  const pl = row?.places;
  const places = Array.isArray(pl) ? (pl[0] ?? null) : (pl ?? null);
  return { ...row, places };
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

export default async function UserPublicPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  // ログイン必須
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (!me) redirect("/auth/login");

  const userId = params.id;

  // 自分のページなら /profile へ
  if (userId === me.id) redirect("/profile");

  // プロフィール取得
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, is_public")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return notFound();

  const displayName = profile.display_name || "ユーザー";
  const username = profile.username || "";
  const bio = profile.bio || "";
  const avatarUrl = profile.avatar_url || "";
  const isPublic = profile.is_public ?? true;

  // 自分 → 相手（フォロー状態）
  let initiallyFollowing = false;
  let initiallyRequested = false;

  if (me.id !== userId) {
    const { data: rel } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", me.id)
      .eq("followee_id", userId)
      .maybeSingle();

    if (rel?.status === "accepted") initiallyFollowing = true;
    if (rel?.status === "pending") initiallyRequested = true;
  }

  // 相手 → 自分（フォローされているか）
  let isFollowing = false;
  const { data: reverseRel } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", userId)
    .eq("followee_id", me.id)
    .eq("status", "accepted")
    .maybeSingle();

  if (reverseRel) isFollowing = true;

  // 統計
  const [
    { count: postsCount = 0 },
    { count: followersCount = 0 },
    { count: followingCount = 0 },
    { count: wantsCount = 0 },
  ] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", userId)
      .eq("status", "accepted"),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId)
      .eq("status", "accepted"),
    supabase.from("post_wants").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  // 投稿閲覧権限
  // - 公開ならOK
  // - 非公開は accepted follower のみ
  const canViewPosts = isPublic || initiallyFollowing;

  // 🔔 bell initial state (server-side)
  let initialBellEnabled = false;
  if (initiallyFollowing) {
    const { data: sub } = await supabase
      .from("user_post_subscriptions")
      .select("enabled")
      .eq("user_id", me.id)
      .eq("target_user_id", userId)
      .maybeSingle();
    initialBellEnabled = sub?.enabled ?? true;
  }

  // earliestKey (visited_on or created_at)
  let earliestKey: string | null = null;
  if (canViewPosts) {
    const [earliestVisitedQ, earliestCreatedQ] = await Promise.all([
      supabase
        .from("posts")
        .select("visited_on")
        .eq("user_id", userId)
        .not("visited_on", "is", null)
        .order("visited_on", { ascending: true })
        .limit(1),
      supabase
        .from("posts")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

    const v = (earliestVisitedQ.data ?? [])[0]?.visited_on ? String((earliestVisitedQ.data ?? [])[0].visited_on) : null;
    const cIso = (earliestCreatedQ.data ?? [])[0]?.created_at ? String((earliestCreatedQ.data ?? [])[0].created_at) : null;
    const c = cIso ? formatJstYmdFromIso(cIso) : null;

    if (v && c) earliestKey = v < c ? v : c;
    else earliestKey = v ?? c ?? null;
  }

  // heatmap data (1 year)
  let heatmapDays: HeatmapDay[] = [];
  if (canViewPosts) {
    const { startKey: startJstKey, startIsoUtc, todayKey: todayJstKey } = subtractDaysKeyJST(364);

    // visited_on / created_at を分けて並列取得（ズレに強い）
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
        .gte("created_at", startIsoUtc)
        .limit(2000),
    ]);

    const rowsById = new Map<string, any>();
    for (const r of withVisitedRes.data ?? []) rowsById.set(String(r.id), r);
    for (const r of noVisitedRes.data ?? []) rowsById.set(String(r.id), r);

    type DayPost = { id: string; thumbUrl: string | null; score: number | null; created_at: string };
    type DayAcc = { date: string; count: number; maxScore: number | null; posts: DayPost[] };
    const dayMap = new Map<string, DayAcc>();

    for (const r of rowsById.values()) {
      const dateKey = getRepresentativeDayKey(r);
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

    heatmapDays = Array.from(dayMap.values())
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
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  // AlbumBrowser posts
  let albumPosts: AlbumPost[] = [];
  if (canViewPosts) {
    const { data } = await supabase
      .from("posts")
      .select(
        `
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
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(400);

    albumPosts = (data ?? []).map(normalizePlacesShape) as any;
  }

  // Pins
  let pinnedPostIds: string[] = [];
  if (canViewPosts) {
    const { data } = await supabase
      .from("post_pins")
      .select("post_id")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .limit(80);

    pinnedPostIds = (data ?? []).map((r: any) => String(r.post_id));
  }

  // ===== 共通カード見た目（丸く統一） =====
  const cardClass =
    "w-full overflow-hidden rounded-2xl border border-black/[.06] bg-white/95 shadow-sm";
  const cardPad = "px-4 py-5 md:px-6 md:py-6";

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="w-full overflow-x-hidden pb-24 pt-6">
        <div className="flex w-full flex-col gap-6 md:mx-auto md:max-w-4xl md:px-6">
          {/* ========================= PROFILE CARD ========================= */}
          <section className={cardClass}>
            <div className={cardPad}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                {/* left */}
                <div className="flex min-w-0 items-start gap-4">
                  <div className="shrink-0">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="avatar"
                        className="h-20 w-20 rounded-full border border-black/[.06] bg-orange-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-black/[.06] bg-orange-100 text-2xl font-bold text-orange-700">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 md:text-2xl">
                      {displayName}
                    </h1>

                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {username ? <p className="text-xs font-medium text-slate-500 md:text-sm">@{username}</p> : null}

                      {isFollowing ? (
                        <p className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 md:text-xs">
                          フォローされています
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 md:text-xs">
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
                    </div>
                  </div>
                </div>

                {/* right */}
                <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
                  <div className="flex items-center justify-end gap-2">
                    <FollowButton
                      targetUserId={profile.id}
                      targetUsername={profile.username}
                      initiallyFollowing={initiallyFollowing}
                      initiallyRequested={initiallyRequested}
                    />
                    <PostNotifyBellButton
                      targetUserId={userId}
                      canToggle={initiallyFollowing}
                      initiallyEnabled={initialBellEnabled}
                    />
                  </div>

                  {initiallyRequested ? <p className="text-[11px] text-slate-500">フォロー承認後に通知をONにできます</p> : null}
                </div>
              </div>

              {bio ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{bio}</p> : null}

              <ul className="mt-4 flex flex-wrap gap-6 text-xs text-slate-700 md:text-sm">
                <li className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900">{postsCount}</span>
                  <span>投稿</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Link href={`/u/${userId}/following`} className="flex items-center gap-1.5 hover:underline">
                    <span className="font-semibold text-slate-900">{followingCount}</span>
                    <span>フォロー中</span>
                  </Link>
                </li>
                <li className="flex items-center gap-1.5">
                  <Link href={`/u/${userId}/followers`} className="flex items-center gap-1.5 hover:underline">
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
          </section>

          {/* ========================= HEATMAP CARD ========================= */}
          {canViewPosts ? (
            <section className={[cardClass, "p-4 md:p-5"].join(" ")}>
              <VisitHeatmap userId={userId} days={heatmapDays} earliestKey={earliestKey} />
            </section>
          ) : (
            <section className={[cardClass, "p-4 md:p-5"].join(" ")}>
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">来店ログ</h2>
              <div className="mt-3 rounded-xl border border-black/[.06] bg-white p-8 text-center text-xs text-slate-600 md:text-sm">
                このアカウントの投稿はフォロワーのみが閲覧できます。
              </div>
            </section>
          )}

          {/* ========================= ALBUM CARD ========================= */}
          <section className={[cardClass, "p-4 md:p-5"].join(" ")}>
            <h2 className="mb-3 text-sm font-semibold text-slate-900 md:text-base">投稿</h2>

            {!canViewPosts ? (
              <div className="rounded-xl border border-black/[.06] bg-white p-8 text-center text-xs text-slate-600 md:text-sm">
                このアカウントの投稿はフォロワーのみが閲覧できます。
              </div>
            ) : (
              <AlbumBrowser posts={albumPosts} pinnedPostIdsInitial={pinnedPostIds} isOwner={false} />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
