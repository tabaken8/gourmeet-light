import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import AccountForm from "./AccountForm.client";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, is_public")
    .eq("id", user.id)
    .single();

  const t = await getTranslations("settings");

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24 pt-6 md:pb-10">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 transition"
          aria-label={t("back")}
        >
          <ChevronLeft size={18} className="text-slate-500" />
        </Link>
        <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">
          {t("account")}
        </h1>
      </div>

      <AccountForm
        email={user.email ?? ""}
        username={profile?.username ?? ""}
        isPublic={profile?.is_public ?? true}
      />
    </main>
  );
}
