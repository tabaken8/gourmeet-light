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
import { parseSearchQuery } from "@/lib/parseSearchQuery";

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
- **重要**: クエリからジャンル（和食、ラーメン、カフェ、イタリアン、寿司、焼肉、中華、フレンチ、居酒屋、韓国料理、海鮮、蕎麦、うどん、スイーツ 等）が読み取れる場合、search_posts の genre パラメータに必ずそのジャンルを指定すること。genre を指定しないと、類似度の低い別ジャンルの投稿が混ざる原因になる
- 返ってきた posts_summary の similarity スコアを確認する。similarity が 0.3 以上の投稿のみを「マッチした結果」とみなす。similarity が 0.3 未満の投稿しかない場合は「条件に合う投稿は見つかりませんでした」とする
- 結果が0件だったとき → まず条件を緩めて再検索する前に、「見つかりませんでした」と判断し、フォールバック提案を行う
- フォールバック: ジャンル指定ありで0件 → station_place_ids を外して genre と query のみで search_posts を再度呼び、「渋谷にはラーメンの投稿がありませんが、他のエリアではこんなラーメン投稿があります」と紹介する。この際 station_place_ids は省略し全エリアから探す
- 返ってきた posts_summary の place_name・genre・content_snippet を確認し、クエリと明らかに合致しない投稿（カフェを探しているのに焼肉や寿司ばかり）がほとんどの場合は「条件に合う投稿が見つかりませんでした」として扱い、上記フォールバックを行う
- フォールバック結果は「マッチ結果」とは明確に区別し、「参考として」「代わりに」などの前置きを添える

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
    // フロントのジャンルチップで明示選択されたジャンル（テキストとは独立）
    const explicitGenre = (body.genre ?? "").trim();
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
      searchIntent: null,
    };

    // ---- クエリ解析 → location を事前解決 ----
    // LLM が resolve_station を呼び忘れると全国検索になるバグの防止
    const parsed = await parseSearchQuery(q);
    let preResolvedHint = "";
    if (parsed.location) {
      const stationResult = await executeTool("resolve_station", { location: parsed.location }, ctx);
      const sr = stationResult as any;
      if (sr?.found) {
        // contextに事前解決済みの駅を設定（LLMが渡し忘れても searchPosts で自動注入）
        ctx.preResolvedStationPlaceIds = [sr.station_place_id];
        preResolvedHint =
          `\n\n【事前解決済み】クエリ内の地名「${parsed.location}」→ station_place_id="${sr.station_place_id}" (${sr.station_name})。` +
          `search_posts を呼ぶとき、station_place_ids にこの値を必ず含めること。resolve_station を改めて呼ぶ必要はない。`;
      }
    }

    // ---- ジャンル決定 ----
    // 優先順位: 1. チップで明示選択されたジャンル → 2. テキストから自動検出
    const KNOWN_GENRES = ["和食","ラーメン","カフェ","イタリアン","寿司","焼肉","中華","フレンチ","居酒屋","韓国料理","海鮮","蕎麦","うどん","スイーツ","焼き鳥","天ぷら","鍋","とんかつ"];
    let finalGenre = "";
    if (explicitGenre) {
      // チップで明示選択されたジャンルを最優先
      finalGenre = explicitGenre;
    } else {
      // テキストからジャンル名を自動検出
      const detectedGenre = KNOWN_GENRES.find(g =>
        (parsed.intent && parsed.intent.includes(g)) || q.includes(g)
      );
      if (detectedGenre) finalGenre = detectedGenre;
    }
    if (finalGenre) {
      ctx.preResolvedGenre = finalGenre;
      preResolvedHint += `\n【ジャンル検出済み】「${finalGenre}」で絞り込む。search_posts の genre パラメータに必ず「${finalGenre}」を指定すること。`;
    }

    // ---- tool calling ループ ----
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT + preResolvedHint },
      ...history,
      { role: "user", content: [
        explicitGenre && !q.includes(explicitGenre) ? `${explicitGenre} ${q}` : q,
        followOnly ? "（フォロー中のユーザーの投稿に絞る）" : "",
      ].filter(Boolean).join("") },
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
    const enrichedPosts = await enrichCollectedPosts(ctx.collectedPosts, supabase, user.id);

    return NextResponse.json({
      ok: true,
      message: naturalMessage,
      posts: enrichedPosts,
      detectedStations: ctx.detectedStations,
      detectedAuthor: ctx.detectedAuthor,
      parsedQuery: {
        intent: ctx.searchIntent,
        location: parsed.location ?? null,
        genre: finalGenre || (parsed.intent !== parsed.location ? parsed.intent : null),
      },
    });
  } catch (e: any) {
    console.error("[ai-chat] unhandled:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
