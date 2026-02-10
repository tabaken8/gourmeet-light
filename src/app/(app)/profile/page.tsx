import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Globe2, Lock, Plus } from "lucide-react";

// ✅ 遅延ブロック（statsは呼ばない）
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
    .select("display_name, bio, avatar_url, username, is_public") // ✅ header_image_url を取らない
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl = profile?.avatar_url ?? "";
  const username = profile?.username ?? "";
  const isPublic = profile?.is_public ?? true;

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
      {/* ✅ 横はみ出し防止 */}
      <div className="w-full overflow-x-hidden pb-24 pt-6">
        {/* ✅ PCだけ中央寄せ。スマホはフル幅 */}
        <div className="flex w-full flex-col gap-6 md:mx-auto md:max-w-4xl md:px-6">
          {/* =========================
              PROFILE (NO HEADER IMAGE)
             ========================= */}
          <section className="w-full overflow-hidden bg-white rounded-none border border-black/[.06] shadow-none">
            <div className="px-4 py-5 md:px-6 md:py-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                {/* left: avatar + name */}
                <div className="flex items-start gap-4 min-w-0">
                  <div className="shrink-0">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="avatar"
                        className="h-20 w-20 rounded-full border border-black/[.06] bg-orange-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-black/[.06] bg-orange-100 text-2xl font-bold text-orange-700">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 md:text-2xl">
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
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <span>{joinedLabel} から利用</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* right: actions */}
                <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
                  <Link
                    href="/profile/edit"
                    className="inline-flex w-full items-center justify-center rounded-none border border-black/[.08] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 md:w-auto md:text-xs md:py-2"
                  >
                    プロフィールを編集
                  </Link>
                </div>
              </div>

              {bio ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{bio}</p>
              ) : null}

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
          </section>

          {/* =========================
              HEATMAP (LAZY)
             ========================= */}
          <Suspense
            fallback={
              <section className="w-full bg-white rounded-none border border-black/[.06] p-4">
                <div className="h-5 w-32 bg-slate-100" />
                <div className="mt-3 h-32 border border-black/[.06] bg-white" />
              </section>
            }
          >
            <HeatmapBlock userId={user.id} />
          </Suspense>

          {/* =========================
              POSTS (ALBUM)
             ========================= */}
          <section className="w-full bg-white rounded-none border border-black/[.06] p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">投稿</h2>

              <Link
                href="/posts/new"
                className="inline-flex h-10 items-center gap-2 rounded-none bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 md:h-9 md:text-xs"
              >
                <Plus size={16} />
                Post
              </Link>
            </div>

            <Suspense
              fallback={
                <div className="border border-black/[.06] bg-white p-8 text-center text-xs text-slate-600 md:text-sm">
                  投稿を読み込み中...
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
