import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // ← あなたの server.ts（createServerComponentClient使うやつ）

export async function POST() {
  const supabase = createClient();
  // クッキーに保存されたSupabaseセッションを破棄
  await supabase.auth.signOut(); // 必要なら: { scope: "global" }
  return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
}
