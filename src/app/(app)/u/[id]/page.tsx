import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FollowButton from "@/components/FollowButton";

export const dynamic = "force-dynamic";

export default async function UserPublicPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // ログイン必須のまま（公開にしたいならこの2行を削除）
  const { data: { user: me } } = await supabase.auth.getUser();
  if (!me) redirect("/auth/login");

  const userId = params.id;

  // プロフィール取得
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return notFound();

  // 統計（投稿/フォロワー/フォロー中/行きたい件数）
  const [
    { count: postsCount = 0 },
    { count: followersCount = 0 },
    { count: followingCount = 0 },
    { count: wantsCount = 0 },
  ] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
    supabase.from("post_wants").select("*", { count: "exact", head: true }).eq("user_id", userId),
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

  // 投稿（グリッド用）
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, image_urls, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(24);

  // 行きたい！リスト（グリッド用）
  const { data: wantRows } = await supabase
    .from("post_wants")
    .select("post_id")
    .eq("user_id", userId);

  let wantPosts: any[] = [];
  if (wantRows && wantRows.length) {
    const ids = wantRows.map((r) => r.post_id);
    const { data } = await supabase
      .from("posts")
      .select("id, title, image_urls, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(24);
    wantPosts = data ?? [];
  }

  const display = profile.display_name || "ユーザー";
  const avatar = profile.avatar_url;
  const handle = profile.username ? `@${profile.username}` : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Instagram風ヘッダー */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* Avatar */}
        <div className="flex items-center justify-center">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="h-28 w-28 md:h-36 md:w-36 rounded-full object-cover border"
            />
          ) : (
            <div className="h-28 w-28 md:h-36 md:w-36 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold">
              {(display || "U").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="md:col-span-2 space-y-4">
          {/* 1行目: ハンドル/表示名 + フォローボタン */}
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-semibold">
              {profile.username ?? display}
            </h1>
            {me.id === userId ? (
              <span className="text-sm text-black/60">(あなたの公開プロフィール)</span>
            ) : (
              <FollowButton
                targetUserId={profile.id}
                targetUsername={profile.username}
                initiallyFollowing={initiallyFollowing}
              />
            )}
          </div>

          {/* 2行目: 統計 */}
          <ul className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <li><span className="font-semibold">{postsCount}</span> 投稿</li>
            <li>
              <Link href={`/u/${userId}/followers`} className="hover:underline">
                <span className="font-semibold">{followersCount}</span> フォロワー
              </Link>
            </li>
            <li>
              <Link href={`/u/${userId}/following`} className="hover:underline">
                <span className="font-semibold">{followingCount}</span> フォロー中
              </Link>
            </li>
            <li><span className="font-semibold">{wantsCount}</span> 行きたい</li>
          </ul>

          {/* 3行目: 表示名 + Bio + ハンドル */}
          <div className="space-y-1">
            <p className="font-semibold">{display}</p>
            {profile.bio && (
              <p className="text-sm text-black/70 whitespace-pre-wrap">
                {profile.bio}
              </p>
            )}
            {handle && <p className="text-sm text-black/60">{handle}</p>}
          </div>
        </div>
      </section>

      {/* 投稿グリッド */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">投稿</h2>
        {posts && posts.length ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[2px]">
            {posts!.map((p) => {
              const thumb = p.image_urls?.[0] ?? null;
              return (
                <a
                  key={p.id}
                  href={`/posts/${p.id}`}
                  className="block aspect-square overflow-hidden bg-gray-100"
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={p.title ?? ""}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-gray-600 p-2 text-center">
                      {p.title}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white p-8 text-center text-black/70">
            投稿はまだありません。
          </div>
        )}
      </section>

      {/* 行きたい！リスト */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">行きたい店リスト</h2>
        {wantPosts.length ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[2px]">
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
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-orange-900/80 p-2 text-center">
                      {p.title}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white p-8 text-center text-black/70">
            まだ登録がありません。
          </div>
        )}
      </section>
    </main>
  );
}
