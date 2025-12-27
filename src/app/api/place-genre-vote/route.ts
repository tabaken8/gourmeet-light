// app/api/place-genre-vote/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = new Set([
  "🍜", "🍣", "🥩", "🍺", "🥟", "🍛", "🍝", "🍕", "🍔", "☕️", "🍰", "🍷", "📍",
]);

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const place_id = url.searchParams.get("place_id")?.trim();
  if (!place_id) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  // 自分の投票
  const { data: mine } = await supabase
    .from("user_place_pins")
    .select("emoji")
    .eq("user_id", user.id)
    .eq("place_id", place_id)
    .maybeSingle();

  // みんなの投票（RLSで他人の行が見えない場合は空になる。その場合でも投票自体は動く）
  const { data: rows } = await supabase
    .from("user_place_pins")
    .select("emoji")
    .eq("place_id", place_id);

  const counts: Record<string, number> = {};
  (rows ?? []).forEach((r: any) => {
    const e = (r?.emoji ?? "").toString().trim();
    if (!e) return;
    counts[e] = (counts[e] ?? 0) + 1;
  });

  return NextResponse.json({
    my_emoji: (mine as any)?.emoji ?? null,
    counts,
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const place_id = (body?.place_id ?? "").toString().trim();
  const emojiRaw = body?.emoji;

  if (!place_id) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  // emoji は null で「クリア」も許可
  const emoji =
    emojiRaw == null ? null : (emojiRaw ?? "").toString().trim();

  if (emoji != null && !ALLOWED.has(emoji)) {
    return NextResponse.json({ error: "invalid emoji" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_place_pins")
    .upsert(
      { user_id: user.id, place_id, emoji },
      { onConflict: "user_id,place_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
