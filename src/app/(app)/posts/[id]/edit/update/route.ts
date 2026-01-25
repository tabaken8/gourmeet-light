// src/app/(app)/posts/[id]/edit/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Payload = {
  content?: string;
  visited_on?: string | null;
  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// JSTの今日 "YYYY-MM-DD"
function jstTodayKey() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // ✅ Next.js 15 の型に合わせる
) {
  const supabase = await createClient();

  // 認証
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ✅ params は Promise
  const { id: postId } = await ctx.params;

  // payload
  let body: Payload | null = null;
  try {
    body = (await req.json()) as Payload;
  } catch {
    body = null;
  }
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // まず投稿の所有者チェック
  const { data: post, error: getErr } = await supabase
    .from("posts")
    .select("id,user_id")
    .eq("id", postId)
    .maybeSingle();

  if (getErr || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 正規化
  const content =
    typeof body.content === "string" ? body.content : "";

  // visited_on: 空/undefined/nullなら今日
  const visited_on =
    typeof body.visited_on === "string" && body.visited_on.trim()
      ? body.visited_on.trim()
      : jstTodayKey();

  // recommend_score: null or 0..10
  let recommend_score: number | null = null;
  if (typeof body.recommend_score === "number" && Number.isFinite(body.recommend_score)) {
    recommend_score = clamp(body.recommend_score, 0, 10);
  } else {
    recommend_score = null;
  }

  // price: 実額 or レンジ（両方入ってきたら実額優先）
  let price_yen: number | null = null;
  if (typeof body.price_yen === "number" && Number.isFinite(body.price_yen) && body.price_yen > 0) {
    price_yen = Math.floor(body.price_yen);
  }

  let price_range: string | null = null;
  if (!price_yen && typeof body.price_range === "string" && body.price_range.trim()) {
    price_range = body.price_range.trim();
  }

  // Update
  const { error: upErr } = await supabase
    .from("posts")
    .update({
      content,
      visited_on,
      recommend_score,
      price_yen,
      price_range,
    })
    .eq("id", postId)
    .eq("user_id", user.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
