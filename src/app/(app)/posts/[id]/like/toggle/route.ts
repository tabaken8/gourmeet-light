import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url));

  const post_id = params.id;
  const uid = user.id;

  // その投稿が誰のものか取得（通知用）
  const { data: post } = await supabase
    .from("posts")
    .select("id, user_id")
    .eq("id", post_id)
    .maybeSingle();

  if (!post) {
    return NextResponse.redirect(new URL(req.headers.get("referer") ?? "/timeline", req.url));
  }

  // 自分が既にいいねしているか？
  const { data: exists } = await supabase
    .from("post_likes")
    .select("id")
    .eq("post_id", post_id)
    .eq("user_id", uid)
    .maybeSingle();

  if (exists) {
    // いいね解除
    await supabase.from("post_likes").delete().eq("id", exists.id);
  } else {
    // いいね追加
    await supabase.from("post_likes").insert({ post_id, user_id: uid });

    // 通知を追加（自分自身の投稿には通知しない）
    if (post.user_id !== uid) {
      await supabase.from("notifications").insert({
        user_id: post.user_id, // 通知を受け取る側（投稿者）
        actor_id: uid,         // 行動を起こした人
        post_id: post_id,
        type: "like",
      });
    }
  }

  return NextResponse.redirect(new URL(req.headers.get("referer") ?? "/timeline", req.url));
}
