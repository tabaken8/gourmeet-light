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

type NotifType =
  | "like"
  | "want"
  | "comment"
  | "reply"
  | "follow"
  | "post"
  | "detail_request"
  | "detail_answer";

function appOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://gourmeet.jp";
}

function extractNotificationId(body: any): string | null {
  return body?.record?.id ?? body?.new?.id ?? body?.data?.id ?? body?.id ?? null;
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ざっくり：通知一覧と同じテンプレ辞書（必要な分だけでもOK）
const TEMPLATE_LABELS: Record<string, string> = {
  "visit:when": "行った時間帯（昼/夜）は？",
  "visit:day": "曜日はいつ？",
  "visit:duration": "滞在時間はどれくらい？",
  "visit:busy": "その時間帯、混んでた？",
  "visit:repeat": "リピあり？また行きたい？",

  "scene:who": "誰と行くのが良さそう？",
  "scene:best": "おすすめの使い方は？",

  "mood:vibe": "雰囲気ってどんな感じ？",
  "mood:date": "デート向き？",

  "work:wifi": "Wi-Fi/電源あった？",
  "work:stay": "長居できそう？",

  "food:must": "絶対頼むべきメニューは？",
  "food:portion": "量は多い？少ない？",
  "food:photo": "料理の写真もっと見たい！",

  "resv:need": "予約した？必須？",
  "resv:wait": "待ち時間はどれくらい？",

  "comfort:seat": "席（個室/カウンター）どうだった？",

  "budget:pp": "結局いくらくらい？（1人あたり）",
  "budget:value": "コスパ感は？",
  "budget:charge": "席料/チャージ/お通しあった？",
};

function prettyTemplateLabel(id: string) {
  return TEMPLATE_LABELS[id] ?? id;
}

function buildRequestPreview(templateIds: any, freeText: any) {
  const parts: string[] = [];
  const tids = Array.isArray(templateIds) ? templateIds : [];
  if (tids.length) {
    const head = tids.slice(0, 3).map(prettyTemplateLabel);
    parts.push(...head);
    if (tids.length > 3) parts.push(`他${tids.length - 3}件`);
  }
  const ft = typeof freeText === "string" ? freeText.trim() : "";
  if (ft) parts.push(ft);
  const s = parts.join(" / ");
  return s || null;
}

function berealStyleLine(
  t: NotifType,
  actorName: string,
  placeName?: string | null,
  extraLine?: string | null
) {
  const place = placeName ? ` @ ${placeName}` : "";
  const extra = extraLine ? `\n${extraLine}` : "";
  switch (t) {
    case "follow":
      return `⏰ Time to Gourmeet. ${actorName} があなたをフォロー！${extra}`;
    case "comment":
      return `⏰ Time to Gourmeet. ${actorName} からコメントが届いた！${place}${extra}`;
    case "reply":
      return `⏰ Time to Gourmeet. ${actorName} から返信が届いた！${place}${extra}`;
    case "like":
      return `💛 ${actorName} がいいねしたよ${place}${extra}`;
    case "want":
      return `✨ ${actorName} が「行きたい！」したよ${place}${extra}`;
    case "post":
      return `📸 ${actorName} が新しいお店ログを追加したよ！${place}${extra}`;
    case "detail_request":
      return `📝 ${actorName} からリクエストが届いた！${place}${extra}`;
    case "detail_answer":
      return `✅ ${actorName} がリクエストに回答したよ${place}${extra}`;
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
      : t === "post"
      ? "新しい投稿"
      : t === "detail_request"
      ? "リクエストが届いた"
      : "回答が届いた";

  const tail = placeName ? `｜${placeName}` : "";
  return `Gourmeet｜${actorName}に${core}${tail}`;
}

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

/** ✅ 通知設定（メール）を読む。無ければ全部true扱い */
async function getEmailPrefs(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_notification_settings")
    .select("email_enabled,email_like,email_comment,email_reply,email_follow,email_post,email_want")
    .eq("user_id", userId)
    .maybeSingle();

  const d = data ?? null;

  return {
    email_enabled: d?.email_enabled ?? true,
    email_like: d?.email_like ?? true,
    email_comment: d?.email_comment ?? true,
    email_reply: d?.email_reply ?? true,
    email_follow: d?.email_follow ?? true,
    email_post: d?.email_post ?? true,
    email_want: d?.email_want ?? false,
  };
}

function isTypeEmailAllowed(prefs: Awaited<ReturnType<typeof getEmailPrefs>>, t: NotifType) {
  if (!prefs.email_enabled) return false;
  switch (t) {
    case "like":
      return prefs.email_like;
    case "comment":
      return prefs.email_comment;
    case "reply":
      return prefs.email_reply;
    case "follow":
      return prefs.email_follow;
    case "post":
      return prefs.email_post;
    case "want":
      return prefs.email_want;

    // ★今回は既存設定を壊さないため、commentと同じ扱い
    case "detail_request":
    case "detail_answer":
      return prefs.email_comment;
  }
}

function cutPreview(s: string | null, n = 140) {
  const x = (s ?? "").trim();
  if (!x) return null;
  return x.length > n ? x.slice(0, n) + "…" : x;
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
    .select(
      "id,type,created_at,user_id,actor_id,post_id,comment_id,detail_request_id,email_status,email_sent_at"
    )
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

  // ✅ 送信対象
  const sendable: NotifType[] = [
    "follow",
    "comment",
    "reply",
    "like",
    "post",
    "detail_request",
    "detail_answer",
  ];
  if (!sendable.includes(t)) {
    await supabaseAdmin
      .from("notifications")
      .update({ email_status: "skipped", email_fail_reason: `type=${t}` })
      .eq("id", notificationId);
    return NextResponse.json({ ok: true, skipped: `type=${t}` });
  }

  // ✅ 通知設定（受信者）をチェックして送らない
  const prefs = await getEmailPrefs(n.user_id);
  if (!isTypeEmailAllowed(prefs, t)) {
    await supabaseAdmin
      .from("notifications")
      .update({ email_status: "skipped", email_fail_reason: `prefs_off:${t}` })
      .eq("id", notificationId);
    return NextResponse.json({ ok: true, skipped: `prefs_off:${t}` });
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

  // 3) actor / post / comment / detail_request / answer
  let actorName = "だれか";
  let actorUsername: string | null = null;

  if (t === "detail_request" && !n.actor_id) {
    actorName = "匿名";
  } else if (n.actor_id) {
    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("display_name,username")
      .eq("id", n.actor_id)
      .maybeSingle();

    actorName = actor?.display_name ?? actor?.username ?? actorName;
    actorUsername = actor?.username ?? null;
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

  // ★ detail_request のプレビュー（質問内容）
  let requestPreview: string | null = null;
  if ((t === "detail_request" || t === "detail_answer") && n.detail_request_id) {
    const { data: pdr } = await supabaseAdmin
      .from("post_detail_requests")
      .select("template_ids,free_text")
      .eq("id", n.detail_request_id)
      .maybeSingle();

    requestPreview = buildRequestPreview(pdr?.template_ids, pdr?.free_text);
  }

  // ★ detail_answer のプレビュー（最新回答）
  let answerPreview: string | null = null;
  if (t === "detail_answer" && n.detail_request_id) {
    const { data: ans } = await supabaseAdmin
      .from("post_detail_request_answers")
      .select("body")
      .eq("request_id", n.detail_request_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    answerPreview = cutPreview(ans?.body ?? null, 140);
  }

  // 4) リンク
  const notificationsUrl = `${appOrigin()}/notifications`;
  const settingsUrl = `${appOrigin()}/settings/notifications`;

  // actor profile（匿名なら notificationsへ）
  const actorProfileUrl = n.actor_id ? `${appOrigin()}/u/${n.actor_id}` : notificationsUrl;

  // ★ detail_request / detail_answer の“直リンク”
  const requestUrl =
    n.detail_request_id ? `${appOrigin()}/requests/${encodeURIComponent(n.detail_request_id)}` : notificationsUrl;

  const answerUrl =
    n.detail_request_id ? `${appOrigin()}/answers/${encodeURIComponent(n.detail_request_id)}` : notificationsUrl;

  // iPhoneネイティブ/WEBどっちでも開きやすいGoogle Mapsリンク
  const mapsUrl = placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        placeName ?? "place"
      )}&query_place_id=${encodeURIComponent(placeId)}`
    : null;

  // 「今すぐ見る」リンク：タイプごとに出し分け
  const primaryUrl =
    t === "detail_request" ? answerUrl : t === "detail_answer" ? requestUrl : notificationsUrl;

  // 5) 文面
  const subject = buildSubject(t, actorName, placeName);

  const extraLine =
    t === "detail_request"
      ? requestPreview
        ? `“${cutPreview(requestPreview, 140)}”`
        : null
      : t === "detail_answer"
      ? answerPreview
        ? `“${answerPreview}”`
        : null
      : commentBody
      ? `“${cutPreview(commentBody, 140)}”`
      : null;

  const headline = berealStyleLine(t, actorName, placeName, extraLine);

  const text = [
    headline,
    placeName ? `場所：${placeName}` : null,
    t === "detail_request" && requestPreview ? `\n質問：${requestPreview}` : null,
    t === "detail_answer" && answerPreview ? `\n回答：${answerPreview}` : null,
    `\n確認する：${primaryUrl}`,
    mapsUrl ? `Google Maps：${mapsUrl}` : null,
    `\n通知設定：${settingsUrl}`,
    n.actor_id ? `この人の投稿通知だけOFF：${actorProfileUrl} の🔔をOFF` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const safeHeadline = escapeHtml(headline);
  const safePlace = placeName ? escapeHtml(placeName) : "";
  const safeActorName = escapeHtml(actorName);
  const safeActorHandle = actorUsername ? escapeHtml(actorUsername) : null;

  const safeReq = requestPreview ? escapeHtml(requestPreview) : "";
  const safeAns = answerPreview ? escapeHtml(answerPreview) : "";

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.6;background:#fff;padding:20px">
    <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#fff7ed;padding:16px 18px">
        <div style="font-size:12px;letter-spacing:.18em;color:#f97316;font-weight:700">GOURMEET</div>
        <div style="font-size:18px;margin-top:6px;font-weight:800;color:#111">${safeHeadline}</div>
        ${
          n.actor_id
            ? `<div style="margin-top:6px;font-size:12px;color:#444">from ${safeActorName}${safeActorHandle ? ` (@${safeActorHandle})` : ""}</div>`
            : `<div style="margin-top:6px;font-size:12px;color:#444">from ${safeActorName}</div>`
        }
      </div>

      <div style="padding:18px">
        ${
          placeName
            ? `<div style="margin:8px 0 0;color:#111"><span style="color:#f97316;font-weight:700">📍</span> ${safePlace}</div>`
            : ""
        }

        ${
          t === "detail_request" && requestPreview
            ? `
          <div style="margin-top:12px;padding:12px;border-left:4px solid #fed7aa;background:#fffaf5;border-radius:10px;color:#111">
            <div style="font-size:12px;color:#555;font-weight:700;margin-bottom:6px">質問</div>
            “${safeReq}”
          </div>
        `
            : ""
        }

        ${
          t === "detail_answer" && answerPreview
            ? `
          <div style="margin-top:12px;padding:12px;border-left:4px solid #bfdbfe;background:#eff6ff;border-radius:10px;color:#111">
            <div style="font-size:12px;color:#555;font-weight:700;margin-bottom:6px">回答</div>
            “${safeAns}”
          </div>
        `
            : ""
        }

        <div style="margin-top:16px">
          <a href="${primaryUrl}"
             style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:10px 14px;border-radius:12px;font-weight:700">
            今すぐ見る →
          </a>
          ${
            mapsUrl
              ? `<a href="${mapsUrl}" style="margin-left:10px;color:#111;text-decoration:underline;font-size:13px">Google Maps</a>`
              : ""
          }
        </div>

        <div style="margin-top:18px;font-size:12px;color:#666">
          このメールはGourmeetの通知です。通知のオン/オフは
          <a href="${settingsUrl}" style="color:#111;text-decoration:underline">通知設定</a>
          から変更できます。
          <br/>
          ${
            n.actor_id
              ? `特定の人の投稿通知だけOFFにする場合は、
          <a href="${actorProfileUrl}" style="color:#111;text-decoration:underline">その人のプロフィール</a>
          の 🔔 をOFFにしてください。`
              : ""
          }
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