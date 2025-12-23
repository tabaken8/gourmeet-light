import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalizeDbErrorMessage(msg: string) {
  // Supabaseの error.message が環境によってブレるので “含む” 判定で吸収
  const m = String(msg || "");
  if (m.includes("not_authenticated")) return "ログインしてください。";
  if (m.includes("invalid_points")) return "交換単位が不正です。";
  if (m.includes("insufficient_balance")) return "ポイントが不足しています（1000ptから交換できます）。";
  if (m.includes("insufficient_ticket")) return "交換チケットが不足しています（招待成立で獲得できます）。";
  return m || "申請に失敗しました。";
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const points = typeof body?.points === "number" ? body.points : 1000;

  const { data, error } = await supabase.rpc("request_point_redeem", {
    p_points: points,
  });

  if (error) {
    return NextResponse.json(
      { error: normalizeDbErrorMessage(error.message) },
      { status: 400 }
    );
  }

  return NextResponse.json({ gift_id: data });
}
