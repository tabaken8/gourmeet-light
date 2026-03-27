// src/lib/aiSearchTools.ts
// AI検索で使うツールの定義 + 実行ロジック

import type OpenAI from "openai";
import { generateEmbedding } from "@/lib/embedding";

// ============================================================
// ツールスキーマ（OpenAI function calling 形式）
// ============================================================

export const AI_SEARCH_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "resolve_username",
      description:
        "@mention のユーザー名から user_id とプロフィール情報を取得する。" +
        "@xxx が含まれる場合は必ずこれを先に呼ぶ。",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "@なしのユーザー名（例: alice）",
          },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_station",
      description:
        "地名・エリア名・駅名から station_place_id を取得する。" +
        "クエリに地名が含まれる場合は必ずこれを先に呼ぶ。",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "地名または駅名（例: 渋谷, 東京駅, 恵比寿）",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_taste_profile",
      description:
        "現在のユーザーの好みプロファイルを取得する。" +
        "「僕と合いそう」「私の好みに近い」「私が好きそうな」といった" +
        "パーソナライズ要求があるときは必ずこれを先に呼ぶ。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_posts",
      description:
        "飲食店の投稿を検索する。" +
        "resolve_username / resolve_station / get_my_taste_profile を先に呼んで得た情報をここに渡す。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "検索意図・キーワード（地名・@mention は除いた純粋な意図）。" +
              "get_my_taste_profile を使う場合でも何か書くこと（例: 'パーソナライズ検索'）",
          },
          author_id: {
            type: "string",
            description: "resolve_username で得た user_id（特定ユーザーに絞る場合）",
          },
          station_place_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "resolve_station で得た station_place_id の配列。" +
              "「東京駅か渋谷駅」のように複数エリアの OR 条件も指定できる。",
          },
          radius_m: {
            type: "number",
            description: "駅からの検索半径（メートル、デフォルト3000）",
          },
          genre: {
            type: "string",
            description: "ジャンル絞り込み（例: イタリアン、カフェ）",
          },
          sort_by: {
            type: "string",
            enum: ["similarity", "recommend_score", "newest"],
            description:
              "ソート順。similarity=意味的な近さ順（デフォルト）、" +
              "recommend_score=おすすめ度順、newest=新着順",
          },
          use_taste_profile: {
            type: "boolean",
            description:
              "true にすると get_my_taste_profile の結果を query の代わりに使う。" +
              "パーソナライズ検索時に指定する。",
          },
          limit: {
            type: "number",
            description: "取得件数（デフォルト20、最大40）",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ============================================================
// リクエストスコープのコンテキスト（ツール間でデータを共有）
// ============================================================

export type ToolContext = {
  supabase: any;
  userId: string;
  // フォロー中ユーザーの投稿のみに絞るか（UI のチェックボックスから来る）
  followOnly: boolean;
  // get_my_taste_profile の結果（search_posts で use_taste_profile: true のとき使う）
  tasteEmbedding: number[] | null;
  // 最終的な UI 用フルデータ
  collectedPosts: any[];
  // UIフィードバック用（複数駅対応）
  detectedStations: { name: string; placeId: string }[];
  detectedAuthor: { username: string; displayName: string | null } | null;
};

// ============================================================
// ツール実行
// ============================================================

export async function executeTool(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<unknown> {
  switch (name) {
    case "resolve_username":
      return resolveUsername(args.username, ctx);
    case "resolve_station":
      return resolveStation(args.location, ctx);
    case "get_my_taste_profile":
      return getMyTasteProfile(ctx);
    case "search_posts":
      return searchPosts(args, ctx);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---- resolve_username ----
async function resolveUsername(username: string, ctx: ToolContext) {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", username)
    .single();

  if (!data) return { found: false, error: `@${username} というユーザーが見つかりません` };

  ctx.detectedAuthor = {
    username: data.username ?? username,
    displayName: data.display_name ?? null,
  };

  return {
    found: true,
    user_id: data.id,
    username: data.username,
    display_name: data.display_name,
  };
}

// ---- resolve_station ----
async function resolveStation(location: string, ctx: ToolContext) {
  const { data } = await ctx.supabase.rpc("suggest_stations_v1", {
    q: location,
    lim: 1,
  });

  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.station_place_id) {
    return { found: false, error: `「${location}」の駅・エリアが見つかりません` };
  }

  const resolved = {
    name: first.station_name ?? location,
    placeId: first.station_place_id,
  };

  // 既に同じ place_id が登録済みでなければ追加（重複防止）
  if (!ctx.detectedStations.some((s) => s.placeId === resolved.placeId)) {
    ctx.detectedStations.push(resolved);
  }

  return {
    found: true,
    station_place_id: first.station_place_id,
    station_name: first.station_name ?? location,
  };
}

// ---- get_my_taste_profile ----
async function getMyTasteProfile(ctx: ToolContext) {
  const { data: posts } = await ctx.supabase
    .from("posts")
    .select("embedding")
    .eq("user_id", ctx.userId)
    .not("embedding", "is", null)
    .limit(50);

  if (!posts?.length) {
    return { ok: false, message: "過去の投稿が見つからないため、好みプロファイルを作れませんでした" };
  }

  // embedding は PostgREST から文字列 "[0.1,...]" で返ってくる場合がある
  const vecs: number[][] = posts
    .map((p: any) => {
      if (Array.isArray(p.embedding)) return p.embedding as number[];
      if (typeof p.embedding === "string") {
        try { return JSON.parse(p.embedding) as number[]; } catch { return null; }
      }
      return null;
    })
    .filter((v: number[] | null): v is number[] => v !== null && v.length > 0);

  if (!vecs.length) {
    return { ok: false, message: "有効なembeddingが取得できませんでした" };
  }

  // ベクトルを平均して正規化（コサイン類似度用）
  const dim = vecs[0].length;
  const avg = new Array(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) avg[i] += v[i];
  }
  const norm = Math.sqrt(avg.reduce((s, x) => s + x * x, 0)) || 1;
  ctx.tasteEmbedding = avg.map((x) => x / norm);

  return {
    ok: true,
    post_count: vecs.length,
    message: `${vecs.length}件の投稿から好みプロファイルを構築しました`,
  };
}

// ---- search_posts ----
async function searchPosts(args: Record<string, any>, ctx: ToolContext) {
  const {
    query,
    author_id,
    station_place_ids,
    radius_m = 3000,
    genre,
    sort_by = "similarity",
    use_taste_profile = false,
    limit: rawLimit = 20,
  } = args;

  const limit = Math.min(40, Math.max(1, Number(rawLimit)));
  // sort_by が similarity 以外のときは多めに取ってアプリ側でソート
  const fetchLimit = sort_by !== "similarity" ? Math.min(40, limit * 2) : limit;

  // embedding 生成
  let queryEmbedding: number[];
  if (use_taste_profile && ctx.tasteEmbedding) {
    queryEmbedding = ctx.tasteEmbedding;
  } else {
    const intentText = [genre, query].filter(Boolean).join(" ");
    queryEmbedding = await generateEmbedding(intentText || "おすすめの飲食店");
  }

  const { data: rawPosts, error } = await ctx.supabase.rpc("search_posts_semantic", {
    query_embedding: queryEmbedding,
    p_user_id: ctx.userId,
    p_follow_only: ctx.followOnly,
    p_station_place_ids: Array.isArray(station_place_ids) && station_place_ids.length > 0
      ? station_place_ids
      : null,
    p_radius_m: radius_m,
    p_threshold: 0.15,
    p_limit: fetchLimit,
    p_author_id: author_id ?? null,
  });

  if (error) return { count: 0, error: error.message, posts_summary: [] };

  let posts: any[] = rawPosts ?? [];

  // アプリ側ソート
  if (sort_by === "recommend_score") {
    posts.sort((a, b) => (b.recommend_score ?? 0) - (a.recommend_score ?? 0));
  } else if (sort_by === "newest") {
    posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  posts = posts.slice(0, limit);

  // UI 用フルデータを蓄積（重複除去）
  const existingIds = new Set(ctx.collectedPosts.map((p) => p.id));
  for (const p of posts) {
    if (!existingIds.has(p.id)) ctx.collectedPosts.push(p);
  }

  // 投稿者プロフィールを一括取得（LLM サマリーに含めるため）
  const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];
  const profileMap: Record<string, { display_name: string | null; username: string | null }> = {};
  if (userIds.length) {
    const { data: profiles } = await ctx.supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", userIds);
    for (const pr of profiles ?? []) profileMap[pr.id] = pr;
  }

  // LLM に返すサマリー（投稿者・本文・おすすめ度を含む）
  const posts_summary = posts.slice(0, 10).map((p) => {
    const pr = profileMap[p.user_id];
    const poster = pr?.display_name ?? pr?.username ?? null;
    return {
      place_name: p.place_name,
      genre: p.place_genre ?? null,
      area: p.place_address ? p.place_address.split(" ")[0] : null,
      recommend_score: p.recommend_score ?? null,
      content_snippet: p.content?.slice(0, 80) ?? null,
      poster_name: poster,
      poster_username: pr?.username ?? null,
      similarity: Math.round((p.similarity ?? 0) * 100) / 100,
    };
  });

  return { count: posts.length, posts_summary };
}

// ============================================================
// 後処理: プロフィール + 最寄り駅を posts に付与
// ============================================================

export async function enrichCollectedPosts(posts: any[], supabase: any): Promise<any[]> {
  if (!posts.length) return [];

  const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];
  const profileMap: Record<string, any> = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, username, is_public")
      .in("id", userIds);
    for (const p of profiles ?? []) profileMap[p.id] = p;
  }

  const placeIds = [...new Set(posts.map((p) => p.place_id).filter(Boolean))];
  const stationMap: Record<string, any> = {};
  if (placeIds.length) {
    const { data: links } = await supabase
      .from("place_station_links")
      .select("place_id, station_name, distance_m")
      .in("place_id", placeIds)
      .eq("rank", 1);
    for (const l of links ?? []) {
      stationMap[l.place_id] = {
        nearest_station_name: l.station_name ?? null,
        nearest_station_distance_m: l.distance_m ?? null,
      };
    }
  }

  return posts.map((p) => {
    const profile = profileMap[p.user_id] ?? null;
    const station = stationMap[p.place_id] ?? null;
    return {
      ...p,
      profile,
      user: profile,
      nearest_station_name: station?.nearest_station_name ?? null,
      nearest_station_distance_m: station?.nearest_station_distance_m ?? null,
      _similarity: p.similarity,
    };
  });
}
