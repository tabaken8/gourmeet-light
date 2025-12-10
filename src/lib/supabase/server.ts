import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

// SSR用の Supabase クライアントを作る関数
export function createClient() {
  return createServerComponentClient(
    { cookies }, // ← cookie からセッションを読むのが肝
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );
}

