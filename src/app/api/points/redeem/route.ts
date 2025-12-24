import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createSupabase } from "@supabase/supabase-js";

function normalizeDbErrorMessage(msg: string) {
  const m = String(msg || "");
  if (m.includes("not_authenticated")) return "ログインしてください。";
  if (m.includes("invalid_points")) return "交換単位が不正です。";
  if (m.includes("insufficient_balance"))
    return "ポイントが不足しています（1000ptから交換できます）。";
  if (m.includes("insufficient_ticket"))
    return "交換チケットが不足しています（招待成立で獲得できます）。";
  return m || "申請に失敗しました。";
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function supabaseWithBearer(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Supabase env が不足しています（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）");
  }

  // ✅ このクライアントは常に Bearer token を付けてRPCなどを実行
  return createSupabase(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  // 1) まずは Web (cookie) のセッションで判定
  let userId: string | null = null;

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) userId = user.id;
  } catch {
    // ignore（cookie経路が無い環境など）
  }

  // 2) cookieで取れなければ Bearer token を見る（モバイル想定）
  let token: string | null = null;
  if (!userId) {
    token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const sb = supabaseWithBearer(token);
    const {
      data: { user },
      error,
    } = await sb.auth.getUser();

    if (error || !user?.id) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }
    userId = user.id;
  }

  const body = await req.json().catch(() => ({}));
  const points = typeof body?.points === "number" ? body.points : 1000;

  // 3) 実行：cookieなら server supabase、Bearerなら bearer supabase でRPCする
  try {
    if (token) {
      // ✅ モバイル：Bearer token付きでRPC（RLSもユーザー文脈で動く）
      const sb = supabaseWithBearer(token);
      const { data, error } = await sb.rpc("request_point_redeem", { p_points: points });

      if (error) {
        return NextResponse.json(
          { error: normalizeDbErrorMessage(error.message) },
          { status: 400 }
        );
      }
      return NextResponse.json({ gift_id: data });
    } else {
      // ✅ Web：cookieセッションでRPC
      const supabase = await createServerSupabase();
      const { data, error } = await supabase.rpc("request_point_redeem", { p_points: points });

      if (error) {
        return NextResponse.json(
          { error: normalizeDbErrorMessage(error.message) },
          { status: 400 }
        );
      }
      return NextResponse.json({ gift_id: data });
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "申請に失敗しました。" },
      { status: 500 }
    );
  }
}
