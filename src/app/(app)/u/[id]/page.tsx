import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FollowButton from "@/components/FollowButton";

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
    .select("id, username, display_name, bio, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return notFound();

  // 統計
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
      .eq("followee_id", userId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId),
    supabase
      .from("post_wants")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  // 自分→相手のフォロー状態
  let initiallyFollowing = false;
  if (me && me.id !== userId) {
    const { count } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", me.id)
      .eq("followee_id", userId);
    initiallyFollowing = (count ?? 0) > 0;
  }

  // 投稿
  const { data: posts } = await supabase
    .from("posts")
    .select("id, image_urls, created_at")
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
      .select("id, image_urls, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(24);
    wantPosts = data ?? [];
  }

  const display = profile.display_name || "ユーザー";
  const avatar = profile.avatar_url;
  const handle = profile.username ? `@${profile.username}` : null;

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6">
        {/* プロフィールカード */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-5 shadow-sm backdrop-blur md:p-6">
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
            {/* Avatar */}
            <div className="flex items-center justify-center">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  className="h-28 w-28 rounded-full border border-orange-100 object-cover shadow-sm md:h-36 md:w-36"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-orange-100 text-3xl font-bold text-orange-700 ring-1 ring-orange-200 shadow-sm md:h-36 md:w-36">
                  {(display || "U").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            {/* Right side */}
            <div className="md:col-span-2 space-y-4">
              {/* 1行目: ハンドル/表示名 + フォローボタン */}
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
                  {profile.username ?? display}
                </h1>
                {me.id === userId ? (
                  <span className="text-xs text-slate-500 md:text-sm">
                    （あなたの公開プロフィール）
                  </span>
                ) : (
                  <FollowButton
                    targetUserId={profile.id}
                    targetUsername={profile.username}
                    initiallyFollowing={initiallyFollowing}
                  />
                )}
              </div>

              {/* 2行目: 統計 */}
              <ul className="flex flex-wrap gap-3 text-xs text-slate-700 md:text-sm">
                <li className="rounded-full bg-orange-50 px-3 py-1">
                  <span className="font-semibold text-slate-900">
                    {postsCount}
                  </span>{" "}
                  投稿
                </li>
                <li className="rounded-full bg-orange-50 px-3 py-1">
                  <Link
                    href={`/u/${userId}/followers`}
                    className="hover:underline"
                  >
                    <span className="font-semibold text-slate-900">
                      {followersCount}
                    </span>{" "}
                    フォロワー
                  </Link>
                </li>
                <li className="rounded-full bg-orange-50 px-3 py-1">
                  <Link
                    href={`/u/${userId}/following`}
                    className="hover:underline"
                  >
                    <span className="font-semibold text-slate-900">
                      {followingCount}
                    </span>{" "}
                    フォロー中
                  </Link>
                </li>
                <li className="rounded-full bg-orange-50 px-3 py-1">
                  <span className="font-semibold text-slate-900">
                    {wantsCount}
                  </span>{" "}
                  行きたい
                </li>
              </ul>

              {/* 3行目: 表示名 + Bio + ハンドル */}
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-slate-900">{display}</p>
                {profile.bio && (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 md:text-sm">
                    {profile.bio}
                  </p>
                )}
                {handle && (
                  <p className="text-xs text-slate-500 md:text-sm">{handle}</p>
                )}
              </div>
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
              {posts!.map((p) => {
                const thumb = p.image_urls?.[0] ?? null;
                return (
                  <a
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="block aspect-square overflow-hidden bg-slate-100"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={""}
                        className="h-full w-full object-cover transition hover:opacity-95"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-slate-500" />
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
                    className="block aspect-square overflow-hidden bg-orange-50"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={p.title ?? ""}
                        className="h-full w-full object-cover transition hover:opacity-95"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-orange-900/80">
                        {p.title}
                      </div>
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
