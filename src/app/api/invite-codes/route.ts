// app/api/invite-codes/route.ts
import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(len = 10) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nowIso = new Date().toISOString();

  // 「未使用」かつ「期限内」かつ「最新」を1件
  const { data, error } = await supabase
    .from("invite_codes")
    .select("id, code, created_at, uses, max_uses, expires_at, redeemed_at")
    .eq("created_by", user.id)
    .is("redeemed_at", null)
    .lt("uses", 1) // max_uses=1前提（一般化するなら後述）
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const current = data?.[0] ?? null;
  return NextResponse.json({ current });
}

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const nowIso = now.toISOString();

  // 既に有効な未使用コードがあるならそれを返す（乱発防止）
  const { data: existing, error: existingErr } = await supabase
    .from("invite_codes")
    .select("id, code, created_at, uses, max_uses, expires_at, redeemed_at")
    .eq("created_by", user.id)
    .is("redeemed_at", null)
    .lt("uses", 1)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 400 });
  }
  if (existing?.[0]) {
    return NextResponse.json({ current: existing[0], reused: true });
  }

  const expiresAt = addHours(now, 24).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode(10);

    const { data, error } = await supabase
      .from("invite_codes")
      .insert({
        code,
        created_by: user.id,
        max_uses: 1,
        uses: 0,
        expires_at: expiresAt,
      })
      .select("id, code, created_at, uses, max_uses, expires_at, redeemed_at")
      .single();

    if (error) {
      const msg = (error as any)?.message ?? "";
      const isUnique =
        msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique");
      if (isUnique) continue;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ current: data, reused: false });
  }

  return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
}
