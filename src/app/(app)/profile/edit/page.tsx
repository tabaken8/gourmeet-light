// src/app/(app)/profile/edit/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProfileEditForm from "./parts/ProfileEditForm.client";

export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const supabase = await createClient();

  // auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // profile (header image is deprecated)
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, bio, avatar_url, username, is_public, instagram_username, x_username"
    )
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "User";
  const bio = profile?.bio ?? "";
  const avatarUrl =
    profile?.avatar_url ??
    ((user.user_metadata as any)?.avatar_url ?? "") ??
    "";
  const username = profile?.username ?? "";
  const isPublic = profile?.is_public ?? true;

  const instagram = (profile as any)?.instagram_username ?? "";
  const x = (profile as any)?.x_username ?? "";

  return (
    <main className="min-h-screen bg-orange-50">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">
            プロフィールを編集
          </h1>
          <Link href="/profile" className="text-sm text-black/60 hover:text-black/80">
            戻る
          </Link>
        </div>

        <ProfileEditForm
          initial={{
            displayName,
            bio,
            avatarUrl,
            username,
            isPublic,
            instagram,
            x,
          }}
        />
      </div>
    </main>
  );
}
