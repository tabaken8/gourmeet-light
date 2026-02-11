// app/api/notifications/send/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const resend = new Resend(process.env.RESEND_API_KEY!);

type NotifType = "like" | "want" | "comment" | "reply" | "follow" | "post";

function appOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://gourmeet.jp";
}

function extractNotificationId(body: any): string | null {
  return body?.record?.id ?? body?.new?.id ?? body?.data?.id ?? body?.id ?? null;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function labelForType(t: NotifType) {
  switch (t) {
    case "follow":
      return "フォロー";
    case "comment":
      return "コメント";
    case "reply":
      return "返信";
    case "like":
      return "いいね";
    case "want":
      return "行きたい！";
    case "post":
      return "新規投稿";
  }
}

function berealStyleLine(t: NotifType, actorName: string, placeName?: string | null) {
  const place = placeName ? ` @ ${placeName}` : "";
  switch (t) {
    case "follow":
      return `⏰ Time to Gourmeet. ${actorName} があなたをフォロー！`;
    case "comment":
      return `⏰ Time to Gourmeet. ${actorName} からコメントが届いた！${place}`;
    case "reply":
      return `⏰ Time to Gourmeet. ${actorName} から返信が届いた！${place}`;
    case "like":
      return `💛 ${actorName} がいいねしたよ${place}`;
    case "want":
      return `✨ ${actorName} が「行きたい！」したよ${place}`;
    case "post":
      return `📸 ${actorName} が新しいお店ログを追加したよ！${place}`;
  }
}

function buildSubject(t: NotifType, actorName: string, placeName?: string | null) {
  const core =
    t === "follow"
      ? "フォローされた"
      : t === "comment"
        ? "コメントが届いた"
        : t === "reply"
          ? "返信が届いた"
          : t === "like"
            ? "いいねされた"
            : t === "want"
              ? "「行きたい！」された"
              : "新しい投稿";
  const tail = placeName ? `｜${placeName}` : "";
  return `Gourmeet｜${actorName}に${core}${tail}`;
}

/**
 * ✅ いいね連打・付け直しでメール爆撃を防ぐ簡易クールダウン
 * - 同じ user_id（受信者）× actor_id（した人）× post_id × type が
 *   例えば15分以内に "sent" になってたら今回の送信をスキップ
 * - DB変更なしで実現できる
 */
async function shouldCooldownLike(opts: {
  user_id: string;
  actor_id: string | null;
  post_id: string | null;
  type: NotifType;
  cooldownMinutes: number;
}) {
  const { user_id, actor_id, post_id, type, cooldownMinutes } = opts;
  if (!actor_id || !post_id) return false;

  const since = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", user_id)
    .eq("actor_id", actor_id)
    .eq("post_id", post_id)
    .eq("type", type)
    .eq("email_status", "sent")
    .gte("email_sent_at", since)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const notificationId = extractNotificationId(body);

  if (!notificationId) {
    return NextResponse.json({ ok: false, error: "missing notification id" }, { status: 400 });
  }

  // 1) 通知本体
  const { data: n, error: nErr } = await supabaseAdmin
    .from("notifications")
    .select("id,type,created_at,user_id,actor_id,post_id,comment_id,email_status,email_sent_at")
    .eq("id", notificationId)
    .single();

  if (nErr || !n) {
    return NextResponse.json({ ok: false, error: "notification not found" }, { status: 404 });
  }

  // 二重送信防止
  if (n.email_status === "sent") {
    return NextResponse.json({ ok: true, skipped: "already sent" });
  }

  const t = n.type as NotifType;

  // ✅ 送信対象（post を追加）
  const sendable: NotifType[] = ["follow", "comment", "reply", "like", "post"];
  if (!sendable.includes(t)) {
    await supabaseAdmin
      .from("notifications")
      .update({ email_status: "skipped", email_fail_reason: `type=${t}` })
      .eq("id", notificationId);
    return NextResponse.json({ ok: true, skipped: `type=${t}` });
  }

  // ✅ like は爆撃防止（例：15分クールダウン）
  if (t === "like") {
    const cooled = await shouldCooldownLike({
      user_id: n.user_id,
      actor_id: n.actor_id,
      post_id: n.post_id,
      type: "like",
      cooldownMinutes: 15,
    });
    if (cooled) {
      await supabaseAdmin
        .from("notifications")
        .update({ email_status: "skipped", email_fail_reason: "cooldown_like_15m" })
        .eq("id", notificationId);
      return NextResponse.json({ ok: true, skipped: "cooldown_like_15m" });
    }
  }

  // 2) 宛先メール
  const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(n.user_id);

  const toEmail = userRes?.user?.email ?? null;
  if (uErr || !toEmail) {
    await supabaseAdmin
      .from("notifications")
      .update({ email_status: "failed", email_fail_reason: "no recipient email" })
      .eq("id", notificationId);
    return NextResponse.json({ ok: false, error: "no recipient email" }, { status: 400 });
  }

  // 3) actor / post / comment
  let actorName = "だれか";
  if (n.actor_id) {
    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("display_name,username")
      .eq("id", n.actor_id)
      .maybeSingle();
    actorName = actor?.display_name ?? actor?.username ?? actorName;
  }

  let placeName: string | null = null;
  let placeId: string | null = null;
  if (n.post_id) {
    const { data: post } = await supabaseAdmin
      .from("posts")
      .select("place_name,place_id")
      .eq("id", n.post_id)
      .maybeSingle();
    placeName = post?.place_name ?? null;
    placeId = post?.place_id ?? null;
  }

  let commentBody: string | null = null;
  if ((t === "comment" || t === "reply") && n.comment_id) {
    const { data: c } = await supabaseAdmin
      .from("comments")
      .select("body")
      .eq("id", n.comment_id)
      .maybeSingle();
    commentBody = c?.body ?? null;
  }

  // 4) リンク
  const notificationsUrl = `${appOrigin()}/notifications`;
  const settingsUrl = `${appOrigin()}/settings/notifications`;

  // iPhoneネイティブ/WEBどっちでも開きやすいGoogle Mapsリンク
  const mapsUrl = placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        placeName ?? "place"
      )}&query_place_id=${encodeURIComponent(placeId)}`
    : null;

  // 5) 文面
  const headline = berealStyleLine(t, actorName, placeName);
  const subject = buildSubject(t, actorName, placeName);

  const commentPreview =
    commentBody ? commentBody.slice(0, 140) + (commentBody.length > 140 ? "…" : "") : null;

  const text = [
    headline,
    placeName ? `場所：${placeName}` : null,
    commentPreview ? `\n“${commentPreview}”` : null,
    `\n確認する：${notificationsUrl}`,
    mapsUrl ? `Google Maps：${mapsUrl}` : null,
    `\n通知設定：${settingsUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const safeHeadline = escapeHtml(headline);
  const safePlace = placeName ? escapeHtml(placeName) : "";
  const safeComment = commentPreview ? escapeHtml(commentPreview) : "";

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.6;background:#fff;padding:20px">
    <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#fff7ed;padding:16px 18px">
        <div style="font-size:12px;letter-spacing:.18em;color:#f97316;font-weight:700">GOURMEET</div>
        <div style="font-size:18px;margin-top:6px;font-weight:800;color:#111">${safeHeadline}</div>
      </div>

      <div style="padding:18px">
        ${placeName ? `<div style="margin:8px 0 0;color:#111"><span style="color:#f97316;font-weight:700">📍</span> ${safePlace}</div>` : ""}

        ${commentPreview ? `
          <div style="margin-top:12px;padding:12px;border-left:4px solid #fed7aa;background:#fffaf5;border-radius:10px;color:#111">
            “${safeComment}”
          </div>
        ` : ""}

        <div style="margin-top:16px">
          <a href="${notificationsUrl}"
             style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:10px 14px;border-radius:12px;font-weight:700">
            今すぐ見る →
          </a>
          ${mapsUrl ? `<a href="${mapsUrl}" style="margin-left:10px;color:#111;text-decoration:underline;font-size:13px">Maps</a>` : ""}
        </div>

        <div style="margin-top:18px;font-size:12px;color:#666">
          このメールはGourmeetの通知です。通知のオン/オフは
          <a href="${settingsUrl}" style="color:#111;text-decoration:underline">通知設定</a>
          から変更できます。
        </div>
      </div>
    </div>
  </div>
  `.trim();

  // 6) 送信
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: toEmail,
      subject,
      text,
      html,
      headers: {
        "List-Unsubscribe": `<${settingsUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    await supabaseAdmin
      .from("notifications")
      .update({
        email_status: "sent",
        email_sent_at: new Date().toISOString(),
        email_fail_reason: null,
      })
      .eq("id", notificationId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await supabaseAdmin
      .from("notifications")
      .update({
        email_status: "failed",
        email_fail_reason: e?.message ?? "resend error",
      })
      .eq("id", notificationId);

    return NextResponse.json({ ok: false, error: e?.message ?? "resend error" }, { status: 500 });
  }
}
