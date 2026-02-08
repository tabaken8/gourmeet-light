// src/app/(app)/posts/[id]/edit/update/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Payload = {
  content?: string | null;
  visited_on?: string | null;
  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;

  place_id?: string | null;
  place_name?: string | null;
  place_address?: string | null;

  // 画像は「送られてきた時だけ更新」したいので optional のまま
  // 変更なし: このキー自体を送らない
  // 削除したい: null / [] を明示的に送る
  image_variants?: any | null;
  image_urls?: any | null;
};

function finiteNumberOrNull(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ✅ Next 16: context.params が Promise になってるので await する
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not logged in" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    // JSON受信（クライアントが application/json を送っている前提）
    const payload = (await req.json()) as Payload;

    // 対象投稿の存在確認 + 自分の投稿かチェック
    const { data: post, error: getErr } = await supabase
      .from("posts")
      .select("id,user_id")
      .eq("id", id)
      .maybeSingle();

    if (getErr || !post) {
      return NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (post.user_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 「送られてきた項目だけ」更新
    const patch: Record<string, any> = {};

    if ("content" in payload) patch.content = payload.content ?? null;
    if ("visited_on" in payload) patch.visited_on = payload.visited_on ?? null;

    if ("recommend_score" in payload) patch.recommend_score = finiteNumberOrNull(payload.recommend_score);
    if ("price_yen" in payload) patch.price_yen = finiteNumberOrNull(payload.price_yen);
    if ("price_range" in payload) patch.price_range = payload.price_range ?? null;

    if ("place_id" in payload) patch.place_id = payload.place_id ?? null;
    if ("place_name" in payload) patch.place_name = payload.place_name ?? null;
    if ("place_address" in payload) patch.place_address = payload.place_address ?? null;

    // ⭐画像：送られてきた時だけ更新（未送信なら既存値保持）
    if ("image_variants" in payload) patch.image_variants = payload.image_variants;
    if ("image_urls" in payload) patch.image_urls = payload.image_urls;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { error: upErr } = await supabase.from("posts").update(patch).eq("id", id);

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: upErr.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("[posts/edit/update] unhandled", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
