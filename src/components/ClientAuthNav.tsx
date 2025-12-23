// src/components/ClientAuthNav.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ClientAuthNav() {
  const supabase = await createClient();; // ← ここ！

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex items-center gap-3">
      {user ? (
        <>
          <Link href="/timeline" className="text-sm text-black/70 hover:text-black">
            Timeline
          </Link>
          <Link href="/profile" className="text-sm text-black/70 hover:text-black">
            Profile
          </Link>
        </>
      ) : (
        <Link
          href="/auth/login"
          className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white"
        >
          ログイン
        </Link>
      )}
    </div>
  );
}
