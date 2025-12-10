// src/app/(app)/account/edit/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

export default async function AccountEditPage() {
  const supabase = createClient();

  // 認証
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // プロフィール取得
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
  const isPublic = profile?.is_public ?? true; // null のときは公開扱い
  const headerImageUrl = profile?.header_image_url ?? "";

  return (
    <main className="min-h-screen bg-orange-50">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">
            プロフィールを編集
          </h1>
          <Link
            href="/account"
            className="text-sm text-black/60 underline hover:text-black/80"
          >
            戻る
          </Link>
        </div>

        {/* プレビュー（カバー＋アイコン） */}
        <section className="relative overflow-hidden rounded-2xl border border-orange-100 bg-white/95 shadow-sm">
          {/* カバーエリア */}
          <div className="relative z-0 h-20 w-full overflow-hidden bg-gradient-to-r from-orange-300 via-amber-200 to-orange-400 md:h-24">
            {headerImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerImageUrl}
                alt="header"
                className="h-full w-full object-cover"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-900/25 via-orange-500/5 to-transparent" />
          </div>

          {/* アイコン + テキスト */}
          <div className="relative z-10 -mt-8 flex items-center gap-4 px-4 pb-4 md:-mt-10">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="avatar"
                className="h-16 w-16 rounded-full border-2 border-white bg-orange-100 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-orange-100 text-xl font-bold text-orange-700 shadow-sm">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="space-y-1">
              {/* 表示名（ハンドル）を一番目立たせる */}
              <p className="text-base font-bold text-slate-900">
                {displayName}
              </p>
              <p className="text-sm text-black/60">
                {username ? `@${username}` : "ユーザーID未設定"}
              </p>
              <p className="text-xs text-black/60">
                {isPublic ? "公開プロフィール" : "非公開プロフィール"}
              </p>
            </div>
          </div>
        </section>

        {/* 編集フォーム */}
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm">
          <form
            action="/account/update"
            method="post"
            encType="multipart/form-data"
            className="space-y-4"
          >
            {/* 表示名 */}
            <label className="block">
              <span className="mb-1 block text-sm">表示名</span>
              <input
                name="display_name"
                defaultValue={displayName}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-400"
                placeholder="表示名"
              />
            </label>

            {/* 自己紹介 */}
            <label className="block">
              <span className="mb-1 block text-sm">自己紹介</span>
              <textarea
                name="bio"
                defaultValue={bio}
                rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-400"
                placeholder="自己紹介"
              />
            </label>

            {/* ユーザーID */}
            <label className="block">
              <span className="mb-1 block text-sm">ユーザーID（@は自動）</span>
              <div className="flex items-center gap-2">
                <span className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
                  @
                </span>
                <input
                  name="username"
                  defaultValue={username}
                  pattern={USERNAME_RE.source}
                  title="3〜30文字、半角英数・._のみ（小文字）"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-400"
                  placeholder="例: kenta.tabata"
                  inputMode="email"
                  autoComplete="off"
                />
              </div>
              <p className="mt-1 text-xs text-black/60">
                例: @gourmeet_user ・ 3〜30文字、半角英数と . _
              </p>
            </label>

            {/* 公開 / 非公開 */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashed border-orange-100 bg-orange-50/40 px-3 py-3">
              <input
                type="checkbox"
                name="is_public"
                defaultChecked={isPublic}
                className="mt-1 h-4 w-4 rounded border border-slate-300"
              />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  プロフィールを公開する
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  チェックを外すと、今後プライベートモード等を実装したときに
                  フォロワーのみ公開などの挙動に切り替えやすくなります。
                </p>
              </div>
            </label>

            {/* アイコン画像 */}
            <label className="block">
              <span className="mb-1 block text-sm">アイコン画像</span>
              <input
                type="file"
                name="avatar"
                accept="image/*"
                className="text-sm"
              />
            </label>

            {/* ホーム画像（カバー） */}
            <label className="block">
              <span className="mb-1 block text-sm">ホーム画像</span>
              <input
                type="file"
                name="header_image"
                accept="image/*"
                className="text-sm"
              />
              <p className="mt-1 text-xs text-black/60">
                プロフィール上部に表示される画像です。
                未設定の場合はオレンジのグラデーションが表示されます。
              </p>
            </label>

            <div className="pt-2">
              <button className="rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white hover:opacity-90">
                保存する
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
