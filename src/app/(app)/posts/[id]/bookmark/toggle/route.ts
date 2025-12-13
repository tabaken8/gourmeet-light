import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;  // ← await が必要（Next.js 15 仕様）
  const supabase = await createClient();;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { data: existing } = await supabase
    .from("post_bookmarks")
    .select("id")
    .eq("post_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("post_bookmarks").delete().eq("id", existing.id);
    return NextResponse.json({ bookmarked: false });
  } else {
    await supabase.from("post_bookmarks").insert({ post_id: id, user_id: user.id });
    return NextResponse.json({ bookmarked: true });
  }
}
