import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: post_id } = await context.params;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const uid = user.id;

  // 投稿情報（通知用）
  const { data: post } = await supabase
    .from("posts")
    .select("id, user_id")
    .eq("id", post_id)
    .maybeSingle();

  if (!post) {
    return NextResponse.redirect(
      new URL(req.headers.get("referer") ?? "/timeline", req.url)
    );
  }

  // 既に want 済みか？
  const { data: exists } = await supabase
    .from("post_wants")
    .select("id")
    .eq("post_id", post_id)
    .eq("user_id", uid)
    .maybeSingle();

  if (exists) {
    // want解除
    await supabase.from("post_wants").delete().eq("id", exists.id);
  } else {
    // want追加
    await supabase.from("post_wants").insert({
      post_id,
      user_id: uid,
    });

    // 通知（自分自身の投稿には送らない）
    if (post.user_id !== uid) {
      await supabase.from("notifications").insert({
        user_id: post.user_id,
        actor_id: uid,
        post_id,
        type: "want",
      });
    }
  }

  return NextResponse.redirect(
    new URL(req.headers.get("referer") ?? "/timeline", req.url)
  );
}
