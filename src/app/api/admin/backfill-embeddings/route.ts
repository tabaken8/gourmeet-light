// src/app/api/admin/backfill-embeddings/route.ts
// 既存投稿の embedding を一括生成する管理エンドポイント
// GET  → 進捗確認
// POST → バックフィル実行（バッチ単位）
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { buildEmbeddingText, generateEmbedding, toVectorString } from "@/lib/embedding";

// RLS をバイパスするサービスロールクライアント（サーバーサイド専用）
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

export const runtime = "nodejs";
export const maxDuration = 300; // 5分

const BATCH_SIZE = 20; // 1回のリクエストで処理する件数
const DELAY_MS = 60; // OpenAI レート制限対策

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- GET: 進捗確認 ----------
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = getAdminClient();
  const [{ count: total }, { count: done }] = await Promise.all([
    admin.from("posts").select("*", { count: "exact", head: true }),
    admin.from("posts").select("*", { count: "exact", head: true }).not("embedding", "is", null),
  ]);

  return NextResponse.json({
    ok: true,
    total: total ?? 0,
    done: done ?? 0,
    pending: (total ?? 0) - (done ?? 0),
  });
}

// ---------- POST: バックフィル ----------
export async function POST(req: Request) {
  // ログイン確認（誰でも叩けないように）
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  // 実際の DB 操作はサービスロール（RLS バイパス）
  const admin = getAdminClient();

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(100, Math.max(1, Number(body?.limit ?? BATCH_SIZE)));

  // embedding がまだない投稿を取得（全ユーザー分）
  const { data: posts, error: fetchErr } = await admin
    .from("posts")
    .select("id, user_id, content, place_id, place_name")
    .is("embedding", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }
  if (!posts?.length) {
    return NextResponse.json({ ok: true, processed: 0, message: "全件処理済みです" });
  }

  // place_id を一括取得
  const placeIds = [...new Set(posts.map((p) => p.place_id).filter(Boolean))] as string[];
  const placeMap: Record<string, { primary_genre: string | null; area_label_ja: string | null }> = {};

  if (placeIds.length) {
    const { data: places } = await admin
      .from("places")
      .select("place_id, primary_genre, area_label_ja")
      .in("place_id", placeIds);

    for (const pl of places ?? []) {
      placeMap[(pl as any).place_id] = {
        primary_genre: (pl as any).primary_genre ?? null,
        area_label_ja: (pl as any).area_label_ja ?? null,
      };
    }
  }

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const post of posts) {
    try {
      const place = post.place_id ? (placeMap[post.place_id] ?? null) : null;

      const text = buildEmbeddingText({
        content: post.content,
        place_name: post.place_name,
        primary_genre: place?.primary_genre ?? null,
        area_label_ja: place?.area_label_ja ?? null,
      });

      if (!text.trim()) {
        // テキストが空の投稿はゼロベクトルで埋めてスキップ扱いにする
        // （embedding is null のままにすると無限ループになるため）
        const zeroVec = JSON.stringify(new Array(1536).fill(0));
        await admin.from("posts").update({ embedding: zeroVec } as any).eq("id", post.id);
        skipped++;
        continue;
      }

      const embedding = await generateEmbedding(text);

      const { error: upErr } = await admin
        .from("posts")
        .update({ embedding: toVectorString(embedding) } as any)
        .eq("id", post.id);

      if (upErr) throw upErr;

      processed++;
      await sleep(DELAY_MS);
    } catch (e: any) {
      errors.push(`${post.id}: ${e?.message ?? e}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    errors: errors.length ? errors : undefined,
    // バッチが limit 件取れた かつ 何か処理できた場合のみ hasMore: true
    hasMore: posts.length === limit && processed > 0,
  });
}
