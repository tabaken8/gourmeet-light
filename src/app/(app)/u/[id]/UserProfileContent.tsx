"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Globe2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import FollowButton from "@/components/FollowButton";
import PostNotifyBellButton from "@/components/PostNotifyBellButton";
import VisitHeatmap from "@/components/VisitHeatmap";
import AlbumBrowser from "@/components/AlbumBrowser";
import {
  queryKeys,
  fetchUserPublicProfile,
  fetchUserPublicPosts,
} from "@/lib/queries";

type Props = {
  userId: string;
  initiallyFollowing: boolean;
  initiallyRequested: boolean;
  isFollowing: boolean;
  initialBellEnabled: boolean;
  canViewPosts: boolean;
};

export default function UserProfileContent({
  userId,
  initiallyFollowing,
  initiallyRequested,
  isFollowing,
  initialBellEnabled,
  canViewPosts,
}: Props) {
  const t = useTranslations("profile");
  // キャッシュから即返す（初回はサーバーが setQueryData で入れた値）
  const { data: profileData } = useQuery({
    queryKey: queryKeys.userPublicProfile(userId),
    queryFn: () => fetchUserPublicProfile(userId),
  });

  const { data: postsData } = useQuery({
    queryKey: queryKeys.userPublicPosts(userId),
    queryFn: () => fetchUserPublicPosts(userId),
    enabled: canViewPosts,
  });

  const profile = profileData?.profile;
  const counts = profileData?.counts;
  const displayName = profile?.display_name || t("user");
  const username = profile?.username || "";
  const bio = profile?.bio || "";
  const avatarUrl = profile?.avatar_url || "";
  const isPublic = profile?.is_public ?? true;

  const postsCount = counts?.posts_count ?? 0;
  const wantsCount = counts?.wants_count ?? 0;
  const followersCount = counts?.followers_count ?? 0;
  const followingCount = counts?.following_count ?? 0;

  const heatmapDays = postsData?.heatmapDays ?? [];
  const earliestKey = postsData?.earliestKey ?? null;
  const albumPosts = postsData?.albumPosts ?? [];
  const pinnedPostIds = postsData?.pinnedPostIds ?? [];

  const cardClass = "w-full overflow-hidden rounded-2xl border border-black/[.06] dark:border-white/[.08] bg-white/95 dark:bg-[#16181e] shadow-sm";
  const cardPad = "px-4 py-5 md:px-6 md:py-6";

  return (
    <main className="min-h-screen bg-orange-50 dark:bg-transparent text-slate-800 dark:text-gray-200">
      <div className="w-full overflow-x-hidden pb-24 pt-6">
        <div className="flex w-full flex-col gap-6 md:mx-auto md:max-w-4xl md:px-6">

          {/* ========================= PROFILE CARD ========================= */}
          <section className={cardClass}>
            <div className={cardPad}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="shrink-0">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="avatar"
                        className="h-20 w-20 rounded-full border border-black/[.06] dark:border-white/10 bg-orange-100 dark:bg-orange-900/30 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-black/[.06] dark:border-white/10 bg-orange-100 dark:bg-orange-900/30 text-2xl font-bold text-orange-700 dark:text-orange-400">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-gray-100 md:text-2xl">
                      {displayName}
                    </h1>

                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {username ? (
                        <p className="text-xs font-medium text-slate-500 dark:text-gray-500 md:text-sm">@{username}</p>
                      ) : null}
                      {isFollowing ? (
                        <p className="rounded-full bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-gray-400 md:text-xs">
                          {t("followsYou")}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-gray-500 md:text-xs">
                      {isPublic ? (
                        <>
                          <Globe2 size={14} />
                          <span>{t("publicProfile")}</span>
                        </>
                      ) : (
                        <>
                          <Lock size={14} />
                          <span>{t("privateProfile")}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
                  <div className="flex items-center justify-end gap-2">
                    {profile ? (
                      <FollowButton
                        targetUserId={profile.id}
                        targetUsername={profile.username}
                        initiallyFollowing={initiallyFollowing}
                        initiallyRequested={initiallyRequested}
                      />
                    ) : null}
                    <PostNotifyBellButton
                      targetUserId={userId}
                      canToggle={initiallyFollowing}
                      initiallyEnabled={initialBellEnabled}
                    />
                  </div>
                  {initiallyRequested ? (
                    <p className="text-[11px] text-slate-500 dark:text-gray-500">{t("pendingNotifyHint")}</p>
                  ) : null}
                </div>
              </div>

              {bio ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-gray-200">{bio}</p>
              ) : null}

              <ul className="mt-4 flex flex-wrap gap-6 text-xs text-slate-700 dark:text-gray-400 md:text-sm">
                <li className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 dark:text-gray-100">{postsCount}</span>
                  <span>{t("posts")}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Link
                    href={`/u/${username || userId}/following`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <span className="font-semibold text-slate-900 dark:text-gray-100">{followingCount}</span>
                    <span>{t("following")}</span>
                  </Link>
                </li>
                <li className="flex items-center gap-1.5">
                  <Link
                    href={`/u/${username || userId}/followers`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <span className="font-semibold text-slate-900 dark:text-gray-100">{followersCount}</span>
                    <span>{t("followers")}</span>
                  </Link>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 dark:text-gray-100">{wantsCount}</span>
                  <span>{t("wants")}</span>
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
              <h2 className="text-sm font-semibold text-slate-900 dark:text-gray-100 md:text-base">{t("visitLog")}</h2>
              <div className="mt-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-white dark:bg-white/[.04] p-8 text-center text-xs text-slate-600 dark:text-gray-500 md:text-sm">
                {t("followersOnlyPosts")}
              </div>
            </section>
          )}

          {/* ========================= ALBUM CARD ========================= */}
          <section className={[cardClass, "p-4 md:p-5"].join(" ")}>
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-gray-100 md:text-base">{t("postsHeading")}</h2>
            {!canViewPosts ? (
              <div className="rounded-xl border border-black/[.06] dark:border-white/[.08] bg-white dark:bg-white/[.04] p-8 text-center text-xs text-slate-600 dark:text-gray-500 md:text-sm">
                {t("followersOnlyPosts")}
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
