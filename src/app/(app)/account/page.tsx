import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Images } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = createClient();

  // 認証
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // プロフィール
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, username")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl = profile?.avatar_url ?? "";
  const username = profile?.username ?? "";

  // 統計
  const [{ count: postsCount = 0 }, { count: wantsCount = 0 }] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("post_wants").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  let followersCount = 0, followingCount = 0;
  {
    const followers = await supabase
      .from("follows").select("*", { count: "exact", head: true })
      .eq("followee_id", user.id);
    if (!followers.error && typeof followers.count === "number") followersCount = followers.count;

    const following = await supabase
      .from("follows").select("*", { count: "exact", head: true })
      .eq("follower_id", user.id);
    if (!following.error && typeof following.count === "number") followingCount = following.count;
  }

  // 投稿
  const { data: posts } = await supabase
    .from("posts")
    .select("id,image_urls,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(24);

  // 行きたい！リスト
  const { data: wantRows } = await supabase
    .from("post_wants").select("post_id").eq("user_id", user.id);

  let wantPosts: any[] = [];
  if (wantRows?.length) {
    const ids = wantRows.map((r) => r.post_id);
    const { data } = await supabase
      .from("posts")
      .select("id,image_urls,created_at")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(24);
    wantPosts = data ?? [];
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* ヘッダー */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        <div className="flex items-center justify-center">
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar"
              className="h-28 w-28 md:h-36 md:w-36 rounded-full object-cover border" />
          ) : (
            <div className="h-28 w-28 md:h-36 md:w-36 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-semibold">
              {username || displayName}
            </h1>
            <Link href="/account/edit"
              className="rounded-lg border px-4 py-1.5 text-sm font-medium hover:bg-black/5">
              プロフィールを編集
            </Link>
          </div>

          <ul className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <li><span className="font-semibold">{postsCount}</span> 投稿</li>
            <li><span className="font-semibold">{followersCount}</span> フォロワー</li>
            <li><span className="font-semibold">{followingCount}</span> フォロー中</li>
            <li><span className="font-semibold">{wantsCount}</span> 行きたい</li>
          </ul>

          <div className="space-y-1">
            <p className="font-semibold">{displayName}</p>
            {bio && <p className="text-sm text-black/70 whitespace-pre-wrap">{bio}</p>}
          </div>

          {username && (
            <p className="text-sm text-black/60">
              <a className="underline" href={`/u/${username}`}>@{username}</a>
            </p>
          )}
        </div>
      </section>

      {/* 投稿グリッド */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">投稿</h2>
          <Link href="/posts/new"
            className="rounded-full bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800">
            Post
          </Link>
        </div>
        {posts?.length ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[2px] sm:gap-[3px]">
            {posts.map((p) => {
              const first = p.image_urls?.[0] ?? null;
        return (
          <a key={p.id} href={`/posts/${p.id}`} className="relative block group bg-white">
            {first ? (
              <>
                <img
                  src={first}
                  alt=""
                  className="aspect-square w-full object-cover group-hover:opacity-95"
                />
                {p.image_urls?.length > 1 && (
                  <Images
                    size={16}
                    className="absolute top-1 right-1 text-white drop-shadow"
                  />
                )}
              </>
            ) : (
              <div className="aspect-square flex items-center justify-center bg-gray-100 text-xs text-gray-600" />
            )}
          </a>
        );


            })}
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-8 text-center text-black/70">
            まだ投稿がありません。
          </div>
        )}
      </section>

      {/* 行きたい！リスト */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">行きたい！</h2>
        {wantPosts.length ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-[2px] sm:gap-[3px]">
            {wantPosts.map((p) => {
              const first = p.image_urls?.[0] ?? null;
              return (
                <a key={p.id} href={`/posts/${p.id}`} className="relative block group bg-white">
                  {first ? (
                    <>
                      <img src={first} alt={p.title ?? ""}
                        className="aspect-square w-full object-cover group-hover:opacity-95" />
                      {p.image_urls?.length > 1 && (
                        <Images size={16}
                          className="absolute top-1 right-1 text-white drop-shadow" />
                      )}
                    </>
                  ) : (
                    <div className="aspect-square flex items-center justify-center bg-orange-50 text-xs text-orange-900/80">
                      {p.title}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-8 text-center text-black/70">
            まだ「行きたい！」はありません。
          </div>
        )}
      </section>
    </main>
  );
}
