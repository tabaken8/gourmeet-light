// src/app/api/follow/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function resolveTargetId(
  supabase: ReturnType<typeof createClient>,
  targetId?: string | null,
  targetUsername?: string | null
) {
  if (targetId) return targetId;
  if (!targetUsername) throw new Error("target not provided");
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", targetUsername)
    .single();
  if (error || !data) throw new Error("target not found");
  return data.id as string;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const followeeId = await resolveTargetId(supabase, body.targetId, body.targetUsername);

  if (followeeId === user.id)
    return NextResponse.json({ ok: false, error: "cannot follow yourself" }, { status: 400 });

  // 重複は無視（既にフォロー中なら何もしない）
  const { error } = await supabase
    .from("follows")
    .upsert({ follower_id: user.id, followee_id: followeeId }, { onConflict: "follower_id,followee_id", ignoreDuplicates: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const targetId = url.searchParams.get("targetId");
  const targetUsername = url.searchParams.get("targetUsername");

  const followeeId = await resolveTargetId(supabase, targetId, targetUsername);
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
