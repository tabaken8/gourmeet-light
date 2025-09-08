import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url));

  const post_id = params.id;
  const uid = user.id;

  const { data: exists } = await supabase
    .from("post_bookmarks")
    .select("id")
    .eq("post_id", post_id)
    .eq("user_id", uid)
    .maybeSingle();

  if (exists) {
    await supabase.from("post_bookmarks").delete().eq("id", exists.id);
  } else {
    await supabase.from("post_bookmarks").insert({ post_id, user_id: uid });
  }

  return NextResponse.redirect(new URL(req.headers.get("referer") ?? "/timeline", req.url));
}
