// src/app/(app)/profile/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Globe2, Lock, Plus } from "lucide-react";

import VisitHeatmap, { type HeatmapDay } from "@/components/VisitHeatmap";
import AlbumBlock from "./parts/AlbumBlock";

import InstagramIcon from "@/components/icons/InstagramIcon";
import XIcon from "@/components/icons/XIcon";

export const dynamic = "force-dynamic";

// ---- utils ----
function formatJstYmdFromIso(iso: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date(iso));
}

function getRepresentativeDayKey(r: any): string {
  if (r?.visited_on) return String(r.visited_on);
  if (r?.created_at) return formatJstYmdFromIso(String(r.created_at));
  return "0000-00-00";
}

function cleanHandle(v: any): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.replace(/^@+/, "");
}

function joinLabelFromCreatedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function SnsChip({
  kind,
  handle,
}: {
  kind: "instagram" | "x";
  handle: string;
}) {
  const h = cleanHandle(handle);
  if (!h) return null;

  const href =
    kind === "instagram"
      ? `https://www.instagram.com/${encodeURIComponent(h)}`
      : `https://x.com/${encodeURIComponent(h)}`;

  const Icon =
    kind === "instagram" ? (
      <InstagramIcon className="h-4 w-4" />
    ) : (
      <XIcon className="h-4 w-4 text-slate-900" />
    );

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={[
        "group inline-flex items-center gap-2 rounded-full border border-black/[.08] bg-white",
        "px-3 py-1.5 text-[13px] font-semibold text-slate-700",
        "shadow-[0_1px_0_rgba(0,0,0,0.02)] transition",
        "hover:border-black/[.12] hover:bg-slate-50",
        "focus:outline-none focus:ring-4 focus:ring-orange-200/40",
      ].join(" ")}
      aria-label={`${kind}を開く`}
    >
      <span className="grid h-6 w-6 place-items-center">{Icon}</span>
      <span className="text-slate-400">@</span>
      <span className="tracking-tight text-slate-900">{h}</span>
    </a>
  );
}

export default async function AccountPage() {
  const supabase = await createClient();

  // auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // profile
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, bio, avatar_url, username, is_public, instagram_username, x_username"
    )
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl =
    profile?.avatar_url ??
    ((user.user_metadata as any)?.avatar_url ?? "") ??
    "";
  const username = profile?.username ?? "";
  const isPublic = profile?.is_public ?? true;

  const instagram = cleanHandle((profile as any)?.instagram_username ?? "");
  const x = cleanHandle((profile as any)?.x_username ?? "");

  const joinedLabel = joinLabelFromCreatedAt(user.created_at);

  // counts
  const [postsQ, wantsQ, followersQ, followingQ] = await Promise.all([
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("post_wants")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", user.id)
      .eq("status", "accepted"),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id)
      .eq("status", "accepted"),
  ]);

  const postsCount = postsQ.count ?? 0;
  const wantsCount = wantsQ.count ?? 0;
  const followersCount = followersQ.count ?? 0;
  const followingCount = followingQ.count ?? 0;

  // earliestKey
  let earliestKey: string | null = null;
  {
    const [earliestVisitedQ, earliestCreatedQ] = await Promise.all([
      supabase
        .from("posts")
        .select("visited_on")
        .eq("user_id", user.id)
        .not("visited_on", "is", null)
        .order("visited_on", { ascending: true })
        .limit(1),
      supabase
        .from("posts")
        .select("created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

    const v = (earliestVisitedQ.data ?? [])[0]?.visited_on
      ? String((earliestVisitedQ.data ?? [])[0].visited_on)
      : null;
    const cIso = (earliestCreatedQ.data ?? [])[0]?.created_at
      ? String((earliestCreatedQ.data ?? [])[0].created_at)
      : null;
    const c = cIso ? formatJstYmdFromIso(cIso) : null;

    if (v && c) earliestKey = v < c ? v : c;
    else earliestKey = v ?? c ?? null;
  }

  // heatmapDays (1 year)
  let heatmapDays: HeatmapDay[] = [];
  {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const today = new Date();
    const todayJst = dtf.format(today);
    const startJst = dtf.format(
      new Date(today.getTime() - 364 * 24 * 60 * 60 * 1000)
    );

    const startIso = new Date(
      Date.now() - 364 * 24 * 60 * 60 * 1000
    ).toISOString();
    const endIso = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();

    const { data: withVisited } = await supabase
      .from("posts")
      .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
      .eq("user_id", user.id)
      .not("visited_on", "is", null)
      .gte("visited_on", startJst)
      .lte("visited_on", todayJst)
      .limit(2000);

    const { data: noVisited } = await supabase
      .from("posts")
      .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
      .eq("user_id", user.id)
      .is("visited_on", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(2000);

    const rows = new Map<string, any>();
    for (const r of withVisited ?? []) rows.set(String(r.id), r);
    for (const r of noVisited ?? []) rows.set(String(r.id), r);

    type DayPost = { id: string; thumbUrl: string | null; score: number | null };
    type DayAcc = { date: string; count: number; maxScore: number | null; posts: DayPost[] };
    const dayMap = new Map<string, DayAcc>();

    const getThumbUrlFromPostRow = (r: any): string | null => {
      const v = r?.image_variants;
      if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string")
        return v[0].thumb;
      const urls = r?.image_urls;
      if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string")
        return urls[0];
      return null;
    };

    for (const r of rows.values()) {
      const dateKey = getRepresentativeDayKey(r);
      if (dateKey < startJst || dateKey > todayJst) continue;

      const sRaw = (r as any)?.recommend_score;
      const score =
        typeof sRaw === "number"
          ? Number.isFinite(sRaw)
            ? sRaw
            : null
          : typeof sRaw === "string"
          ? Number.isFinite(Number(sRaw))
            ? Number(sRaw)
            : null
          : null;

      const cur: DayAcc = dayMap.get(dateKey) ?? {
        date: dateKey,
        count: 0,
        maxScore: null,
        posts: [],
      };

      cur.count += 1;
      if (score !== null)
        cur.maxScore = cur.maxScore === null ? score : Math.max(cur.maxScore, score);
      cur.posts.push({ id: String(r.id), thumbUrl: getThumbUrlFromPostRow(r), score });

      dayMap.set(dateKey, cur);
    }

    heatmapDays = Array.from(dayMap.values())
      .map((d) => {
        const sorted = d.posts
          .slice()
          .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
        const top3 = sorted.slice(0, 3).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl }));
        return { date: d.date, count: d.count, maxScore: d.maxScore, posts: top3 };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  const initialLetter = displayName.slice(0, 1).toUpperCase();

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="w-full overflow-x-hidden pb-24 pt-6">
        <div className="flex w-full flex-col gap-6 md:mx-auto md:max-w-4xl md:px-6">
          {/* ========================= PROFILE ========================= */}
          <section className="w-full overflow-hidden rounded-2xl border border-orange-100 bg-white/95 shadow-sm">
            <div className="px-4 py-5 md:px-6 md:py-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="shrink-0">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="avatar"
                        className="h-20 w-20 rounded-full border border-black/[.08] bg-orange-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-black/[.08] bg-orange-100 text-2xl font-bold text-orange-700">
                        {initialLetter}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h1 className="text-[20px] font-bold leading-tight tracking-tight text-slate-900 md:text-2xl">
                      {displayName}
                    </h1>

                    {username ? (
                      <p className="mt-0.5 text-sm font-semibold text-slate-500">
                        @{username}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
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

                      {joinedLabel ? (
                        <>
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <span>{joinedLabel} から利用</span>
                        </>
                      ) : null}
                    </div>

                    {/* SNS chips */}
                    {(instagram || x) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <SnsChip kind="instagram" handle={instagram} />
                        <SnsChip kind="x" handle={x} />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
                  <Link
                    href="/profile/edit"
                    className={[
                      "inline-flex w-full items-center justify-center rounded-xl",
                      "border border-black/[.08] bg-white px-4 py-2",
                      "text-sm font-semibold text-slate-700 hover:bg-slate-50",
                      "transition focus:outline-none focus:ring-4 focus:ring-orange-200/40",
                      "md:w-auto md:text-xs md:py-2",
                    ].join(" ")}
                  >
                    プロフィールを編集
                  </Link>
                </div>
              </div>

              {bio ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {bio}
                </p>
              ) : null}

              <ul className="mt-4 flex flex-wrap gap-6 text-sm text-slate-700">
                <li className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900">{postsCount}</span>
                  <span>投稿</span>
                </li>

                <li className="flex items-center gap-1.5">
                  <Link
                    href={`/u/${user.id}/following`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <span className="font-semibold text-slate-900">{followingCount}</span>
                    <span>フォロー中</span>
                  </Link>
                </li>

                <li className="flex items-center gap-1.5">
                  <Link
                    href={`/u/${user.id}/followers`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
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

          {/* ========================= HEATMAP ========================= */}
<Suspense
  fallback={
    <section className="w-full rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm">
      <div className="h-5 w-32 rounded bg-slate-100" />
      <div className="mt-3 h-32 rounded border border-black/[.06] bg-white" />
    </section>
  }
>
  <section className="w-full overflow-hidden rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm md:p-5">
    <VisitHeatmap userId={user.id} days={heatmapDays} earliestKey={earliestKey} />
  </section>
</Suspense>


          {/* ========================= POSTS (ALBUM) ========================= */}
          <section className="w-full rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                投稿
              </h2>


            </div>

            <Suspense
              fallback={
                <div className="rounded-xl border border-black/[.06] bg-white p-8 text-center text-xs text-slate-600 md:text-sm">
                  投稿を読み込み中...
                </div>
              }
            >
              <AlbumBlock userId={user.id} viewerId={user.id} isOwner={true} />
            </Suspense>
          </section>
        </div>
      </div>
    </main>
  );
}
