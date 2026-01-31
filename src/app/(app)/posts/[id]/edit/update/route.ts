// src/app/(app)/profile/update/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// username は保存時に lower-case 正規化して一意運用する前提
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function isImageFile(file: File) {
  const type = (file.type || "").toLowerCase();
  return type.startsWith("image/");
}

function safeExtFromFile(file: File) {
  const type = (file.type || "").toLowerCase();
  const byType = type.split("/")[1] || "";
  const byName = (file.name.split(".").pop() || "").toLowerCase();
  const raw = (byType || byName || "jpg").replace(/[^a-z0-9]/g, "");
  return raw || "jpg";
}

export async function POST(req: Request) {
  const supabase = await createClient();

  // 認証
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // この route は form POST で叩かれる想定なので redirect でOK
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  // フォーム取得
  const form = await req.formData();

  // 入力（空欄は null 扱い＝クリア）
  const display_name = trimOrNull(form.get("display_name"));
  const bio = trimOrNull(form.get("bio"));

  // 公開 / 非公開（チェックボックス）
  // チェックされていれば値が入る → true / 無ければ false
  const is_public = form.get("is_public") != null;

  // username（@は保存しない、lower-caseに正規化）
  const rawUsername = trimOrNull(form.get("username"));
  let username: string | null = rawUsername ? rawUsername.replace(/^@+/, "") : null;
  username = username ? username.toLowerCase() : null;

  if (username && !USERNAME_RE.test(username)) {
    return NextResponse.json(
      { ok: false, error: "ユーザーIDの形式が不正です（3〜30文字、半角英数・._）。" },
      { status: 400 }
    );
  }

  const avatarFile = form.get("avatar") as File | null;
  const headerFile = form.get("header_image") as File | null;

  // 現在のプロフィール取得（自分と同じ名前なら「使用中」でもOKにするため）
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("username, avatar_url, is_public, header_image_url")
    .eq("id", user.id)
    .maybeSingle();

  // username の空き確認（RPC → フォールバック）
  // ※ 重要: ilike は "_" がワイルドカードになるので危険。eq でチェックする。
  if (username && username !== (currentProfile?.username ?? null)) {
    let available: boolean | null = null;

    // ① RPC を試す（RPC 側も lower-case 前提で実装されていると嬉しい）
    const { data: rpcOk, error: rpcErr } = await supabase.rpc("is_username_available", {
      in_name: username,
    });

    if (!rpcErr && typeof rpcOk === "boolean") {
      available = rpcOk;
    } else {
      // ② フォールバック（RPC未導入でも最低限の重複チェック）
      const { data: used, error: qErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .limit(1);

      if (!qErr) {
        available = !(used && used.length > 0);
      }
    }

    if (available === false) {
      return NextResponse.json({ ok: false, error: "このユーザーIDは使用できません。" }, { status: 409 });
    }
  }

  // アイコン URL（既存値をベース）
  let avatarUrl: string | null =
    (currentProfile?.avatar_url as string | null) ?? ((user.user_metadata as any)?.avatar_url ?? null);

  // ヘッダー URL（既存値をベース）
  let headerImageUrl: string | null = (currentProfile?.header_image_url as string | null) ?? null;

  // アイコン画像アップロード
  if (avatarFile && avatarFile.size > 0) {
    if (!isImageFile(avatarFile)) {
      return NextResponse.json({ ok: false, error: "アイコン画像が不正です（image/* のみ）。" }, { status: 400 });
    }

    const contentType = avatarFile.type || "image/jpeg";
    const ext = safeExtFromFile(avatarFile);
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile, {
      upsert: true,
      contentType,
    });

    if (uploadError) {
      return NextResponse.json(
        { ok: false, error: `画像のアップロードに失敗しました: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    avatarUrl = pub.publicUrl;
  }

  // ヘッダー画像アップロード
  if (headerFile && headerFile.size > 0) {
    if (!isImageFile(headerFile)) {
      return NextResponse.json({ ok: false, error: "ホーム画像が不正です（image/* のみ）。" }, { status: 400 });
    }

    const contentType = headerFile.type || "image/jpeg";
    const ext = safeExtFromFile(headerFile);
    const path = `${user.id}/header.${ext}`;

    const { error: headerUploadError } = await supabase.storage.from("avatars").upload(path, headerFile, {
      upsert: true,
      contentType,
    });

    if (headerUploadError) {
      return NextResponse.json(
        { ok: false, error: `ホーム画像のアップロードに失敗しました: ${headerUploadError.message}` },
        { status: 500 }
      );
    }

    const { data: headerPub } = supabase.storage.from("avatars").getPublicUrl(path);
    headerImageUrl = headerPub.publicUrl;
  }

  // 1) user_metadata を更新（display_name / bio / avatar_url）
  // 空欄→null も “クリア” として反映させたいのでそのまま入れる
  const { error: authErr } = await supabase.auth.updateUser({
    data: {
      display_name,
      bio,
      avatar_url: avatarUrl,
    },
  });

  if (authErr) {
    return NextResponse.json({ ok: false, error: `認証情報の更新に失敗しました: ${authErr.message}` }, { status: 500 });
  }

  // 2) profiles を更新（display_name / bio / username / is_public / header_image_url 等）
  // 空欄→null をDBにも反映（= クリア可能）
  const patch: Record<string, any> = {
    id: user.id,
    display_name, // null OK
    bio, // null OK
    username, // null OK
    is_public, // 必ず boolean
    updated_at: new Date().toISOString(),
  };

  // URL類は既存値 or アップロード後で non-null のものだけ入れる（勝手に消さない）
  if (avatarUrl !== null) patch.avatar_url = avatarUrl;
  if (headerImageUrl !== null) patch.header_image_url = headerImageUrl;

  const { error: upsertErr } = await supabase.from("profiles").upsert(patch, {
    onConflict: "id",
  });

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: `プロフィール更新に失敗しました: ${upsertErr.message}` }, { status: 500 });
  }

  // 正常終了
  return NextResponse.redirect(new URL("/profile", req.url));
}
