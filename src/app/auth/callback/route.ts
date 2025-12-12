// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const errorFromProvider = requestUrl.searchParams.get("error");

  // まずはクエリパラメータを確認
  console.log("[callback] code =", code);
  console.log("[callback] provider error =", errorFromProvider);

  if (!code) {
    // そもそも code が来てないパターン
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/login?error=no_code`
    );
  }

  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  console.log("[callback] exchange data =", data);
  console.log("[callback] exchange error =", error);

  if (error) {
    // ここに来たら exchange が失敗してる
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/login?error=exchange_failed`
    );
  }

  // ここまで来ればセッション確立成功のはず
  return NextResponse.redirect(`${requestUrl.origin}/`);
}
