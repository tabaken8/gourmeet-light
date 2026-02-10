// src/app/(app)/profile/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Globe2, Lock, Plus } from "lucide-react";

// ✅ 遅延ブロック
import ProfileStatsBlock from "./parts/ProfileStatsBlock";
import HeatmapBlock from "./parts/HeatmapBlock";
import AlbumBlock from "./parts/AlbumBlock";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();

  // 認証
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // ✅ プロフィール（軽い）
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, username, is_public, header_image_url")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl = profile?.avatar_url ?? "";
  const username = profile?.username ?? "";
  const isPublic = profile?.is_public ?? true;
  const headerImageUrl = profile?.header_image_url ?? null;

  // Joined 表示
  let joinedLabel: string | null = null;
  if (user.created_at) {
    try {
      joinedLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short" }).format(
        new Date(user.created_at)
      );
    } catch {
      joinedLabel = null;
    }
  }

  // ✅ カウントは軽いのでここで（並列）
  const [postsQ, wantsQ, followersQ, followingQ] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("post_wants").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", user.id)
      .eq("status", "accepted"),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id)
      .eq("status", "accepted"),
  ]);

  const postsCount = postsQ.count ?? 0;
  const wantsCount = wantsQ.count ?? 0;
  const followersCount = followersQ.count ?? 0;
  const followingCount = followingQ.count ?? 0;

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto w-full max-w-none px-3 py-4 md:max-w-4xl md:px-6 md:py-8">
        <div className="flex flex-col gap-5 md:gap-6">
          {/* プロフィールヘッダー（即表示） */}
          <section className="overflow-hidden rounded-3xl border border-orange-100 bg-white/95 shadow-sm backdrop-blur">
            <div className="relative">
              {/* カバー */}
              <div className="relative z-0 h-28 w-full overflow-hidden bg-gradient-to-r from-orange-300 via-amber-200 to-orange-400 md:h-36">
                {headerImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={headerImageUrl} alt="header" className="h-full w-full object-cover" />
                ) : null}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-900/25 via-orange-500/5 to-transparent" />

                {!isPublic ? (
                  <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    <Lock size={14} />
                    <span>非公開アカウント</span>
                  </div>
                ) : null}
              </div>

              {/* 本文 */}
              <div className="px-4 pb-5 md:px-6 md:pb-6">
                <div className="-mt-9 flex flex-col gap-3 md:-mt-14 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3 md:gap-5">
                    <div className="relative z-10 shrink-0">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt="avatar"
                          className="h-16 w-16 rounded-full border-4 border-white bg-orange-100 object-cover shadow-md md:h-24 md:w-24"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-orange-100 text-xl font-bold text-orange-700 shadow-md md:h-24 md:w-24">
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 md:pt-10">
                      <div className="inline-block rounded-2xl bg-white/70 px-3 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur">
                        <h1 className="text-lg font-bold tracking-tight text-slate-900 md:text-2xl leading-tight">
                          {displayName}
                        </h1>

                        {username ? (
                          <p className="mt-0.5 text-xs font-medium text-slate-500 md:text-sm">@{username}</p>
                        ) : null}

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

                          {joinedLabel ? (
                            <>
                              <span className="h-1 w-1 rounded-full bg-slate-400" />
                              <span>{joinedLabel} から利用</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="md:pt-4">
                    <Link
                      href="/profile/edit"
                      className="inline-flex w-full items-center justify-center rounded-full border border-orange-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-orange-400 hover:bg-orange-50 md:w-auto md:text-xs md:font-medium md:py-1.5"
                    >
                      プロフィールを編集
                    </Link>
                  </div>
                </div>

                {bio ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{bio}</p> : null}

                <ul className="mt-4 flex flex-wrap gap-6 text-xs text-slate-700 md:text-sm">
                  <li className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900">{postsCount}</span>
                    <span>投稿</span>
                  </li>

                  <li className="flex items-center gap-1.5">
                    <Link href={`/u/${user.id}/following`} className="flex items-center gap-1.5 hover:underline">
                      <span className="font-semibold text-slate-900">{followingCount}</span>
                      <span>フォロー中</span>
                    </Link>
                  </li>

                  <li className="flex items-center gap-1.5">
                    <Link href={`/u/${user.id}/followers`} className="flex items-center gap-1.5 hover:underline">
                      <span className="font-semibold text-slate-900">{followersCount}</span>
                      <span>フォロワー</span>
                    </Link>
                  </li>

                  <li className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900">{wantsCount}</span>
                    <span>行きたい</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* ✅ 年間統計：遅延 */}
          {/* <Suspense
            fallback={
              <section className="rounded-3xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
                <div className="h-5 w-40 rounded bg-orange-100/70" />
                <div className="mt-3 h-28 rounded-xl border border-orange-50 bg-orange-50/60" />
              </section>
            }
          > */}
            {/* <ProfileStatsBlock userId={user.id} /> */}
          {/* </Suspense> */}

          {/* ✅ ヒートマップ：遅延 */}
          <Suspense
            fallback={
              <section className="rounded-3xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
                <div className="h-5 w-32 rounded bg-orange-100/70" />
                <div className="mt-3 h-32 rounded-xl border border-orange-50 bg-orange-50/60" />
              </section>
            }
          >
            <HeatmapBlock userId={user.id} />
          </Suspense>

          {/* ✅ 投稿（AlbumBrowser）：遅延
              - スマホだけ左右余白0（端まで）
              - 見出し/ボタンは今まで通り余白あり
           */}
          <section
            className="
              rounded-3xl border border-orange-100 bg-white/95 shadow-sm backdrop-blur
              p-0
              -mx-3 md:mx-0
              overflow-hidden
            "
          >
            {/* ヘッダーは余白あり */}
            <div className="p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 md:text-base">投稿</h2>

                <Link
                  href="/posts/new"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 md:h-9 md:text-xs"
                >
                  <Plus size={16} />
                  Post
                </Link>
              </div>
            </div>

            {/* ✅ Album本体（ここが端まで） */}
            <Suspense
              fallback={
                <div className="px-4 pb-5 md:px-5">
                  <div className="rounded-xl border border-orange-50 bg-orange-50/60 p-8 text-center text-xs text-slate-600 md:text-sm">
                    投稿を読み込み中...
                  </div>
                </div>
              }
            >
              <AlbumBlock userId={user.id} viewerId={user.id} isOwner={true} />
            </Suspense>
          </section>
        </div>
      </div>
    </main>
  );
}
