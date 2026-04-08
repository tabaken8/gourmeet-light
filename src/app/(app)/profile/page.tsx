// src/app/(app)/profile/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Globe2, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";

import VisitHeatmap, { type HeatmapDay } from "@/components/VisitHeatmap";
import AlbumBlock from "./parts/AlbumBlock";

import InstagramIcon from "@/components/icons/InstagramIcon";
import XIcon from "@/components/icons/XIcon";
import { subtractDaysKeyJST } from "@/lib/queries";

export const dynamic = "force-dynamic";

// ---- utils ----
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
  ariaLabel,
}: {
  kind: "instagram" | "x";
  handle: string;
  ariaLabel: string;
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
      <XIcon className="h-4 w-4 text-slate-900 dark:text-gray-100" />
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
        "dark:border-white/10 dark:bg-white/[.06] dark:text-gray-300",
        "dark:hover:border-white/15 dark:hover:bg-white/10",
      ].join(" ")}
      aria-label={ariaLabel}
    >
      <span className="grid h-6 w-6 place-items-center">{Icon}</span>
      <span className="text-slate-400 dark:text-gray-500">@</span>
      <span className="tracking-tight text-slate-900 dark:text-gray-100">{h}</span>
    </a>
  );
}

export default async function AccountPage() {
  const t = await getTranslations("profile");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { startKey: startJstKey, startIsoUtc, todayKey: todayJstKey } = subtractDaysKeyJST(364);

  // 全部1発で並列取得
  const [profileRes, countsRes, earliestRes, heatmapRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, bio, avatar_url, username, is_public, instagram_username, x_username"
      )
      .eq("id", user.id)
      .single(),
    supabase.rpc("get_profile_counts", { p_user_id: user.id }),
    supabase.rpc("get_earliest_post_key", { p_user_id: user.id }),
    supabase.rpc("get_heatmap_days", {
      p_user_id: user.id,
      p_start_jst: startJstKey,
      p_today_jst: todayJstKey,
      p_start_iso: startIsoUtc,
      p_end_iso: new Date(Date.now() + 86400000).toISOString(),
    }),
  ]);

  const profile = profileRes.data;
  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl =
    profile?.avatar_url ?? ((user.user_metadata as any)?.avatar_url ?? "") ?? "";
  const username = profile?.username ?? "";
  const isPublic = profile?.is_public ?? true;
  const instagram = cleanHandle((profile as any)?.instagram_username ?? "");
  const x = cleanHandle((profile as any)?.x_username ?? "");
  const joinedLabel = joinLabelFromCreatedAt(user.created_at);

  const postsCount = countsRes.data?.posts_count ?? 0;
  const wantsCount = countsRes.data?.wants_count ?? 0;
  const followersCount = countsRes.data?.followers_count ?? 0;
  const followingCount = countsRes.data?.following_count ?? 0;

  const earliestKey = (earliestRes.data as string | null) ?? null;
  const heatmapDays = (heatmapRes.data ?? []) as HeatmapDay[];

  const initialLetter = displayName.slice(0, 1).toUpperCase();

  return (
    <main className="min-h-screen bg-white text-slate-800 dark:bg-transparent dark:text-gray-200">
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">

        {/* ========================= AVATAR + NAME + USERNAME ========================= */}
        <div className="flex items-start gap-4">
          {/* Gradient-ring avatar */}
          <div className="shrink-0">
            <div
              style={{
                background: "linear-gradient(135deg, #1DB9A0, #6BAA44, #C8882A, #D06A28)",
                padding: "2.5px",
                borderRadius: "9999px",
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="h-24 w-24 rounded-full border-[3px] border-white bg-orange-100 object-cover dark:border-[#16181e] dark:bg-orange-900/30"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-white bg-orange-100 text-2xl font-bold text-orange-700 dark:border-[#16181e] dark:bg-orange-900/30 dark:text-orange-400">
                  {initialLetter}
                </div>
              )}
            </div>
          </div>

          {/* Name + username + follow status */}
          <div className="min-w-0 pt-2">
            <h1 className="text-xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-gray-100">
              {displayName}
            </h1>

            {username ? (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-gray-500">
                @{username}
              </p>
            ) : null}
          </div>
        </div>

        {/* ========================= STATS ========================= */}
        <div className="flex items-center gap-4 mt-4 text-[13px]">
          <span><strong className="font-extrabold text-slate-900 dark:text-gray-100">{postsCount}</strong> <span className="text-slate-500 dark:text-gray-500">{t("posts")}</span></span>
          <Link href={`/u/${username || user.id}/following`} className="hover:opacity-70 transition">
            <strong className="font-extrabold text-slate-900 dark:text-gray-100">{followingCount}</strong> <span className="text-slate-500 dark:text-gray-500">{t("following")}</span>
          </Link>
          <Link href={`/u/${username || user.id}/followers`} className="hover:opacity-70 transition">
            <strong className="font-extrabold text-slate-900 dark:text-gray-100">{followersCount}</strong> <span className="text-slate-500 dark:text-gray-500">{t("followers")}</span>
          </Link>
          <span><strong className="font-extrabold text-slate-900 dark:text-gray-100">{wantsCount}</strong> <span className="text-slate-500 dark:text-gray-500">{t("wants")}</span></span>
        </div>

        {/* ========================= BIO ========================= */}
        {bio ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-gray-200">
            {bio}
          </p>
        ) : null}

        {/* ========================= PUBLIC/PRIVATE + JOIN DATE ========================= */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-gray-500">
          <span className="inline-flex items-center gap-1">
            {isPublic ? (
              <>
                <Globe2 size={12} />
                <span>{t("publicProfile")}</span>
              </>
            ) : (
              <>
                <Lock size={12} />
                <span>{t("privateProfile")}</span>
              </>
            )}
          </span>

          {joinedLabel ? (
            <>
              <span className="h-0.5 w-0.5 rounded-full bg-slate-300 dark:bg-gray-600" />
              <span>{t("memberSince", { date: joinedLabel })}</span>
            </>
          ) : null}
        </div>

        {/* ========================= SNS CHIPS ========================= */}
        {(instagram || x) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <SnsChip kind="instagram" handle={instagram} ariaLabel={t("openSns", { kind: "Instagram" })} />
            <SnsChip kind="x" handle={x} ariaLabel={t("openSns", { kind: "X" })} />
          </div>
        ) : null}

        {/* ========================= EDIT PROFILE BUTTON ========================= */}
        <Link
          href="/profile/edit"
          className={[
            "mt-4 inline-flex w-full items-center justify-center rounded-lg",
            "border border-black/[.08] bg-white px-4 py-2",
            "text-sm font-semibold text-slate-700 hover:bg-slate-50",
            "transition focus:outline-none focus:ring-4 focus:ring-orange-200/40",
            "dark:border-white/10 dark:bg-white/[.06] dark:text-gray-300 dark:hover:bg-white/10",
          ].join(" ")}
        >
          {t("editProfile")}
        </Link>

        {/* ========================= BRAND SEPARATOR ========================= */}
        <div className="gm-brand-line mt-6" />

        {/* ========================= HEATMAP ========================= */}
        <Suspense
          fallback={
            <section className="mt-6">
              <div className="h-5 w-32 rounded bg-slate-100 dark:bg-white/[.06]" />
              <div className="mt-3 h-32 rounded border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-white/[.06]" />
            </section>
          }
        >
          <section className="mt-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 md:text-base dark:text-gray-100">
              <span className="inline-block h-3.5 w-1 rounded-full bg-orange-500" />
              {t("visitLog")}
            </h2>
            <VisitHeatmap userId={user.id} days={heatmapDays} earliestKey={earliestKey} />
          </section>
        </Suspense>

        {/* ========================= BRAND SEPARATOR ========================= */}
        <div className="gm-brand-line mt-6" />

        {/* ========================= POSTS (ALBUM) ========================= */}
        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 md:text-base dark:text-gray-100">
            <span className="inline-block h-3.5 w-1 rounded-full bg-orange-500" />
            {t("postsHeading")}
          </h2>

          <Suspense
            fallback={
              <div className="rounded-xl border border-black/[.06] bg-white p-8 text-center text-xs text-slate-600 md:text-sm dark:border-white/[.08] dark:bg-white/[.06] dark:text-gray-400">
                {t("loadingPosts")}
              </div>
            }
          >
            <AlbumBlock userId={user.id} viewerId={user.id} isOwner={true} />
          </Suspense>
        </section>

      </div>
    </main>
  );
}