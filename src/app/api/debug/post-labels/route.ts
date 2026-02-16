// src/app/api/debug/post-labels/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BACKFILL_SECRET = process.env.BACKFILL_SECRET || ""; // Vercel/ローカルで同じ

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

// Translate APIの translatedText は HTML entity を含みがちなので、ここで完全にデコード
function decodeHtmlEntities(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(String(h), 16)));
}

function pickBestImage(post: any): string | null {
  // image_labels.picked があれば最優先
  const picked = post?.image_labels?.picked;
  if (typeof picked === "string" && /^https?:\/\//i.test(picked)) return picked;

  // cover系
  for (const k of ["cover_square_url", "cover_pin_url", "cover_full_url"]) {
    const u = post?.[k];
    if (typeof u === "string" && /^https?:\/\//i.test(u)) return u;
  }

  // image_assets / image_variants / image_urls からも拾う（あるなら）
  const cand: string[] = [];
  if (Array.isArray(post?.image_assets)) {
    for (const a of post.image_assets) {
      if (a?.square) cand.push(a.square);
      if (a?.pin) cand.push(a.pin);
      if (a?.full) cand.push(a.full);
    }
  }
  if (Array.isArray(post?.image_variants)) {
    for (const v of post.image_variants) {
      if (v?.thumb) cand.push(v.thumb);
      if (v?.full) cand.push(v.full);
    }
  }
  if (Array.isArray(post?.image_urls)) {
    for (const u of post.image_urls) cand.push(u);
  }

  for (const u of cand) {
    if (typeof u === "string" && /^https?:\/\//i.test(u)) return u;
  }
  return null;
}

function authOk(req: Request) {
  if (!BACKFILL_SECRET) return false;

  const { searchParams } = new URL(req.url);
  const qSecret = searchParams.get("secret") || "";
  const hSecret = req.headers.get("x-backfill-secret") || "";
  return qSecret === BACKFILL_SECRET || hSecret === BACKFILL_SECRET;
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      // ★ これでiPhone Safariでも文字化けしにくい
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  if (!authOk(req)) return json({ ok: false, error: "unauthorized" }, 401);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "missing_supabase_env" }, 500);
  }

  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") || "").trim();
  const format = (searchParams.get("format") || "").trim().toLowerCase(); // "json" ならJSON返す

  if (!id) return json({ ok: false, error: "missing_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: post, error } = await supabase
    .from("posts")
    .select(
      "id, created_at, user_id, content, place_name, place_address, cover_square_url, cover_pin_url, cover_full_url, image_urls, image_assets, image_variants, image_labels, image_label_version, image_labeled_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return json({ ok: false, error: error.message }, 500);
  if (!post) return json({ ok: false, error: "not_found" }, 404);

  // 日本語ラベルを “表示用に” きれいにする
  const topJaRaw: any[] = Array.isArray(post.image_labels?.top_labels_ja)
    ? post.image_labels.top_labels_ja
    : [];
  const topJa = topJaRaw
    .map((x) => decodeHtmlEntities(String(x ?? "")).normalize("NFC").trim())
    .filter(Boolean);

  const topEnRaw: any[] = Array.isArray(post.image_labels?.top_labels_en)
    ? post.image_labels.top_labels_en
    : [];
  const topEn = topEnRaw.map((x) => String(x ?? "").trim()).filter(Boolean);

  const img = pickBestImage(post);

  const payload = {
    ok: true,
    id: post.id,
    created_at: post.created_at,
    user_id: post.user_id,
    place_name: post.place_name,
    place_address: post.place_address,
    image_label_version: post.image_label_version,
    image_labeled_at: post.image_labeled_at,
    image: img,
    labels: {
      top_labels_en: topEn,
      top_labels_ja: topJa,
      top_labels_ja_text: topJa.join(" "),
    },
    image_labels_raw: post.image_labels,
  };

  if (format === "json") {
    // JSONでも念のため no-store
    const res = NextResponse.json(payload, { status: 200 });
    res.headers.set("cache-control", "no-store");
    return res;
  }

  // HTMLページで “画像＋ラベル＋生JSON” を見れるようにする（スマホでも見やすい）
  const pretty = JSON.stringify(payload, null, 2);

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>post-labels debug</title>
  <style>
    body{font-family: ui-sans-serif, system-ui, -apple-system; margin:16px; line-height:1.45;}
    .card{border:1px solid rgba(0,0,0,.12); border-radius:12px; padding:12px; margin:12px 0;}
    .row{display:flex; gap:12px; flex-wrap:wrap;}
    img{max-width: min(420px, 100%); border-radius:12px; border:1px solid rgba(0,0,0,.12);}
    .tag{display:inline-block; padding:6px 10px; border:1px solid rgba(0,0,0,.12); border-radius:999px; margin:4px 6px 0 0;}
    pre{white-space:pre-wrap; word-break:break-word; background:#0b0b0b; color:#eee; padding:12px; border-radius:12px; overflow:auto;}
    a{color:#2563eb;}
    .muted{opacity:.7;}
  </style>
</head>
<body>
  <h2>post-labels debug</h2>
  <div class="muted">id: ${post.id}</div>

  <div class="card">
    <div class="row">
      <div>
        ${img ? `<img src="${img}" alt="post image" />` : `<div class="muted">画像なし</div>`}
        ${img ? `<div class="muted" style="margin-top:6px;">${img}</div>` : ``}
      </div>
      <div style="min-width:260px; flex:1;">
        <div><b>Place</b>: ${post.place_name ?? ""}</div>
        <div class="muted">${post.place_address ?? ""}</div>
        <div style="margin-top:10px;"><b>Labels (JA)</b></div>
        <div>
          ${
            topJa.length
              ? topJa.map((t) => `<span class="tag">${t}</span>`).join("")
              : `<span class="muted">top_labels_ja なし</span>`
          }
        </div>

        <div style="margin-top:12px;"><b>Labels (EN)</b></div>
        <div>
          ${
            topEn.length
              ? topEn.map((t) => `<span class="tag">${t}</span>`).join("")
              : `<span class="muted">top_labels_en なし</span>`
          }
        </div>

        <div style="margin-top:12px;">
          <a href="?id=${encodeURIComponent(post.id)}&secret=${encodeURIComponent(
            searchParams.get("secret") || ""
          )}&format=json">JSONで見る</a>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div><b>Raw JSON</b></div>
    <pre>${pretty.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
  </div>
</body>
</html>`;

  return htmlResponse(html, 200);
}
