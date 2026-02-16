// src/app/api/vision/translate-missing-labels-ja/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TranslationServiceClient } from "@google-cloud/translate";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BACKFILL_SECRET = process.env.BACKFILL_SECRET!;

// Cloud Translate v3
const GCP_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID!; // ★設定必要
// GOOGLE_APPLICATION_CREDENTIALS はローカルなら .env.local でパス指定 or gcloud auth application-default login

const LABEL_VERSION_AFTER_TRANSLATE = 3;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function toInt(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

type TopLabel = { description?: string; maxScore?: number; maxTopicality?: number };

function pickEnglishLabelTexts(imageLabels: any, maxItems: number) {
  const arr = imageLabels?.top_labels;
  if (!Array.isArray(arr)) return [];
  const texts = arr
    .map((x: TopLabel) => (typeof x?.description === "string" ? x.description.trim() : ""))
    .filter((s: string) => s.length > 0);
  // 重複除去（順序維持）
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const t of texts) {
    if (!seen.has(t)) {
      seen.add(t);
      uniq.push(t);
    }
    if (uniq.length >= maxItems) break;
  }
  return uniq;
}

async function translateToJa(texts: string[]) {
  if (texts.length === 0) return [];
  const client = new TranslationServiceClient();

  const parent = `projects/${GCP_PROJECT_ID}/locations/global`;

  const [resp] = await client.translateText({
    parent,
    contents: texts,
    mimeType: "text/plain",
    sourceLanguageCode: "en",
    targetLanguageCode: "ja",
  });

  const out: string[] = [];
  for (const t of resp.translations ?? []) {
    out.push((t.translatedText ?? "").trim());
  }
  return out;
}

export async function POST(req: Request) {
  // auth
  const secret = req.headers.get("x-backfill-secret") || "";
  if (!BACKFILL_SECRET || secret !== BACKFILL_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "missing_supabase_env" }, 500);
  }
  if (!GCP_PROJECT_ID) {
    return json({ ok: false, error: "missing_google_cloud_project_id" }, 500);
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, toInt(searchParams.get("limit"), 50)));
  const maxItems = Math.max(1, Math.min(50, toInt(searchParams.get("maxItems"), 16)));
  const dryRun = searchParams.get("dryRun") === "1";
  const cursor = searchParams.get("cursor"); // created_at ISO

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Bだけ対象：top_labels_ja が無い
  let q = supabase
    .from("posts")
    .select("id, created_at, image_labels, image_label_version")
    .not("image_labels", "is", null)
    .is("image_labels->top_labels_ja", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt("created_at", cursor);

  const { data: posts, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  const results: any[] = [];
  let nextCursor: string | null = null;

  for (const p of posts ?? []) {
    nextCursor = p.created_at ?? nextCursor;

    try {
      const imageLabels = p.image_labels;
      const en = pickEnglishLabelTexts(imageLabels, maxItems);

      // top_labels すら無いならスキップ
      if (en.length === 0) {
        results.push({ id: p.id, ok: true, skipped: true, reason: "no_top_labels" });
        continue;
      }

      const ja = await translateToJa(en);

      if (!dryRun) {
        // image_labels JSONに top_labels_ja を後付け（他のキーは保持）
        const merged = {
          ...imageLabels,
          top_labels_ja: ja,
          translated_at: new Date().toISOString(),
        };

        const { error: upErr } = await supabase
          .from("posts")
          .update({
            image_labels: merged,
            image_label_version: LABEL_VERSION_AFTER_TRANSLATE,
          })
          .eq("id", p.id);

        if (upErr) throw new Error(upErr.message);
      }

      results.push({ id: p.id, ok: true, en_count: en.length, ja_sample: ja.slice(0, 8) });
    } catch (e: any) {
      results.push({ id: p.id, ok: false, error: String(e?.message ?? e) });
    }
  }

  return json({ ok: true, processed: results.length, limit, maxItems, dryRun, nextCursor, results });
}
