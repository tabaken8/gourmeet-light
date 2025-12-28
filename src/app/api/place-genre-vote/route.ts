// app/api/place-genre-vote/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalizeGenre(input: unknown): string {
  const s = (input ?? "").toString().trim();

  // 空なら「未設定」扱い（削除に使う）
  if (!s) return "";

  // 改行や制御文字を除去（変なUI・インジェクション対策の最低限）
  const cleaned = s.replace(/[\u0000-\u001F\u007F]/g, "").trim();

  // 長すぎは切る（UI崩れ防止）
  return cleaned.slice(0, 24);
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const place_id = url.searchParams.get("place_id")?.trim();
  if (!place_id) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  // 自分の投票
  const { data: mine } = await supabase
    .from("user_place_pins")
    .select("genre")
    .eq("user_id", user.id)
    .eq("place_id", place_id)
    .maybeSingle();

  // みんなの投票（RLSで見えない場合は rows が空でもOK）
  const { data: rows } = await supabase
    .from("user_place_pins")
    .select("genre")
    .eq("place_id", place_id);

  const counts: Record<string, number> = {};
  (rows ?? []).forEach((r: any) => {
    const g = (r?.genre ?? "").toString().trim();
    if (!g) return;
    counts[g] = (counts[g] ?? 0) + 1;
  });

  return NextResponse.json({
    my_genre: (mine as any)?.genre ?? null,
    counts,
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const place_id = (body?.place_id ?? "").toString().trim();
  if (!place_id) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  const genre = normalizeGenre(body?.genre);

  // genre が空 → 投票を削除（未設定に戻す）
  if (!genre) {
    const { error } = await supabase
      .from("user_place_pins")
      .delete()
      .eq("user_id", user.id)
      .eq("place_id", place_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await supabase
    .from("user_place_pins")
    .upsert(
      {
        user_id: user.id,
        place_id,
        genre,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,place_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, genre });
}
