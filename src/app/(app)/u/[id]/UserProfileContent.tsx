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

  return (
    <main className="min-h-screen bg-white dark:bg-transparent text-slate-800 dark:text-gray-200">
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-24">

        {/* ========================= AVATAR + NAME + ACTIONS ========================= */}
        <div className="flex items-start gap-4">
          {/* Avatar with brand gradient ring */}
          <div
            className="shrink-0"
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
                className="h-24 w-24 rounded-full border-2 border-white dark:border-[#0b0c0f] bg-orange-100 dark:bg-orange-900/30 object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white dark:border-[#0b0c0f] bg-orange-100 dark:bg-orange-900/30 text-2xl font-bold text-orange-700 dark:text-orange-400">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {/* Name row: displayName + follow button + bell */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-gray-100 md:text-2xl">
                {displayName}
              </h1>
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

            {/* Username + "follows you" badge */}
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {username ? (
                <p className="text-xs font-medium text-slate-500 dark:text-gray-500 md:text-sm">@{username}</p>
              ) : null}
              {isFollowing ? (
                <p className="rounded-full bg-gradient-to-r from-teal-500/10 to-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-gray-400 md:text-xs">
                  {t("followsYou")}
                </p>
              ) : null}
            </div>

            {/* Public/Private indicator */}
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

            {initiallyRequested ? (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-500">{t("pendingNotifyHint")}</p>
            ) : null}
          </div>
        </div>

        {/* ========================= STATS ========================= */}
        <div className="flex items-center gap-4 mt-4 text-[13px]">
          <span><strong className="font-extrabold text-slate-900 dark:text-gray-100">{postsCount}</strong> <span className="text-slate-500 dark:text-gray-500">{t("posts")}</span></span>
          <Link href={`/u/${username || userId}/following`} className="hover:opacity-70 transition">
            <strong className="font-extrabold text-slate-900 dark:text-gray-100">{followingCount}</strong> <span className="text-slate-500 dark:text-gray-500">{t("following")}</span>
          </Link>
          <Link href={`/u/${username || userId}/followers`} className="hover:opacity-70 transition">
            <strong className="font-extrabold text-slate-900 dark:text-gray-100">{followersCount}</strong> <span className="text-slate-500 dark:text-gray-500">{t("followers")}</span>
          </Link>
          <span><strong className="font-extrabold text-slate-900 dark:text-gray-100">{wantsCount}</strong> <span className="text-slate-500 dark:text-gray-500">{t("wants")}</span></span>
        </div>

        {/* ========================= BIO ========================= */}
        {bio ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-gray-200">{bio}</p>
        ) : null}

        <div className="gm-brand-line mt-6" />

        {/* ========================= HEATMAP ========================= */}
        <section className="mt-6">
          {canViewPosts ? (
            <VisitHeatmap userId={userId} days={heatmapDays} earliestKey={earliestKey} />
          ) : (
            <>
              <h2 className="text-sm font-bold text-slate-900 dark:text-gray-100">{t("visitLog")}</h2>
              <p className="mt-3 text-center text-xs text-slate-500 dark:text-gray-500 py-8">
                {t("followersOnlyPosts")}
              </p>
            </>
          )}
        </section>

        <div className="gm-brand-line mt-6" />

        {/* ========================= POSTS ========================= */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-gray-100">{t("postsHeading")}</h2>
          {!canViewPosts ? (
            <p className="text-center text-xs text-slate-500 dark:text-gray-500 py-8">
              {t("followersOnlyPosts")}
            </p>
          ) : (
            <AlbumBrowser posts={albumPosts} pinnedPostIdsInitial={pinnedPostIds} isOwner={false} />
          )}
        </section>

      </div>
    </main>
  );
}
