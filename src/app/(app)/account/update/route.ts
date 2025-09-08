// src/app/(app)/account/update/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

export async function POST(req: Request) {
  const supabase = createClient();

  // 認証
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url));

  // フォーム取得
  const form = await req.formData();
  const display_name = (form.get("display_name") as string | null)?.trim() ?? null;
  const bio          = (form.get("bio") as string | null)?.trim() ?? null;
  const file         = form.get("avatar") as File | null;

  // username（@は保存しない）
  const rawUsername  = (form.get("username") as string | null)?.trim() ?? null;
  let username = rawUsername ? rawUsername.replace(/^@+/, "") : null;
  if (username && !USERNAME_RE.test(username)) {
    return NextResponse.json(
      { ok: false, error: "ユーザーIDの形式が不正です（3〜30文字、半角英数・._）。" },
      { status: 400 }
    );
  }

  // 現在のプロフィール取得（自分と同じ名前なら「使用中」でもOKにするため）
  const { data: currentProfile, error: curErr } = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", user.id)
    .single();

  if (curErr) {
    // 初回プロフィール未作成の場合もあるので、この時点では致命ではない
  }

  // username の空き確認（RPC → フォールバック）
  if (username && username !== (currentProfile?.username ?? null)) {
    let available: boolean | null = null;

    // ① RPC を試す（用意済みなら最速・正確）
    const { data: rpcOk, error: rpcErr } = await supabase.rpc(
      "is_username_available",
      { in_name: username }
    );
    if (!rpcErr && typeof rpcOk === "boolean") {
      available = rpcOk;
    } else {
      // ② フォールバック（RPC未導入でも最低限の重複チェック）
      const { data: used, error: qErr } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", username) // 大小同一視（DB側に username_ci があれば理想）
        .limit(1);
      if (!qErr) {
        available = !(used && used.length > 0);
      }
    }

    if (available === false) {
      return NextResponse.json(
        { ok: false, error: "このユーザーIDは使用できません。" },
        { status: 409 }
      );
    }
  }

  // アバター（任意）
  let avatarUrl: string | null =
    (currentProfile?.avatar_url as string | null) ??
    ((user.user_metadata as any)?.avatar_url ?? null);

  if (file && file.size > 0) {
    const contentType = file.type || "image/jpeg";
    const ext =
      (contentType.split("/")[1] || file.name.split(".").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";

    const path = `${user.id}/avatar.${ext}`;

    // Supabase Storage は Node でも Blob/File を受け付ける
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType });

    if (uploadError) {
      return NextResponse.json(
        { ok: false, error: `画像のアップロードに失敗しました: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    avatarUrl = pub.publicUrl;
  }

  // 1) user_metadata を更新（表示用に維持したいなら残す）
  const { error: authErr } = await supabase.auth.updateUser({
    data: { display_name, bio, avatar_url: avatarUrl },
  });
  if (authErr) {
    return NextResponse.json(
      { ok: false, error: `認証情報の更新に失敗しました: ${authErr.message}` },
      { status: 500 }
    );
  }

  // 2) profiles を更新（今回の要点：bio / username も保存）
  const patch: Record<string, any> = { id: user.id };
  if (display_name !== null) patch.display_name = display_name;
  if (bio !== null)          patch.bio = bio;
  if (avatarUrl !== null)    patch.avatar_url = avatarUrl;
  if (username !== null)     patch.username = username;

  const { error: upsertErr } = await supabase.from("profiles").upsert(patch, {
    onConflict: "id",
  });
  if (upsertErr) {
    // たとえば DB 側の一意制約・予約語・クールダウン違反などはここに来る
    return NextResponse.json(
      { ok: false, error: `プロフィール更新に失敗しました: ${upsertErr.message}` },
      { status: 500 }
    );
  }

  // 正常終了
  return NextResponse.redirect(new URL("/account", req.url));
}
