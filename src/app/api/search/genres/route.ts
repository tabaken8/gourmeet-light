// src/app/api/search/genres/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  // ざっくり上限。placesが多いなら後でRPCでgroup byに置き換えるのがおすすめ。
  const LIMIT = 20000;

  const { data, error } = await supabase
    .from("places")
    .select("primary_genre")
    .not("primary_genre", "is", null)
    .limit(LIMIT);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const rows = Array.isArray(data) ? data : [];
  const freq = new Map<string, number>();

  for (const r of rows) {
    const g = String((r as any)?.primary_genre ?? "").trim();
    if (!g) continue;
    freq.set(g, (freq.get(g) ?? 0) + 1);
  }

  const genres = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1]) // 件数順
    .map(([g]) => g);

  return NextResponse.json({
    ok: true,
    genres,
    // デバッグ用（使わなくてOK）
    limited: rows.length >= LIMIT,
    totalDistinct: genres.length,
  });
}
