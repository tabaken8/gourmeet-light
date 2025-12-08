import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params; // ← Next.js 15 仕様

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { data: post } = await supabase
    .from("posts")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  await supabase
    .from("posts")
    .update({
      content: body.content ?? null,
      image_urls: body.image_urls ?? null,
      place_name: body.place_name ?? null,
      place_address: body.place_address ?? null,
      place_id: body.place_id ?? null,
    })
    .eq("id", id);

  return NextResponse.json({ success: true });
}
