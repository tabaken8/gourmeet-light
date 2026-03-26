// src/app/api/follows/suggest/route.ts
// フォロー中ユーザーのサジェスト（@mention 入力補助用）
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(10, Math.max(1, Number(searchParams.get("limit") ?? "8")));

  const supabase = await createClient();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();

  if (!me) return NextResponse.json({ users: [] });

  // フォロー中のユーザーを username/display_name で絞り込む
  // q が空の場合は全フォロー中ユーザーを返す
  let query = supabase
    .from("follows")
    .select("profiles!followee_id(id, username, display_name, avatar_url)")
    .eq("follower_id", me.id)
    .eq("status", "accepted")
    .limit(limit);

  const { data, error } = await query;

  if (error) return NextResponse.json({ users: [] });

  const users = (data ?? [])
    .map((row: any) => row.profiles)
    .filter(Boolean)
    .filter((p: any) => {
      if (!q) return true;
      const ql = q.toLowerCase();
      return (
        p.username?.toLowerCase().startsWith(ql) ||
        p.display_name?.toLowerCase().includes(ql)
      );
    })
    .slice(0, limit);

  return NextResponse.json({ users });
}
