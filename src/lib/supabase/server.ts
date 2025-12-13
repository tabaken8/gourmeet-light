// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerComponentClient(
    { cookies: () => cookieStore } as any, // ← 型ズレはここで黙らせる（実行時は正しい）
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );
}
