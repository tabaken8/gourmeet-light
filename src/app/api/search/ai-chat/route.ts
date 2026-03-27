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
- クエリに地名・エリア名が1つ含まれる → resolve_station を呼ぶ
- 「東京駅か渋谷駅」のように複数エリアが含まれる → resolve_station を地名ごとに複数回呼び、得た station_place_id をすべて配列にまとめて search_posts の station_place_ids に渡す（OR条件）
- クエリに @mention が含まれる → resolve_username を先に呼ぶ
- 「僕と合いそう」「私の好みに近い」などの個人化要求 → get_my_taste_profile を先に呼び、search_posts で use_taste_profile: true にする
- 「おすすめ度順」「評価順」→ search_posts の sort_by を "recommend_score" にする
- 「新着順」「最近の」→ sort_by を "newest" にする
- 結果が0件だったとき → 条件を緩めて（半径を広げる・閾値を下げる）再度 search_posts を呼ぶ
- 返ってきた posts_summary の place_name・genre・content_snippet を確認し、クエリと明らかに合致しない投稿（カフェを探しているのに焼肉や寿司ばかり）がほとんどの場合は「条件に合う投稿が見つかりませんでした」として扱い、フォロー外も含めた再検索を提案する

【返答のルール】
- 最終メッセージは日本語で簡潔に（長くなりすぎない）
- 件数と主なエリア・ジャンルを伝える（エリアが特定できない場合は無理に書かない）
- 目立つ投稿は「poster_name さんの『place_name』（おすすめ度 X/10）："content_snippet"」のように投稿者名・おすすめ度・投稿本文の一部を引用して紹介する（1〜3件程度）
- 0件のときは「条件を変えるとよいかも」など提案を添える
- マークダウン記法（**bold**、## 見出し、箇条書きの - など）は絶対に使わない。普通の文章で書く
- embeddings や内部処理の話はしない
- ユーザーへの質問返しはしない（一度で答えを出す）`;

const REWRITE_SYSTEM_PROMPT = `あなたはグルメSNS「Gourmeet」のAIアシスタントです。
渡されたテキストを、友人に話しかけるような自然な日本語に書き直してください。

ルール：
- マークダウン記号（**、##、-など）は使わない
- 体言止めを適度に使ってよい
- 「〜となっています」「〜となります」のような堅い言い回しは避ける
- 元の情報（店名・投稿者名・おすすめ度・引用文）は省略せず残す
- 紹介する投稿には「1位は〜」「2位は〜」のように順位をつける
- 長さは元のテキストと同程度にまとめる`;

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
      followOnly,
      tasteEmbedding: null,
      collectedPosts: [],
      detectedStations: [],
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

    // ---- rewrite 層: 自然な文体に書き直す ----
    let naturalMessage = finalMessage;
    if (finalMessage) {
      try {
        const rewriteRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: REWRITE_SYSTEM_PROMPT },
            { role: "user", content: finalMessage },
          ],
          max_tokens: 400,
          temperature: 0.4,
        });
        naturalMessage = rewriteRes.choices[0]?.message?.content ?? finalMessage;
      } catch {
        // rewrite 失敗しても元のメッセージで続行
      }
    }

    // ---- 後処理: プロフィール + 最寄り駅を付与 ----
    const enrichedPosts = await enrichCollectedPosts(ctx.collectedPosts, supabase);

    return NextResponse.json({
      ok: true,
      message: naturalMessage,
      posts: enrichedPosts,
      detectedStations: ctx.detectedStations,
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
