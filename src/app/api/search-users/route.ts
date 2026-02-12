// src/app/api/search-users/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = clamp(Number(searchParams.get("limit") ?? 6), 1, 20);

  if (!q) return NextResponse.json({ users: [] });

  const supabase = await createClient();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();

  // NOTE:
  // - username / display_name / bio をゆるく検索
  // - 公開ユーザーのみ（自分は常に出してOKなら条件を変えて）
  const like = `%${q}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, is_public")
    .or(`username.ilike.${like},display_name.ilike.${like},bio.ilike.${like}`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // 非公開は「自分だけ表示」 or 「表示しない」どっちでもOK
  const users = (data ?? []).filter((p) => (p.is_public ? true : p.id === me?.id));

  return NextResponse.json({ users });
}
