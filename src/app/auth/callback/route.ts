// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

function safeNextPath(next: string | null) {
  if (!next) return null;

  let v = next;
  try {
    v = decodeURIComponent(next);
  } catch {}

  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;

  return v;
}

function normalizeInvite(raw: string | null) {
  const v = (raw || "").trim().replace(/\s+/g, "").toUpperCase();
  // ざっくり防御：英数字のみ & 長すぎは捨てる
  if (!v) return "";
  if (v.length > 64) return "";
  if (!/^[A-Z0-9]+$/.test(v)) return "";
  return v;
}

async function tryReserveInvite(supabase: any, invite: string) {
  if (!invite) return;

  // Supabase RPC は「引数名」が関数定義と一致している必要があるので、
  // ありがちな名前を順に試して、通ったらOKにする（失敗してもログだけで続行）
  const candidates = [
    { p_code: invite },
    { code: invite },
    { invite_code: invite },
  ];

  let lastErr: any = null;

  for (const args of candidates) {
    const { error } = await supabase.rpc("reserve_invite_code", args);
    if (!error) return; // 成功
    lastErr = error;
  }

  // ここに来たら全部失敗（ただしログイン自体は成功してるのでリダイレクトはする）
  console.warn("reserve_invite_code failed:", lastErr);
}

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);

  // OAuth用
  const oauthCode = requestUrl.searchParams.get("code");

  // 招待用（あなたの redirectTo が /auth/callback?invite=XXXX ならここで取れる）
  const inviteParam =
    requestUrl.searchParams.get("invite") || requestUrl.searchParams.get("i");
  const invite = normalizeInvite(inviteParam);

  const nextParam = requestUrl.searchParams.get("next");
  const nextPath = safeNextPath(nextParam) ?? "/timeline?tab=friends";

  if (!oauthCode) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/login?debug=no_code&next=${encodeURIComponent(nextPath)}`
    );
  }

  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase.auth.exchangeCodeForSession(oauthCode);

  if (error) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/login?debug=exchange_failed&next=${encodeURIComponent(nextPath)}`
    );
  }

  // ✅ ここが追加：セッション交換成功後に招待コードを reserve
  // 失敗してもログイン導線を壊さない（UX優先）
  try {
    if (invite) {
      // 念のためログインできてるか確認（auth.uid() を使う関数想定のため）
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        await tryReserveInvite(supabase, invite);
      }
    }
  } catch (e) {
    console.warn("invite reserve step failed:", e);
  }

  // ✅ 成功したら next に戻す（なければデフォルト）
  return NextResponse.redirect(`${requestUrl.origin}${nextPath}`);
}
