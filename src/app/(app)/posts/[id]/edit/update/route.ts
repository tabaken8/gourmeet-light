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

  image_variants?: any | null;
  image_urls?: any | null;

  // ✅ NEW (optional breakdown)
  taste_score?: number | null;
  atmosphere_score?: number | null;
  service_score?: number | null;
};

function finiteNumberOrNull(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizeNullableString(v: any): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

// 0..10 clamp + 0.1丸め（nullはnull）
function clampScoreOrNull(v: any): number | null {
  const n = finiteNumberOrNull(v);
  if (n === null) return null;
  const clamped = Math.min(10, Math.max(0, n));
  return Math.round(clamped * 10) / 10;
}

// ✅ Next 15/16: context.params が Promise になるケースがあるので await する
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

    if ("content" in payload) patch.content = normalizeNullableString(payload.content);
    if ("visited_on" in payload) patch.visited_on = normalizeNullableString(payload.visited_on);

    if ("recommend_score" in payload) patch.recommend_score = clampScoreOrNull(payload.recommend_score);
    if ("price_yen" in payload) patch.price_yen = finiteNumberOrNull(payload.price_yen);
    if ("price_range" in payload) patch.price_range = normalizeNullableString(payload.price_range);

    // ✅ FK対策：空文字は必ず null に落とす
    if ("place_id" in payload) patch.place_id = normalizeNullableString(payload.place_id);
    if ("place_name" in payload) patch.place_name = normalizeNullableString(payload.place_name);
    if ("place_address" in payload) patch.place_address = normalizeNullableString(payload.place_address);

    if ("image_variants" in payload) patch.image_variants = payload.image_variants;
    if ("image_urls" in payload) patch.image_urls = payload.image_urls;

    // ✅ NEW
    if ("taste_score" in payload) patch.taste_score = clampScoreOrNull(payload.taste_score);
    if ("atmosphere_score" in payload) patch.atmosphere_score = clampScoreOrNull(payload.atmosphere_score);
    if ("service_score" in payload) patch.service_score = clampScoreOrNull(payload.service_score);

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
