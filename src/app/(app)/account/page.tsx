import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Images } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = createClient();

  // 認証
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // プロフィール
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, username")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl = profile?.avatar_url ?? "";
  const username = profile?.username ?? "";

  // 統計
  const [{ count: postsCount = 0 }, { count: wantsCount = 0 }] =
    await Promise.all([
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("post_wants")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

  let followersCount = 0,
    followingCount = 0;
  {
    const followers = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", user.id);
    if (!followers.error && typeof followers.count === "number")
      followersCount = followers.count;

    const following = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id);
    if (!following.error && typeof following.count === "number")
      followingCount = following.count;
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
    .from("post_wants")
    .select("post_id")
    .eq("user_id", user.id);

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
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6">
        {/* ヘッダー */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-5 shadow-sm backdrop-blur md:p-6">
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
            {/* Avatar */}
            <div className="flex items-center justify-center">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="h-28 w-28 rounded-full border border-orange-100 object-cover shadow-sm md:h-36 md:w-36"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-orange-100 text-3xl font-bold text-orange-700 ring-1 ring-orange-200 shadow-sm md:h-36 md:w-36">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            {/* Profile info */}
            <div className="md:col-span-2 space-y-4">
              {/* 名前 + 編集ボタン */}
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
                  {username || displayName}
                </h1>
                <Link
                  href="/account/edit"
                  className="inline-flex items-center rounded-full border border-orange-100 bg-orange-50/60 px-4 py-1.5 text-xs font-medium text-slate-700 transition hover:border-orange-300 hover:bg-orange-100"
                >
                  プロフィールを編集
                </Link>
              </div>

              {/* 統計 */}
              <ul className="flex flex-wrap gap-3 text-xs text-slate-700 md:text-sm">
                <li className="rounded-full bg-orange-50 px-3 py-1">
                  <span className="font-semibold text-slate-900">
                    {postsCount}
                  </span>{" "}
                  投稿
                </li>
                <li className="rounded-full bg-orange-50 px-3 py-1">
                  <Link
                    href={`/u/${user.id}/followers`}
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
                    href={`/u/${user.id}/following`}
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

              {/* 表示名 + Bio + ハンドル */}
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-slate-900">{displayName}</p>
                {bio && (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 md:text-sm">
                    {bio}
                  </p>
                )}
                {username && (
                  <p className="text-xs text-slate-500 md:text-sm">
                    <a
                      className="underline"
                      href={`/u/${username}`}
                    >{`@${username}`}</a>
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 投稿グリッド */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 md:text-base">
              投稿
            </h2>
            <Link
              href="/posts/new"
              className="inline-flex h-9 items-center rounded-full bg-orange-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700"
            >
              Post
            </Link>
          </div>
          {posts?.length ? (
            <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4 sm:gap-[3px] md:grid-cols-5">
              {posts.map((p) => {
                const first = p.image_urls?.[0] ?? null;
                return (
                  <a
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="group relative block bg-slate-100"
                  >
                    {first ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={first}
                          alt=""
                          className="aspect-square w-full object-cover transition group-hover:opacity-95"
                        />
                        {p.image_urls?.length > 1 && (
                          <Images
                            size={16}
                            className="absolute right-1 top-1 text-white drop-shadow"
                          />
                        )}
                      </>
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-orange-50 text-[10px] text-orange-900/70" />
                    )}
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
              まだ投稿がありません。
            </div>
          )}
        </section>

        {/* 行きたい！リスト */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 md:text-base">
            行きたい！
          </h2>
          {wantPosts.length ? (
            <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4 sm:gap-[3px] md:grid-cols-5">
              {wantPosts.map((p) => {
                const first = p.image_urls?.[0] ?? null;
                return (
                  <a
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="group relative block bg-slate-100"
                  >
                    {first ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={first}
                          alt={p.title ?? ""}
                          className="aspect-square w-full object-cover transition group-hover:opacity-95"
                        />
                        {p.image_urls?.length > 1 && (
                          <Images
                            size={16}
                            className="absolute right-1 top-1 text-white drop-shadow"
                          />
                        )}
                      </>
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-orange-50 text-[10px] text-orange-900/80">
                        {p.title}
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
              まだ「行きたい！」はありません。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
