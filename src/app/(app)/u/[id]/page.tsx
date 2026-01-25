// src/app/(app)/u/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FollowButton from "@/components/FollowButton";
import { Images, Globe2, Lock } from "lucide-react";

// ✅ ヒートマップ（Client Component）
import VisitHeatmap, { type HeatmapDay } from "@/components/VisitHeatmap";

export const dynamic = "force-dynamic";

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

function getThumbUrlFromPostRow(r: any): string | null {
  const v = r?.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;

  const urls = r?.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];

  return null;
}

/** 代表日付：visited_on があればそれ、無ければ created_at の JST日付 */
function getRepresentativeDayKey(r: any): string {
  if (r?.visited_on) return String(r.visited_on);
  if (r?.created_at) return formatJstYmdFromIso(String(r.created_at));
  return "0000-00-00";
}

export default async function UserPublicPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  // ログイン必須
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (!me) redirect("/auth/login");

  const userId = params.id;

  // 自分のページなら /profile へ
  if (userId === me.id) {
    redirect("/profile");
  }

  // プロフィール取得
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, is_public, header_image_url")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return notFound();

  const displayName = profile.display_name || "ユーザー";
  const username = profile.username || "";
  const bio = profile.bio || "";
  const avatarUrl = profile.avatar_url || "";
  const isPublic = profile.is_public ?? true;
  const headerImageUrl = profile.header_image_url || null;

  // 自分 → 相手（フォロー状態）
  let initiallyFollowing = false;
  let initiallyRequested = false;

  if (me && me.id !== userId) {
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

  // 統計（accepted のみ）
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
  const canViewPosts = isPublic || me.id === userId || initiallyFollowing;

  // -----------------------------
  // 投稿（グリッド用）: 代表日付で並べ替え（visited_on 優先）
  // -----------------------------
  let posts: any[] = [];
  if (canViewPosts) {
    const { data } = await supabase
      .from("posts")
      .select("id, image_urls, image_variants, created_at, visited_on, recommend_score")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);

    posts = (data ?? []).slice();

    // ✅ 代表日付（visited_on ?? created_at(JST日付)）で降順
    posts.sort((a, b) => {
      const da = getRepresentativeDayKey(a);
      const db = getRepresentativeDayKey(b);
      if (da !== db) return da < db ? 1 : -1; // desc

      const ca = String(a?.created_at ?? "");
      const cb = String(b?.created_at ?? "");
      if (ca !== cb) return ca < cb ? 1 : -1;

      return String(a?.id ?? "") < String(b?.id ?? "") ? 1 : -1;
    });

    posts = posts.slice(0, 24);
  }

  // -----------------------------
  // 行きたいリスト
  // -----------------------------
  let wantPosts: any[] = [];
  if (canViewPosts) {
    const { data: wantRows } = await supabase
      .from("post_wants")
      .select("post_id")
      .eq("user_id", userId);

    if (wantRows?.length) {
      const ids = wantRows.map((r) => r.post_id);
      const { data } = await supabase
        .from("posts")
        .select("id, image_urls, image_variants, created_at")
        .in("id", ids)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(24);
      wantPosts = data ?? [];
    }
  }

  // -----------------------------
  // ✅ ヒートマップ用データ（代表日付ベース）
  // visited_on が null の投稿も created_at(JST日付)で“草が生える”
  // -----------------------------
  let heatmapDays: HeatmapDay[] = [];

  if (canViewPosts) {
    // 直近12ヶ月(365日)の範囲 (JST日付)
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const today = new Date();
    const todayJst = dtf.format(today);
    const startJst = dtf.format(new Date(today.getTime() - 364 * 24 * 60 * 60 * 1000));

    // created_at のざっくり範囲 (timestamptz)
    const startIso = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000).toISOString();
    const endIso = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();

    // ① visited_on あり（来店日指定）
    const { data: withVisited } = await supabase
      .from("posts")
      .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
      .eq("user_id", userId)
      .not("visited_on", "is", null)
      .gte("visited_on", startJst)
      .lte("visited_on", todayJst)
      .limit(2000);

    // ② visited_on なし（代表日付＝投稿日）
    const { data: noVisited } = await supabase
      .from("posts")
      .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
      .eq("user_id", userId)
      .is("visited_on", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(2000);

    // idでユニーク化
    const rows = new Map<string, any>();
    for (const r of withVisited ?? []) rows.set(String(r.id), r);
    for (const r of noVisited ?? []) rows.set(String(r.id), r);

    // ✅ 型を明示して never を防ぐ
    type DayPost = { id: string; thumbUrl: string | null; score: number | null };
    type DayAcc = { date: string; count: number; maxScore: number | null; posts: DayPost[] };

    const dayMap = new Map<string, DayAcc>();

    for (const r of rows.values()) {
      const dateKey = getRepresentativeDayKey(r);
      if (dateKey < startJst || dateKey > todayJst) continue;

      // recommend_score を number|null に正規化（stringでも落ちない）
      const sRaw = (r as any)?.recommend_score;
      const score =
        typeof sRaw === "number"
          ? (Number.isFinite(sRaw) ? sRaw : null)
          : typeof sRaw === "string"
            ? (Number.isFinite(Number(sRaw)) ? Number(sRaw) : null)
            : null;

      const thumbUrl = getThumbUrlFromPostRow(r);

      const cur: DayAcc = dayMap.get(dateKey) ?? {
        date: dateKey,
        count: 0,
        maxScore: null,
        posts: [],
      };

      cur.count += 1;
      if (score !== null) cur.maxScore = cur.maxScore === null ? score : Math.max(cur.maxScore, score);
      cur.posts.push({ id: String(r.id), thumbUrl, score });

      dayMap.set(dateKey, cur);
    }

    heatmapDays = Array.from(dayMap.values())
      .map((d) => {
        // 同日内は score 高い順で3つだけ表示
        const sorted = d.posts.slice().sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
        const top3 = sorted.slice(0, 3).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl }));
        return { date: d.date, count: d.count, maxScore: d.maxScore, posts: top3 };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        {/* プロフィールヘッダー */}
        <section className="overflow-hidden rounded-2xl border border-orange-100 bg-white/95 shadow-sm backdrop-blur">
          <div className="relative">
            {/* カバー画像 */}
            <div className="relative z-0 h-28 w-full overflow-hidden bg-gradient-to-r from-orange-300 via-amber-200 to-orange-400 md:h-32">
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
              <div className="-mt-12 flex justify-between gap-4 md:-mt-14">
                {/* 左：アイコン & 名前 */}
                <div className="flex items-center gap-4 md:gap-5">
                  <div className="relative z-10 shrink-0">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="avatar"
                        className="h-20 w-20 rounded-full border-4 border-white bg-orange-100 object-cover shadow-md md:h-24 md:w-24"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-orange-100 text-2xl font-bold text-orange-700 shadow-md md:h-24 md:w-24">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="pt-18">
                    <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 md:text-2xl">
                      {displayName}
                    </h1>

                    <div className="mt-0.5 flex items-center gap-2">
                      {username && (
                        <p className="text-xs font-medium text-slate-500 md:text-sm">@{username}</p>
                      )}

                      {isFollowing && (
                        <p className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 md:text-xs">
                          フォローされています
                        </p>
                      )}
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

                {/* 右：フォローボタン */}
                {me.id === userId ? (
                  <span className="mt-2 rounded-full bg-orange-50 px-3 py-1 text-xs text-slate-600">
                    あなたのプロフィール
                  </span>
                ) : (
                  <div className="mt-18">
                    <FollowButton
                      targetUserId={profile.id}
                      targetUsername={profile.username}
                      initiallyFollowing={initiallyFollowing}
                      initiallyRequested={initiallyRequested}
                    />
                  </div>
                )}
              </div>

              {/* Bio */}
              {bio && (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {bio}
                </p>
              )}

              {/* 統計 */}
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
          </div>
        </section>

        {/* ✅ Bio と 投稿の間：来店ログヒートマップ */}
        {canViewPosts ? (
          <VisitHeatmap userId={userId} days={heatmapDays} />
        ) : (
          <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
            <h2 className="text-sm font-semibold text-slate-900 md:text-base">来店ログ</h2>
            <div className="mt-3 rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
              このアカウントの投稿はフォロワーのみが閲覧できます。
            </div>
          </section>
        )}

        {/* 投稿 */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 md:text-base">投稿</h2>

          {!canViewPosts ? (
            <div className="rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
              このアカウントの投稿はフォロワーのみが閲覧できます。
            </div>
          ) : posts.length ? (
            <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4 sm:gap-[3px] md:grid-cols-5">
              {posts.map((p) => {
                const thumb = getThumbUrlFromPostRow(p);
                return (
                  <a
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="group relative block aspect-square overflow-hidden bg-slate-100"
                    title={getRepresentativeDayKey(p)}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        className="h-full w-full object-cover transition group-hover:opacity-95"
                        alt=""
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"></div>
                    )}
                    {Array.isArray(p.image_urls) && p.image_urls.length > 1 && (
                      <Images size={16} className="absolute right-1 top-1 text-white drop-shadow" />
                    )}
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
              投稿はまだありません。
            </div>
          )}
        </section>

        {/* 行きたいリスト */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 md:text-base">
            行きたい店リスト (随時実装予定)
          </h2>

          {!canViewPosts ? (
            <div className="rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
              このアカウントの行きたい店リストはフォロワーのみが閲覧できます。
            </div>
          ) : wantPosts.length ? (
            <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4 sm:gap-[3px] md:grid-cols-5">
              {wantPosts.map((p) => {
                const thumb = getThumbUrlFromPostRow(p);
                return (
                  <a
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="group relative block aspect-square overflow-hidden bg-orange-50"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        className="h-full w-full object-cover transition group-hover:opacity-95"
                        alt=""
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-orange-900/80">
                        …
                      </div>
                    )}

                    {Array.isArray(p.image_urls) && p.image_urls.length > 1 && (
                      <Images size={16} className="absolute right-1 top-1 text-white drop-shadow" />
                    )}
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
              まだ登録がありません。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
