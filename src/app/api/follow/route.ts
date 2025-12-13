// src/app/api/follow/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST: フォロー or フォローリクエスト
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
  const targetId = (body?.targetId as string | undefined) ?? null;
  const targetUsername = (body?.targetUsername as string | undefined) ?? null;

  if (!targetId && !targetUsername) {
    return NextResponse.json(
      { ok: false, error: "targetId or targetUsername is required" },
      { status: 400 }
    );
  }

  // 対象ユーザー取得（ID or username）
  let targetProfile:
    | { id: string; is_public: boolean | null }
    | null = null;

  if (targetId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, is_public")
      .eq("id", targetId)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    targetProfile = data;
  } else if (targetUsername) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, is_public")
      .eq("username", targetUsername)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    targetProfile = data;
  }

  if (!targetProfile) {
    return NextResponse.json(
      { ok: false, error: "Target user not found" },
      { status: 404 }
    );
  }

  const followeeId = targetProfile.id;

  if (followeeId === user.id) {
    return NextResponse.json(
      { ok: false, error: "You cannot follow yourself" },
      { status: 400 }
    );
  }

  const isPublic = targetProfile.is_public ?? true;
  const newStatus = isPublic ? "accepted" : "pending";

  // 既存の関係を確認
  const { data: existing, error: existErr } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId)
    .maybeSingle();

  if (existErr) {
    return NextResponse.json(
      { ok: false, error: existErr.message },
      { status: 500 }
    );
  }

  // 既にフォロー中
  if (existing?.status === "accepted") {
    return NextResponse.json({ ok: true, status: "accepted" });
  }

  // 既に pending の場合：
  // 公開アカウントになっていたら accepted に昇格させるイメージ
  if (existing?.status === "pending") {
    if (newStatus === "accepted") {
      const { error: updErr } = await supabase
        .from("follows")
        .update({ status: "accepted" })
        .eq("follower_id", user.id)
        .eq("followee_id", followeeId);
      if (updErr) {
        return NextResponse.json(
          { ok: false, error: updErr.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, status: "accepted" });
    }
    // そのまま pending で維持
    return NextResponse.json({ ok: true, status: "pending" });
  }

  // 新規フォロー or フォローリクエスト
  const { error: insErr } = await supabase.from("follows").insert({
    follower_id: user.id,
    followee_id: followeeId,
    status: newStatus,
  });

  if (insErr) {
    return NextResponse.json(
      { ok: false, error: insErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, status: newStatus });
}

// DELETE: フォロー解除 or リクエスト取消
export async function DELETE(req: Request) {
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

  const url = new URL(req.url);
  const targetId = url.searchParams.get("targetId");
  const targetUsername = url.searchParams.get("targetUsername");

  if (!targetId && !targetUsername) {
    return NextResponse.json(
      { ok: false, error: "targetId or targetUsername is required" },
      { status: 400 }
    );
  }

  let followeeId: string | null = targetId;

  if (!followeeId && targetUsername) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", targetUsername)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    followeeId = data?.id ?? null;
  }

  if (!followeeId) {
    return NextResponse.json(
      { ok: false, error: "Target user not found" },
      { status: 404 }
    );
  }

  const { error: delErr } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId);

  if (delErr) {
    return NextResponse.json(
      { ok: false, error: delErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
