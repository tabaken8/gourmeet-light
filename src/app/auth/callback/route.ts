// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

function safeNextPath(next: string | null) {
  if (!next) return null;

  // decodeに失敗しても落とさない
  let v = next;
  try {
    v = decodeURIComponent(next);
  } catch {}

  // 外部URLは禁止（オープンリダイレクト対策）
  // 「/」から始まる内部パスだけ許可
  if (!v.startsWith("/")) return null;

  // 二重スラッシュも一応弾く（//evil.com みたいなの）
  if (v.startsWith("//")) return null;

  return v;
}

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");

  const nextPath = safeNextPath(nextParam) ?? "/timeline?tab=friends";

  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/login?debug=no_code&next=${encodeURIComponent(nextPath)}`
    );
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/login?debug=exchange_failed&next=${encodeURIComponent(nextPath)}`
    );
  }

  // ✅ 成功したら next に戻す（なければデフォルト）
  return NextResponse.redirect(`${requestUrl.origin}${nextPath}`);
}
