// src/lib/supabase/server.ts
import type { Database } from "@/lib/supabase/database.types";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export async function createClient() {
  const cookieStore = await cookies(); // ✅ await 必須（Next 15）
  return createServerComponentClient(
    { cookies: () => cookieStore } as any,
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );
}

// ✅ 型付き版も async にする（同期だと cookies() が呼べない）
export async function createTypedClient() {
  const cookieStore = await cookies(); // ✅ await 必須
  return createServerComponentClient<Database>(
    { cookies: () => cookieStore } as any,
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );
}
