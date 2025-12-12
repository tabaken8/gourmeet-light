// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");

  // 1. code が来てるか確認
  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/login?debug=no_code`
    );
  }

  // 2. セッション交換を試す
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // 交換失敗したとき
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/login?debug=exchange_failed`
    );
  }

  // 3. 成功したとき
  return NextResponse.redirect(
    `${requestUrl.origin}/?debug=callback_ok`
  );
}
