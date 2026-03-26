// src/app/api/posts/[id]/embed/route.ts
// 投稿1件の埋め込みベクトルを生成して posts.embedding に保存する
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEmbeddingText, generateEmbedding, toVectorString } from "@/lib/embedding";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 投稿 + 店舗情報を同時取得
    const { data: post } = await supabase
      .from("posts")
      .select("id, user_id, content, place_id, place_name")
      .eq("id", id)
      .maybeSingle();

    if (!post) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (post.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // 店舗メタデータ取得
    let primary_genre: string | null = null;
    let area_label_ja: string | null = null;

    if (post.place_id) {
      const { data: place } = await supabase
        .from("places")
        .select("primary_genre, area_label_ja")
        .eq("place_id", post.place_id)
        .maybeSingle();
      primary_genre = place?.primary_genre ?? null;
      area_label_ja = place?.area_label_ja ?? null;
    }

    const text = buildEmbeddingText({
      content: post.content,
      place_name: post.place_name,
      primary_genre,
      area_label_ja,
    });

    if (!text.trim()) {
      return NextResponse.json({ ok: true, skipped: true, reason: "empty text" });
    }

    const embedding = await generateEmbedding(text);

    const { error: updateErr } = await supabase
      .from("posts")
      .update({ embedding: toVectorString(embedding) } as any)
      .eq("id", id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[posts/embed] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
