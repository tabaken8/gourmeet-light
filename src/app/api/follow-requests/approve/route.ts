// src/app/api/follow-requests/approve/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const followerId = body?.followerId as string | undefined;

  if (!followerId) {
    return NextResponse.json(
      { ok: false, error: "followerId is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("follows")
    .update({ status: "accepted" })
    .eq("followee_id", user.id)
    .eq("follower_id", followerId)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
