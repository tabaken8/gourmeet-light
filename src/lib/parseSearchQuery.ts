// src/lib/parseSearchQuery.ts
// GPT-4o-mini を使って検索クエリから「場所」と「検索意図」を分離する
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ParsedQuery {
  /** 地名・駅名・エリア名 (例: "渋谷", "東京駅", "恵比寿") — 含まれなければ null */
  location: string | null;
  /** @mention のユーザー名 (@ なし, 例: "hogehoge") — 含まれなければ null */
  mention: string | null;
  /** 場所・メンションを除いた検索意図 (例: "デートディナーに使えそうな店") */
  intent: string;
}

/**
 * 自然言語クエリを {location, mention, intent} に分解する。
 * エラー時は location: null, mention: null, intent: クエリ全体 にフォールバックする。
 */
export async function parseSearchQuery(query: string): Promise<ParsedQuery> {
  const q = query.trim();
  if (!q) return { location: null, mention: null, intent: "" };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `飲食店の投稿検索アプリで使われる日本語クエリを解析してください。
クエリに含まれる「場所」「@メンション」「検索意図」を分離してJSON形式で返してください。

ルール:
- location: 駅名・地名・エリア名のみ（"近く"や"周辺"などの修飾語は含めない）。なければnull
- mention: @username 形式のユーザー名（@マークを除いた部分のみ）。なければnull
- intent: 場所・メンションを取り除いた残りの検索意図。クエリに場所だけしかない場合はlocationをそのまま入れる
- JSON以外は絶対に返さない

例:
- "渋谷でデートに使えるイタリアン" → {"location":"渋谷","mention":null,"intent":"デートに使えるイタリアン"}
- "@alice の東京駅近くのカフェ" → {"location":"東京駅","mention":"alice","intent":"カフェ"}
- "@hogehoge さんがおすすめしてる店" → {"location":null,"mention":"hogehoge","intent":"おすすめの店"}
- "記念日に使えるフレンチ" → {"location":null,"mention":null,"intent":"記念日に使えるフレンチ"}
- "恵比寿" → {"location":"恵比寿","mention":null,"intent":"恵比寿"}`,
        },
        {
          role: "user",
          content: q,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 100,
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const location =
      typeof parsed.location === "string" && parsed.location.trim()
        ? parsed.location.trim()
        : null;
    const mention =
      typeof parsed.mention === "string" && parsed.mention.trim()
        ? parsed.mention.trim().replace(/^@/, "") // 念のため @ を除去
        : null;
    const intent =
      typeof parsed.intent === "string" && parsed.intent.trim()
        ? parsed.intent.trim()
        : q; // フォールバック: クエリ全体

    return { location, mention, intent };
  } catch {
    // LLM呼び出しやJSONパースに失敗してもクラッシュさせない
    return { location: null, mention: null, intent: q };
  }
}
