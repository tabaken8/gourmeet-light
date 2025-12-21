import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim();

  if (!code) {
    return NextResponse.json({ error: "招待コードを入力してください。" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("reserve_invite_code", { p_code: code });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return NextResponse.json({ ok: false, message: row?.message ?? "failed" }, { status: 200 });
  }

  return NextResponse.json({ ok: true, current: row });
}
