// src/lib/supabase/client.ts
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function createClient() {
  return createClientComponentClient();
}

// 互換（既存コードを壊さない）
export const supabase = createClient();
