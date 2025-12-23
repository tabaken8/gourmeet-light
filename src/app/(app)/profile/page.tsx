// src/app/(app)/profile/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Images, Globe2, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();;

  // 認証
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // プロフィール
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, bio, avatar_url, username, is_public, header_image_url"
    )
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl = profile?.avatar_url ?? "";
  const username = profile?.username ?? "";
  const isPublic = profile?.is_public ?? true; // null は公開扱い
  const headerImageUrl = profile?.header_image_url ?? null;

  // Joined 表示用
  let joinedLabel: string | null = null;
  if (user.created_at) {
    try {
      joinedLabel = new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "short",
      }).format(new Date(user.created_at));
    } catch {
      joinedLabel = null;
    }
  }

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
      .eq("followee_id", user.id)
      .eq("status", "accepted");
    if (!followers.error && typeof followers.count === "number")
      followersCount = followers.count;

    const following = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id)
      .eq("status", "accepted");
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
      .select("id,image_urls,created_at,title")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(24);
    wantPosts = data ?? [];
  }

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        {/* プロフィールヘッダー（X 風＋カバー画像） */}
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
              {/* ほんのりオレンジ＋暗めのオーバーレイで今の味も残す */}
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
                  {/* アイコン：左上にどん */}
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

                  {/* 名前 / username / 公開状態・Joined */}
                  {/* ← 公開プロフィールの方と同じく pt-4 / md:pt-18 で
                      「アイコンの円の下半分あたり」に表示名が来るように */}
                  <div className="pt-4 md:pt-18">
                    {/* 表示名＝ハンドルネームを一番大きく太字で */}
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl leading-tight">
                      {displayName}
                    </h1>

                    {/* username はその下で小さめ & 薄い */}
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
                      {joinedLabel && (
                        <>
                          <span className="h-1 w-1 rounded-full bg-slate-400" />
                          <span>{joinedLabel} から利用</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 右：編集ボタン */}
                <Link
                  href="/profile/edit"
                  className="mt-2 inline-flex items-center rounded-full border border-orange-200 bg-white/80 px-4 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-orange-400 hover:bg-orange-50"
                >
                  プロフィールを編集
                </Link>
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
                    href={`/u/${user.id}/following`}
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
                    href={`/u/${user.id}/followers`}
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
