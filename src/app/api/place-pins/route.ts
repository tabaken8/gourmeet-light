import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const place_id = body?.place_id as string | undefined;
  if (!place_id) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  // 既にあるか確認
  const { data: existing } = await supabase
    .from("place_pins")
    .select("place_id")
    .eq("user_id", user.id)
    .eq("place_id", place_id)
    .maybeSingle();

  if (existing) {
    // 解除
    const { error } = await supabase
      .from("place_pins")
      .delete()
      .eq("user_id", user.id)
      .eq("place_id", place_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pinned: false });
  } else {
    // 追加（sort_order は “末尾” でOK。厳密にしたければ max+1）
    const { error } = await supabase
      .from("place_pins")
      .insert({ user_id: user.id, place_id, sort_order: 9999 });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pinned: true });
  }
}
