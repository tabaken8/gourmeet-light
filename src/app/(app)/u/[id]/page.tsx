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

  // 統計（accepted のみカウント）
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

  // 自分→相手のフォロー状態（accepted / pending）
  let initiallyFollowing = false;
  let initiallyRequested = false;

  if (me && me.id !== userId) {
    const { data: rel, error: relErr } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", me.id)
      .eq("followee_id", userId)
      .maybeSingle();

    if (!relErr && rel) {
      if (rel.status === "accepted") initiallyFollowing = true;
      if (rel.status === "pending") initiallyRequested = true;
    }
  }

  // 投稿
  const { data: posts } = await supabase
    .from("posts")
    .select("id, image_urls, created_at, title")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(24);

  // 行きたい！リスト
  const { data: wantRows } = await supabase
    .from("post_wants")
    .select("post_id")
    .eq("user_id", userId);

  let wantPosts: any[] = [];
  if (wantRows && wantRows.length) {
    const ids = wantRows.map((r) => r.post_id);
    const { data } = await supabase
      .from("posts")
      .select("id, image_urls, created_at, title")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(24);
    wantPosts = data ?? [];
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
              {/* アイコン＋名前行：カバーに少し被せる */}
              <div className="-mt-12 flex justify-between gap-4 md:-mt-14">
                {/* 左：アイコン & テキスト */}
                <div className="flex items-center gap-4 md:gap-5">
                  {/* アイコン（左上） */}
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

                  {/* 名前ブロック：アイコンの右側に配置 */}
                  <div className="pt-4 md:pt-5">
                    {/* 表示名：アイコンの円の下半分くらいの高さ */}
                    <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 md:text-2xl">
                      {displayName}
                    </h1>

                    {username && (
                      <p className="mt-0.5 text-xs font-medium text-slate-500 md:text-sm">
                        @{username}
                      </p>
                    )}

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
                    </div>
                  </div>
                </div>

                {/* 右側：自分ならバッジ、他人ならフォローボタン */}
                {me.id === userId ? (
                  <span className="mt-2 rounded-full bg-orange-50 px-3 py-1 text-xs text-slate-600">
                    あなたのプロフィール
                  </span>
                ) : (
                  <div className="mt-2">
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

        {/* 投稿グリッド */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 md:text-base">
            投稿
          </h2>
          {posts && posts.length ? (
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={p.title ?? ""}
                        className="h-full w-full object-cover transition group-hover:opacity-95"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-slate-500" />
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

        {/* 行きたい！リスト */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 md:text-base">
            行きたい店リスト
          </h2>
          {wantPosts.length ? (
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={p.title ?? ""}
                        className="h-full w-full object-cover transition group-hover:opacity-95"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-orange-900/80">
                        {p.title}
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
