// src/app/(app)/u/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FollowButton from "@/components/FollowButton";
import { Images, Globe2, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function UserPublicPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // ログイン必須
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (!me) redirect("/auth/login");

  const userId = params.id;

  // 自分のページなら /account に飛ばす
  if (userId === me.id) {
    redirect("/account");
  }

  // プロフィール取得
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, bio, avatar_url, is_public, header_image_url"
    )
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

  // 🔥 相手 → 自分（フォローされているか）
  let isFollowing = false;
  const { data: reverseRel } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", userId) // 相手
    .eq("followee_id", me.id) // 自分
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
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
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
    supabase
      .from("post_wants")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  // 投稿閲覧権限
  const canViewPosts = isPublic || me.id === userId || initiallyFollowing;

  // 投稿取得
  let posts: any[] = [];
  if (canViewPosts) {
    const { data } = await supabase
      .from("posts")
      .select("id, image_urls, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(24);
    posts = data ?? [];
  }

  // 行きたいリスト
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
        .select("id, image_urls, created_at")
        .in("id", ids)
        .order("created_at", { ascending: false })
        .limit(24);
      wantPosts = data ?? [];
    }
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
                <img
                  src={headerImageUrl}
                  alt="header"
                  className="h-full w-full object-cover"
                />
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
                {/* 左側：アイコン & 名前 */}
                <div className="flex items-center gap-4 md:gap-5">
                  <div className="relative z-10 shrink-0">
                    {avatarUrl ? (
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

                    {/* @username */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {username && (
                        <p className="text-xs font-medium text-slate-500 md:text-sm">
                          @{username}
                        </p>
                      )}

                      {/* 相手 → 自分 */}
                      {isFollowing && (
                        <p className="text-[10px] md:text-xs text-slate-500 font-medium bg-orange-50 px-2 py-0.5 rounded-full">
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

                {/* 右側：フォローボタン */}
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
                  <span className="font-semibold text-slate-900">
                    {postsCount}
                  </span>
                  <span>投稿</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Link
                    href={`/u/${userId}/following`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <span className="font-semibold text-slate-900">
                      {followingCount}
                    </span>
                    <span>フォロー中</span>
                  </Link>
                </li>
                <li className="flex items-center gap-1.5">
                  <Link
                    href={`/u/${userId}/followers`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <span className="font-semibold text-slate-900">
                      {followersCount}
                    </span>
                    <span>フォロワー</span>
                  </Link>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900">
                    {wantsCount}
                  </span>
                  <span>行きたい</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 投稿 */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 md:text-base">
            投稿
          </h2>

          {!canViewPosts ? (
            <div className="rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
              このアカウントの投稿はフォロワーのみが閲覧できます。
            </div>
          ) : posts.length ? (
            <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4 sm:gap-[3px] md:grid-cols-5">
              {posts.map((p) => {
                const thumb = p.image_urls?.[0] ?? null;
                return (
                  <a
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="group relative block aspect-square overflow-hidden bg-slate-100"
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        className="h-full w-full object-cover transition group-hover:opacity-95"
                        alt=""
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"></div>
                    )}
                    {p.image_urls?.length > 1 && (
                      <Images
                        size={16}
                        className="absolute right-1 top-1 text-white drop-shadow"
                      />
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
                const thumb = p.image_urls?.[0] ?? null;
                return (
                  <a
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="group relative block aspect-square overflow-hidden bg-orange-50"
                  >
                    {thumb ? (
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

                    {p.image_urls?.length > 1 && (
                      <Images
                        size={16}
                        className="absolute right-1 top-1 text-white drop-shadow"
                      />
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
