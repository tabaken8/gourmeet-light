import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const name =
    (user.user_metadata as any)?.display_name || user.email || "Account";

  return (
    <div className="flex w-full bg-[#ffffff]">
      <Sidebar name={name} />
      <main className="flex-1 ml-[240px] min-h-screen px-6 py-6">{children}</main>
    </div>
  );
}
