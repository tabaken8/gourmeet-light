// src/app/api/search/ai-chat/route.ts
// LLM + Tool Use による Grok スタイルの AI 検索エンドポイント
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  AI_SEARCH_TOOLS,
  ToolContext,
  enrichCollectedPosts,
  executeTool,
} from "@/lib/aiSearchTools";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `あなたは飲食店投稿SNS「Gourmeet」の検索AIです。
ユーザーの自然言語クエリを理解し、適切なツールを組み合わせて投稿を検索してください。

【ツール呼び出しのルール】
- クエリに地名・エリア名が含まれる → resolve_station を先に呼ぶ
- クエリに @mention が含まれる → resolve_username を先に呼ぶ
- 「僕と合いそう」「私の好みに近い」などの個人化要求 → get_my_taste_profile を先に呼び、search_posts で use_taste_profile: true にする
- 「おすすめ度順」「評価順」→ search_posts の sort_by を "recommend_score" にする
- 「新着順」「最近の」→ sort_by を "newest" にする
- 結果が0件だったとき → 条件を緩めて（半径を広げる・閾値を下げる）再度 search_posts を呼ぶ

【返答のルール】
- 最終メッセージは日本語で2〜3文、簡潔に
- 見つかった件数と主な特徴（エリア・ジャンル・雰囲気）を伝える
- 0件のときは「条件を変えるとよいかも」など提案を添える
- embeddings や内部処理の話はしない
- ユーザーへの質問返しはしない（一度で答えを出す）`;

const MAX_ITERATIONS = 6; // 無限ループ防止

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const q = (body.q ?? "").trim();
    const followOnly = body.follow === true || body.follow === "1";
    // 会話履歴（フォローアップ検索に使う、将来拡張用）
    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      Array.isArray(body.history) ? body.history : [];

    if (!q) {
      return NextResponse.json({ ok: false, error: "q is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // リクエストスコープのコンテキスト
    const ctx: ToolContext = {
      supabase,
      userId: user.id,
      tasteEmbedding: null,
      collectedPosts: [],
      detectedStation: null,
      detectedAuthor: null,
    };

    // ---- tool calling ループ ----
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: followOnly ? `${q}（フォロー中のユーザーの投稿に絞る）` : q },
    ];

    let finalMessage = "";
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: AI_SEARCH_TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
      });

      const choice = response.choices[0];
      const msg = choice.message;
      messages.push(msg);

      // ツール呼び出しがなければ終了
      if (!msg.tool_calls?.length) {
        finalMessage = msg.content ?? "";
        break;
      }

      // 各ツールを実行してレスポンスを積む
      for (const toolCall of msg.tool_calls) {
        let toolResult: unknown;
        try {
          const tc = toolCall as any;
          const args = JSON.parse(tc.function?.arguments ?? "{}");
          toolResult = await executeTool(tc.function?.name ?? "", args, ctx);
        } catch (e: any) {
          toolResult = { error: e?.message ?? "ツール実行エラー" };
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    // ---- 後処理: プロフィール + 最寄り駅を付与 ----
    const enrichedPosts = await enrichCollectedPosts(ctx.collectedPosts, supabase);

    return NextResponse.json({
      ok: true,
      message: finalMessage,
      posts: enrichedPosts,
      detectedStation: ctx.detectedStation,
      detectedAuthor: ctx.detectedAuthor,
    });
  } catch (e: any) {
    console.error("[ai-chat] unhandled:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
