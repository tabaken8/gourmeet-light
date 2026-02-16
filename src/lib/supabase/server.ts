// src/lib/supabase/server.ts
import type { Database } from "@/lib/supabase/database.types";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export async function createClient() {
  const cookieStore = cookies();
  return createServerComponentClient(
    { cookies: () => cookieStore } as any,
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );
}

// ✅ 追加：型付き版（必要な場所だけで使う）
export function createTypedClient() {
  const cookieStore = cookies();
  return createServerComponentClient<Database>(
    { cookies: () => cookieStore } as any,
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );
}
