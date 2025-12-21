// src/app/api/invites/reserve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_my_reserved_invite");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // data は配列で返ることが多い（table return）
  const current = Array.isArray(data) ? data[0] ?? null : (data as any) ?? null;

  return NextResponse.json({ current });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "");

  const { data, error } = await supabase.rpc("reserve_invite_code", {
    p_code: code,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // data は table return の配列
  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({ result: row });
}
