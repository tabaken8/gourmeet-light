// src/app/(app)/profile/update/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
const IG_RE = /^[A-Za-z0-9._]{1,30}$/;
const X_RE = /^[A-Za-z0-9_]{1,15}$/;

function cleanHandle(v: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.replace(/^@+/, "").trim() || null;
}

/**
 * ざっくりURL貼り付けにも対応してhandle抽出
 * - instagram.com/<handle>
 * - x.com/<handle>
 * - twitter.com/<handle>
 */
function extractHandleFromUrlOrHandle(raw: string | null, kind: "ig" | "x"): string | null {
  const v0 = cleanHandle(raw);
  if (!v0) return null;

  // URLっぽい場合
  if (v0.includes("/") || v0.includes("instagram.com") || v0.includes("x.com") || v0.includes("twitter.com")) {
    try {
      const u = new URL(v0.startsWith("http") ? v0 : `https://${v0}`);
      const host = u.hostname.toLowerCase();
      const path = u.pathname.split("/").filter(Boolean);

      if (kind === "ig") {
        if (host === "instagram.com" || host === "www.instagram.com") {
          const h = path[0] ? cleanHandle(path[0]) : null;
          return h;
        }
      }

      if (kind === "x") {
        if (
          host === "x.com" ||
          host === "www.x.com" ||
          host === "twitter.com" ||
          host === "www.twitter.com"
        ) {
          const h = path[0] ? cleanHandle(path[0]) : null;
          return h;
        }
      }
    } catch {
      // URLとして解釈できない → そのままhandle扱いにフォールバック
    }
  }

  return v0;
}

function extFromFile(file: File, fallback = "jpg"): { ext: string; contentType: string } {
  const contentType = file.type || "image/jpeg";
  const rawExt =
    (contentType.split("/")[1] || file.name.split(".").pop() || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || fallback;

  // 変な拡張子を適当に丸める
  const allowed = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
  const ext = allowed.has(rawExt) ? rawExt : fallback;

  return { ext, contentType };
}

export async function POST(req: Request) {
  const supabase = await createClient();

  // 認証
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url), 303);

  // フォーム取得
  const form = await req.formData();
  const display_name =
    (form.get("display_name") as string | null)?.trim() ?? null;
  const bio = (form.get("bio") as string | null)?.trim() ?? null;

  // 公開 / 非公開
  const rawIsPublic = form.get("is_public") as string | null;
  const is_public: boolean = rawIsPublic != null;

  // username（@は保存しない）
  const rawUsername = (form.get("username") as string | null)?.trim() ?? null;
  let username = rawUsername ? rawUsername.replace(/^@+/, "") : null;
  if (username && !USERNAME_RE.test(username)) {
    return NextResponse.json(
      { ok: false, error: "ユーザーIDの形式が不正です（3〜30文字、半角英数・._）。" },
      { status: 400 }
    );
  }

  // 公認SNS: Instagram / X
  const igRaw = (form.get("instagram") as string | null) ?? null;
  const xRaw = (form.get("x") as string | null) ?? null;

  const instagram_username = extractHandleFromUrlOrHandle(igRaw, "ig");
  const x_username = extractHandleFromUrlOrHandle(xRaw, "x");

  if (instagram_username && !IG_RE.test(instagram_username)) {
    return NextResponse.json(
      { ok: false, error: "Instagram IDの形式が不正です。" },
      { status: 400 }
    );
  }
  if (x_username && !X_RE.test(x_username)) {
    return NextResponse.json(
      { ok: false, error: "X IDの形式が不正です。" },
      { status: 400 }
    );
  }

  // 現在のプロフィール取得（自分と同じusernameならOKにするため）
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("username, avatar_url, is_public, instagram_username, x_username")
    .eq("id", user.id)
    .single();

  // username の空き確認（RPC → フォールバック）
  if (username && username !== (currentProfile?.username ?? null)) {
    let available: boolean | null = null;

    // ① RPC
    const { data: rpcOk, error: rpcErr } = await supabase.rpc(
      "is_username_available",
      { in_name: username }
    );
    if (!rpcErr && typeof rpcOk === "boolean") {
      available = rpcOk;
    } else {
      // ② フォールバック（最低限）
      const { data: used, error: qErr } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", username)
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

  // アイコン URL（既存値をベース）
  let avatarUrl: string | null =
    (currentProfile?.avatar_url as string | null) ??
    ((user.user_metadata as any)?.avatar_url ?? null);

  // アバター画像アップロード（ユニークパスでキャッシュ問題を潰す）
  const file = form.get("avatar") as File | null;
  if (file && file.size > 0) {
    const { ext, contentType } = extFromFile(file, "jpg");
    const path = `${user.id}/avatar_${Date.now()}.${ext}`;

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

  // 1) user_metadata 更新（display_name / bio / avatar_url）
  const { error: authErr } = await supabase.auth.updateUser({
    data: { display_name, bio, avatar_url: avatarUrl },
  });
  if (authErr) {
    return NextResponse.json(
      { ok: false, error: `認証情報の更新に失敗しました: ${authErr.message}` },
      { status: 500 }
    );
  }

  // 2) profiles 更新（username / is_public / sns / avatar_url / display_name / bio）
  const patch: Record<string, any> = { id: user.id };

  if (display_name !== null) patch.display_name = display_name;
  if (bio !== null) patch.bio = bio;
  if (avatarUrl !== null) patch.avatar_url = avatarUrl;
  if (username !== null) patch.username = username;

  patch.is_public = is_public ?? true;

  // 公認SNS
  patch.instagram_username = instagram_username; // nullでも上書き（空にしたいことがある）
  patch.x_username = x_username;

  const { error: upsertErr } = await supabase.from("profiles").upsert(patch, {
    onConflict: "id",
  });

  if (upsertErr) {
    return NextResponse.json(
      { ok: false, error: `プロフィール更新に失敗しました: ${upsertErr.message}` },
      { status: 500 }
    );
  }

  // 正常終了
  return NextResponse.redirect(new URL("/profile", req.url), 303);
}
