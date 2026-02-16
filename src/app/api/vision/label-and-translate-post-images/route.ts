// src/app/api/vision/label-and-translate-post-images/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const VISION_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY!;
const TRANSLATE_KEY = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY!; // ✅ A案：REST+API key
const BACKFILL_SECRET = process.env.BACKFILL_SECRET!;

// ロジック変えたら上げる（再付与・再計算に便利）
const LABEL_VERSION = 3;

type VisionLabel = { description: string; score?: number; topicality?: number };

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function toInt(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

function isHttpUrl(s: any): s is string {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function rankExt(url: string) {
  const u = url.toLowerCase();
  // 落ちにくい順（経験則）
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return 0;
  if (u.endsWith(".png")) return 1;
  if (u.endsWith(".webp")) return 2;
  if (u.endsWith(".avif")) return 9;
  return 5;
}

// “full” で10MB超え事故が多いので、基本は square/thumb 優先。
// 必要なら allowFull=1 で full も候補に入れる。
function pickImageUrlsFromPost(post: any, perPost: number, allowFull: boolean): string[] {
  const urls: string[] = [];

  // cover系（優先：square→pin→full）
  if (isHttpUrl(post.cover_square_url)) urls.push(post.cover_square_url);
  if (isHttpUrl(post.cover_pin_url)) urls.push(post.cover_pin_url);
  if (allowFull && isHttpUrl(post.cover_full_url)) urls.push(post.cover_full_url);

  // image_assets（例: [{square, full, pin, ...}, ...]）
  if (Array.isArray(post.image_assets)) {
    for (const a of post.image_assets) {
      if (!a || typeof a !== "object") continue;
      if (isHttpUrl(a.square)) urls.push(a.square);
      if (isHttpUrl(a.pin)) urls.push(a.pin);
      if (allowFull && isHttpUrl(a.full)) urls.push(a.full);
    }
  }

  // image_variants（例: [{thumb, full, ...}, ...]）
  if (Array.isArray(post.image_variants)) {
    for (const v of post.image_variants) {
      if (!v || typeof v !== "object") continue;
      if (isHttpUrl(v.thumb)) urls.push(v.thumb);
      if (allowFull && isHttpUrl(v.full)) urls.push(v.full);
    }
  }

  // image_urls（text[]）も見る（ただし full っぽいのは避けたいなら allowFull=false で）
  if (Array.isArray(post.image_urls)) {
    for (const u of post.image_urls) {
      if (!isHttpUrl(u)) continue;
      if (!allowFull) {
        // ざっくり “_full” を避ける（必要なら外してOK）
        if (/_full\./i.test(u)) continue;
      }
      urls.push(u);
    }
  }

  const u = uniq(urls);
  u.sort((a, b) => rankExt(a) - rankExt(b));
  return u.slice(0, perPost);
}

async function callVisionLabelDetection(imageUrls: string[], maxResults: number) {
  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(
    VISION_KEY
  )}`;

  const requests = imageUrls.map((url) => ({
    image: { source: { imageUri: url } },
    features: [{ type: "LABEL_DETECTION", maxResults }],
  }));

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Vision API error: ${resp.status} ${text}`);
  }

  return (await resp.json()) as {
    responses: Array<{
      labelAnnotations?: Array<{ description: string; score?: number; topicality?: number }>;
      error?: { message?: string };
    }>;
  };
}

// ✅ Translate v2 REST (API key)
async function translateToJa(texts: string[]) {
  const src = texts.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (src.length === 0) return [];

  const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
    TRANSLATE_KEY
  )}`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      q: src,
      target: "ja",
      format: "text",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Translate API error: ${resp.status} ${text}`);
  }

  const j = (await resp.json()) as {
    data?: { translations?: Array<{ translatedText: string }> };
  };

  const out = (j.data?.translations ?? []).map((x) =>
    String(x?.translatedText ?? "").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  );

  // 念のため長さ合わせ（APIが変な時の保険）
  while (out.length < src.length) out.push("");
  return out;
}

function aggregateTopLabels(perImage: Array<{ labels: VisionLabel[] }>) {
  const map = new Map<string, { description: string; maxScore: number; maxTopicality: number }>();

  for (const img of perImage) {
    for (const l of img.labels) {
      const key = l.description;
      if (!key) continue;
      const score = typeof l.score === "number" ? l.score : 0;
      const topicality = typeof l.topicality === "number" ? l.topicality : 0;
      const cur = map.get(key);
      if (!cur) map.set(key, { description: key, maxScore: score, maxTopicality: topicality });
      else {
        if (score > cur.maxScore) cur.maxScore = score;
        if (topicality > cur.maxTopicality) cur.maxTopicality = topicality;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.maxScore - a.maxScore);
}

function extractTopEn(top: Array<{ description: string }>, maxItems: number) {
  const en = top
    .map((x) => String(x.description ?? "").trim())
    .filter(Boolean);

  // 重複除去しつつ順序維持
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of en) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

export async function POST(req: Request) {
  // ✅ secretチェック
  const secret = req.headers.get("x-backfill-secret") || "";
  if (!BACKFILL_SECRET || secret !== BACKFILL_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "missing_supabase_env" }, 500);
  }
  if (!VISION_KEY) return json({ ok: false, error: "missing_vision_key" }, 500);
  if (!TRANSLATE_KEY) return json({ ok: false, error: "missing_translate_key" }, 500);

  const { searchParams } = new URL(req.url);

  const limit = Math.max(1, Math.min(200, toInt(searchParams.get("limit"), 50)));
  const perPost = Math.max(1, Math.min(20, toInt(searchParams.get("perPost"), 6)));
  const maxResults = Math.max(1, Math.min(50, toInt(searchParams.get("maxResults"), 12)));

  // 翻訳する“ユニーク英ラベル”上限（1投稿あたり）
  const maxTranslateItems = Math.max(1, Math.min(200, toInt(searchParams.get("maxTranslateItems"), 60)));

  const dryRun = searchParams.get("dryRun") === "1";
  const cursor = searchParams.get("cursor"); // created_at のカーソル（ISO）
  const allowFull = searchParams.get("allowFull") === "1"; // デフォルトfalse（10MB事故回避）

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 対象：
  //  A) image_labels が null
  //  B) versionが古い
  //  C) image_labels はあるが top_labels_ja が欠けてる
  let q = supabase
    .from("posts")
    .select(
      "id, created_at, image_labels, image_label_version, cover_full_url, cover_square_url, cover_pin_url, image_urls, image_assets, image_variants"
    )
    .or(
      [
        "image_labels.is.null",
        `image_label_version.lt.${LABEL_VERSION}`,
        // top_labels_ja が無いもの
        "image_labels->top_labels_ja.is.null",
      ].join(",")
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt("created_at", cursor);

  const { data: posts, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  const results: any[] = [];
  let nextCursor: string | null = null;

  for (const post of posts ?? []) {
    nextCursor = post.created_at ?? nextCursor;

    try {
      const urls = pickImageUrlsFromPost(post, perPost, allowFull);

      if (urls.length === 0) {
        results.push({
          id: post.id,
          ok: true,
          skipped: true,
          reason: "no_images",
          dryRun,
        });
        continue;
      }

      const picked = urls[0] ?? null;

      // 1) Vision
      const vision = await callVisionLabelDetection(urls, maxResults);

      const perImage = urls.map((url, i) => {
        const labels: VisionLabel[] = (vision.responses?.[i]?.labelAnnotations ?? [])
          .map((a) => ({
            description: String(a.description ?? "").trim(),
            score: typeof a.score === "number" ? a.score : Number(a.score ?? 0),
            topicality: typeof a.topicality === "number" ? a.topicality : Number(a.topicality ?? 0),
          }))
          .filter((x) => x.description);

        const err = vision.responses?.[i]?.error?.message ?? null;
        return { url, labels, error: err };
      });

      const top = aggregateTopLabels(perImage).slice(0, 30);
      const imageErrors = perImage.filter((x) => x.error).length;

      // 2) Translate（top英ラベルを日本語へ）
      //    失敗してもラベル自体は保存したいので、翻訳だけ try/catch 分離
      let topEn: string[] = extractTopEn(top, maxTranslateItems);
      let topJa: string[] = [];

      try {
        const ja = await translateToJa(topEn);
        topJa = ja.map((x) => String(x ?? "").trim());
      } catch (te: any) {
        // 翻訳だけ落ちたら、エラーを結果に載せつつ続行
        results.push({
          id: post.id,
          ok: false,
          stage: "translate",
          error: String(te?.message ?? te),
          dryRun,
        });
        // ただし、後段でlabels本体は保存（＝translate失敗でもlabelは埋めたい）したいなら
        // ここで topJa = [] のまま続行させる
      }

      const labeledAt = new Date().toISOString();

      const payload = {
        provider: "google_cloud_vision_rest",
        version: LABEL_VERSION,
        labeled_at: labeledAt,
        picked,
        images: perImage,
        top_labels: top,                 // [{description,maxScore,maxTopicality}, ...]
        top_labels_en: topEn,            // ["Food", ...]
        top_labels_ja: topJa,            // ["食べ物", ...]
        top_labels_ja_text: topJa.join(" "), // 検索用：スペース連結
      };

      if (!dryRun) {
        const { error: upErr } = await supabase
          .from("posts")
          .update({
            image_labels: payload,
            image_labeled_at: labeledAt,
            image_label_version: LABEL_VERSION,
          })
          .eq("id", post.id);

        if (upErr) throw new Error(upErr.message);
      }

      results.push({
        id: post.id,
        ok: true,
        dryRun,
        images_count: urls.length,
        picked,
        image_errors: imageErrors,
        top_labels: top.slice(0, 8),
        top_labels_ja: topJa.slice(0, 8),
        image_error_samples: perImage
          .filter((x) => x.error)
          .slice(0, 2)
          .map((x) => ({ url: x.url, error: x.error })),
      });
    } catch (e: any) {
      results.push({ id: post.id, ok: false, error: String(e?.message ?? e), dryRun });
    }
  }

  return json({
    ok: true,
    scanned: posts?.length ?? 0,
    processed: results.length,
    updated: dryRun ? 0 : results.filter((r) => r.ok).length,
    limit,
    perPost,
    maxResults,
    maxTranslateItems,
    allowFull,
    dryRun,
    nextCursor,
    results,
  });
}

