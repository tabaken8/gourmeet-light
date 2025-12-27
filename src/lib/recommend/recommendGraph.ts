import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { DEMO_RESTAURANTS, DemoRestaurant } from "./demoRestaurants";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * OpenAIに「理解した条件」と「選んだ店」を構造化で返させる
 */
const RecommendOutput = z.object({
  understood: z.object({
    summary: z.string(),                 // 「静かでデート向き、東京エリア…」みたいな一文
    extracted_tags: z.array(z.string()), // UIでチップ表示する用
  }),
  results: z.array(
    z.object({
      id: z.string(),
      headline: z.string(),              // 店名 + 一言
      subline: z.string(),               // エリア/ジャンル/価格 など
      reason: z.string(),                // なぜ合うか（短く）
      match_score: z.number().min(0).max(100),
    })
  ),
});

type RecommendOutputType = z.infer<typeof RecommendOutput>;

/**
 * LangGraph state
 */
const RecommendState = Annotation.Root({
  query: Annotation<string>,
  maxResults: Annotation<number>,
  candidates: Annotation<DemoRestaurant[]>,
  output: Annotation<RecommendOutputType | null>,
});

type RecommendStateType = typeof RecommendState.State;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildCandidateText(items: DemoRestaurant[]) {
  // LLMに渡す用：余計な情報を削って短く
  return items.map(r => ({
    id: r.id,
    name: r.name,
    area: r.area,
    genre: r.genre,
    price: r.price,
    tags: r.tags,
    lat: r.lat,
    lng: r.lng,
  }));
}

/**
 * Node 1: 候補の準備（MVPなので固定10件、将来はSupabase検索に差し替え）
 */
async function prepareCandidates(state: RecommendStateType) {
  return { candidates: DEMO_RESTAURANTS };
}

/**
 * Node 2: LLMで意図理解→最大N件を選抜して理由付け
 */
async function llmPick(state: RecommendStateType) {
  if (!process.env.OPENAI_API_KEY) {
    // dev fallback（キー無しでも動く）
    const n = clamp(state.maxResults ?? 3, 1, 5);
    const picked = state.candidates.slice(0, n);
    return {
      output: {
        understood: {
          summary: "（DEV）おすすめ候補を表示します",
          extracted_tags: ["DEV", "サンプル"],
        },
        results: picked.map((r, i) => ({
          id: r.id,
          headline: `${r.name}`,
          subline: `${r.area} / ${r.genre} / ${r.price}`,
          reason: `（DEV）タグ: ${r.tags.slice(0, 3).join("・")}`,
          match_score: 80 - i * 5,
        })),
      },
    };
  }

  const maxResults = clamp(state.maxResults ?? 3, 1, 5);
  const candidates = buildCandidateText(state.candidates);

  const response = await openai.responses.parse({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: [
          "You are Gourmeet's restaurant recommendation brain.",
          "Given the user's Japanese query and a small list of candidate restaurants, select up to N items.",
          "Return UI-ready short text. Do not invent restaurants not in the list.",
          "Keep reasons compact and helpful.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            user_query: state.query,
            max_results: maxResults,
            candidates,
            output_rules: {
              results_count: `1..${maxResults}`,
              match_score: "0..100 (relative within this batch)",
              writing_style: "Japanese, concise, slightly premium UI tone",
            },
          },
          null,
          2
        ),
      },
    ],
    text: {
      format: zodTextFormat(RecommendOutput, "recommend_output"),
    },
  });

  return { output: response.output_parsed };
}

/**
 * Graph compile
 */
export const recommendGraph = new StateGraph(RecommendState)
  .addNode("prepareCandidates", prepareCandidates)
  .addNode("llmPick", llmPick)
  .addEdge(START, "prepareCandidates")
  .addEdge("prepareCandidates", "llmPick")
  .addEdge("llmPick", END)
  .compile();

/**
 * helper
 */
export async function runRecommend(query: string, maxResults: number) {
  const result = await recommendGraph.invoke({
    query,
    maxResults,
    candidates: [],
    output: null,
  });
  return result.output!;
}
