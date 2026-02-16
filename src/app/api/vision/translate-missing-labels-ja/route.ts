import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BACKFILL_SECRET = process.env.BACKFILL_SECRET!;

// v2 Translate API (API key)
const TRANSLATE_KEY =
  process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY ||
  process.env.GOOGLE_CLOUD_VISION_API_KEY || // 兼用したい場合のフォールバック
  "";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function toInt(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => (s ?? "").trim()).filter(Boolean)));
}

/**
 * posts.image_labels.top_labels[*].description (英語) を日本語に翻訳して
 * posts.image_labels.top_labels_ja (string[]) を埋める。
 *
 * 条件:
 * - image_labels がある
 * - top_labels が配列である
 * - top_labels_ja が無い/空/配列じゃない
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-backfill-secret") || "";
  if (!BACKFILL_SECRET || secret !== BACKFILL_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "missing_supabase_env" }, 500);
  }
  if (!TRANSLATE_KEY) {
    return json({ ok: false, error: "missing_translate_api_key" }, 500);
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, toInt(searchParams.get("limit"), 30)));
  const maxItems = Math.max(1, Math.min(64, toInt(searchParams.get("maxItems"), 16)));
  const dryRun = searchParams.get("dryRun") === "1";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 「top_labelsはあるのに top_labels_ja が無い」っぽい投稿を拾う
  // NOTE: jsonbの型崩れもあるので、ここは緩めに取得してアプリ側で判定
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, image_labels, image_label_version, image_labeled_at")
    .not("image_labels", "is", null)
    .order("image_labeled_at", { ascending: false })
    .limit(limit);

  if (error) return json({ ok: false, error: error.message }, 500);

  const results: any[] = [];
  let processed = 0;
  let updated = 0;

  for (const p of posts ?? []) {
    const labels = p.image_labels as any;

    const topLabels: any[] = Array.isArray(labels?.top_labels) ? labels.top_labels : [];
    const existingJa = labels?.top_labels_ja;

    const need =
      topLabels.length > 0 &&
      !(Array.isArray(existingJa) && existingJa.filter(Boolean).length > 0);

    if (!need) continue;

    processed++;

    // 翻訳対象（英語ラベル）
    const en = uniq(
      topLabels
        .map((x) => (typeof x?.description === "string" ? x.description : ""))
        .slice(0, maxItems)
    );

    if (en.length === 0) {
      results.push({ id: p.id, ok: true, skipped: true, reason: "no_top_labels" });
      continue;
    }

    try {
      // Google Translate v2
      const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
        TRANSLATE_KEY
      )}`;

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          q: en,
          target: "ja",
          format: "text",
        }),
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`Translate API error: ${resp.status} ${t}`);
      }

      const js = (await resp.json()) as any;
      const translated: string[] =
        js?.data?.translations?.map((x: any) => String(x?.translatedText ?? "").trim()) ?? [];

      // 念のため長さ合わせ（ズレたらfallback）
      const ja =
        translated.length === en.length
          ? translated
          : en.map((s, i) => translated[i] ?? s);

      if (!dryRun) {
        const next = {
          ...(labels ?? {}),
          top_labels_ja: ja,
          top_labels_ja_source: "google_translate_v2",
          top_labels_ja_at: new Date().toISOString(),
        };

        const { error: upErr } = await supabase
          .from("posts")
          .update({ image_labels: next })
          .eq("id", p.id);

        if (upErr) throw new Error(upErr.message);
        updated++;
      }

      results.push({
        id: p.id,
        ok: true,
        dryRun,
        en,
        ja,
      });
    } catch (e: any) {
      results.push({ id: p.id, ok: false, error: String(e?.message ?? e) });
    }
  }

  return json({
    ok: true,
    scanned: (posts ?? []).length,
    processed,
    updated,
    limit,
    maxItems,
    dryRun,
    results,
  });
}
