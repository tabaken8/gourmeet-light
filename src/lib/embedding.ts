// src/lib/embedding.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 1件の投稿から「埋め込み対象テキスト」を構築する。
 * エリア・ジャンル・店名・本文の順で並べることで、
 * 「渋谷 イタリアン「リストランテ山田」パスタが絶品でした」のような形に。
 */
export function buildEmbeddingText(params: {
  content: string | null;
  place_name: string | null;
  primary_genre: string | null;
  area_label_ja: string | null;
}): string {
  const { content, place_name, primary_genre, area_label_ja } = params;
  const parts: string[] = [];
  if (area_label_ja) parts.push(area_label_ja);
  if (primary_genre) parts.push(primary_genre);
  if (place_name) parts.push(`「${place_name}」`);
  if (content?.trim()) parts.push(content.trim());
  return parts.join(" ");
}

/**
 * テキスト → 1536次元の埋め込みベクトル (text-embedding-3-small)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000), // モデルの上限に合わせてトリム
    encoding_format: "float",
  });
  return res.data[0].embedding;
}

/**
 * Supabase の vector カラムへ書き込む文字列形式に変換
 * PostgreSQL の vector 型は "[0.1,0.2,...]" を受け付ける
 */
export function toVectorString(embedding: number[]): string {
  return JSON.stringify(embedding);
}
