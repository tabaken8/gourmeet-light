// src/app/(app)/account/edit/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

export default async function AccountEditPage() {
  const supabase = createClient();

  // 認証
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // プロフィール取得
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, username")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl = profile?.avatar_url ?? "";
  const username = profile?.username ?? "";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">プロフィールを編集</h1>
        <Link href="/account" className="text-sm text-black/60 underline">戻る</Link>
      </div>

      {/* プレビュー */}
      <section className="flex items-center gap-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt="avatar" className="h-16 w-16 rounded-full object-cover border" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-semibold">{displayName}</p>
          <p className="text-sm text-black/60">{username ? `@${username}` : "ユーザーID未設定"}</p>
        </div>
      </section>

      {/* 編集フォーム */}
      <form
        action="/account/update"
        method="post"
        encType="multipart/form-data"
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-1 block text-sm">表示名</span>
          <input
            name="display_name"
            defaultValue={displayName}
            className="w-full rounded-lg border px-3 py-2 outline-none focus:border-black/40"
            placeholder="表示名"
          />
        </label>

        <label className="block">
            <span className="mb-1 block text-sm">自己紹介</span>
            <textarea
              name="bio"
              defaultValue={bio}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 outline-none focus:border-black/40"
              placeholder="自己紹介"
            />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">ユーザーID（@は自動）</span>
          <div className="flex items-center gap-2">
            <span className="rounded-md border px-3 py-2 bg-gray-50">@</span>
            <input
              name="username"
              defaultValue={username}
              pattern={USERNAME_RE.source}
              title="3〜30文字、半角英数・._のみ（小文字）"
              className="flex-1 rounded-lg border px-3 py-2 outline-none focus:border-black/40"
              placeholder="例: kenta.tabata"
              inputMode="email"
              autoComplete="off"
            />
          </div>
          <p className="mt-1 text-xs text-black/60">
            例: @gourmeet_user ・ 3〜30文字、半角英数と . _
          </p>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">アイコン画像</span>
          <input type="file" name="avatar" accept="image/*" />
        </label>

        <div className="pt-2">
          <button className="rounded-lg bg-black text-white px-5 py-2 font-semibold hover:opacity-90">
            保存する
          </button>
        </div>
      </form>
    </main>
  );
}
