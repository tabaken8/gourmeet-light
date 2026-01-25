// src/app/(app)/posts/[id]/edit/update/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const supabase = await createClient();

  // 認証
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const postId = ctx.params.id;

  // 自分の投稿かチェック
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id,user_id")
    .eq("id", postId)
    .maybeSingle();

  if (postErr || !post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // payload
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // 正規化
  const content = typeof body.content === "string" ? body.content : "";

  const visited_on =
    typeof body.visited_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.visited_on)
      ? body.visited_on
      : null;

  let recommend_score: number | null = null;
  if (typeof body.recommend_score === "number" && Number.isFinite(body.recommend_score)) {
    recommend_score = clamp(body.recommend_score, 0, 10);
  }

  let price_yen: number | null = null;
  if (typeof body.price_yen === "number" && Number.isFinite(body.price_yen) && body.price_yen > 0) {
    price_yen = Math.floor(body.price_yen);
  }

  const price_range = typeof body.price_range === "string" ? body.price_range : null;

  // 実額があるならレンジは消す（混在防止）
  const updateRow: any = {
    content,
    visited_on: visited_on ?? null,
    recommend_score,
    price_yen,
    price_range: price_yen ? null : price_range,
  };

  const { error: upErr } = await supabase.from("posts").update(updateRow).eq("id", postId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
