import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const runtime = "nodejs";

/** =========================
 * Types
 * ========================= */
type Candidate = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;

  primary_genre?: string | null;
  genre_tags?: string[] | null;

  budget_mid_yen?: number | null;
  is_saved?: boolean;
};

type ApiBody = {
  query?: string;
  maxResults?: number;
  candidates?: Candidate[];

  // ✅ 追加
  threadId?: string | null;
};

type MsgRow = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  meta: any | null;
  created_at: string;
};

/** =========================
 * Helpers (same as your code)
 * ========================= */
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function safeStr(x: unknown, fallback = ""): string {
  return typeof x === "string" ? x : fallback;
}
function safeNum(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeStrLoose(s: string) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normalizeCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) return [];
  const out: Candidate[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as any;

    const place_id = safeStr(o.place_id);
    const name = safeStr(o.name);
    const address = safeStr(o.address);
    const lat = safeNum(o.lat, NaN);
    const lng = safeNum(o.lng, NaN);

    if (!place_id || !name || !address) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const primary_genre = o.primary_genre == null ? null : safeStr(o.primary_genre, "").trim() || null;
    const genre_tags = Array.isArray(o.genre_tags)
      ? o.genre_tags.map((x: any) => String(x)).filter(Boolean)
      : null;

    out.push({
      place_id,
      name,
      address,
      lat,
      lng,
      primary_genre,
      genre_tags,
      budget_mid_yen: o.budget_mid_yen == null ? null : safeNum(o.budget_mid_yen, NaN),
      is_saved: !!o.is_saved,
    });
  }
  return out;
}

function extractFirstJsonObject(text: string): any | null {
  const s = text || "";
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const chunk = s.slice(start, i + 1);
      try {
        return JSON.parse(chunk);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** =========================
 * Distance / Geo
 * ========================= */
function toRad(x: number) {
  return (x * Math.PI) / 180;
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type Geo = {
  lat: number;
  lng: number;
  formatted_address: string;
  types: string[];
  viewport?: {
    ne: { lat: number; lng: number };
    sw: { lat: number; lng: number };
  };
};

async function geocode(address: string, apiKey: string): Promise<Geo | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "JP");

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json().catch(() => null);

  const first = data?.results?.[0];
  const loc = first?.geometry?.location;
  const lat = loc?.lat;
  const lng = loc?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const vp = first?.geometry?.viewport;
  const viewport =
    vp?.northeast && vp?.southwest
      ? {
          ne: { lat: Number(vp.northeast.lat), lng: Number(vp.northeast.lng) },
          sw: { lat: Number(vp.southwest.lat), lng: Number(vp.southwest.lng) },
        }
      : undefined;

  const types = Array.isArray(first?.types) ? first.types.map((t: any) => String(t)) : [];

  return {
    lat: Number(lat),
    lng: Number(lng),
    formatted_address: safeStr(first?.formatted_address, ""),
    types,
    viewport,
  };
}

function clampKm(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeScopeTerms(q: string) {
  const s = q || "";
  if (s.includes("都内")) return "東京都";
  if (s.includes("23区")) return "東京都23区";
  if (s.includes("関東")) return "関東地方";
  if (s.includes("全国") || s.includes("日本中") || s.includes("日本全体")) return "日本";
  return null;
}

async function inferLocationText(openai: OpenAI, userQuery: string) {
  const instructions =
    "あなたは地名推定器です。" +
    "ユーザー文から『検索の中心地』としてジオコーディング可能な地名文字列を1つ推定して返してください。" +
    "ただし料理ジャンル（例: イタリアン/フレンチ/中華/寿司/焼肉/ラーメン/カフェ）や国名形容（例: イタリア料理）は地名ではありません。" +
    "それらを地名として返してはいけません。" +
    "不明なら null。" +
    "必ずJSONだけを返す。";

  const formatHint = `
出力JSONの形（厳守）:
{
  "location_query": string|null,
  "reason_short": string
}
`;

  try {
    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL_RECOMMEND_MAP || "gpt-4.1-mini",
      instructions,
      input: `ユーザー文:\n${userQuery}\n\n${formatHint}`,
    });

    const obj = extractFirstJsonObject(resp.output_text || "");
    const location_query =
      typeof obj?.location_query === "string" && obj.location_query.trim()
        ? obj.location_query.trim()
        : null;
    const reason_short = safeStr(obj?.reason_short, "");
    return { location_query, reason_short };
  } catch {
    return { location_query: null as string | null, reason_short: "" };
  }
}

function decideHardMaxRadiusKm(args: {
  userQuery: string;
  geo: Geo | null;
}): { hardMaxKm: number; basis: string } {
  const q = args.userQuery || "";
  const geo = args.geo;

  const wantsNear = q.includes("近く") || q.includes("徒歩") || q.includes("今から") || q.includes("すぐ");
  const wantsFar = q.includes("旅行") || q.includes("遠出") || q.includes("出張") || q.includes("ドライブ");

  if (geo?.viewport) {
    const diagKm = haversineKm(geo.viewport.sw, geo.viewport.ne);

    let hardMaxKm = diagKm * 0.65;
    hardMaxKm = clampKm(hardMaxKm, 3, 450);

    const types = new Set((geo.types || []).map((t) => String(t)));
    if (types.has("neighborhood") || types.has("sublocality") || types.has("sublocality_level_1")) {
      hardMaxKm = Math.min(hardMaxKm, 8);
    }
    if (types.has("locality")) {
      hardMaxKm = Math.min(Math.max(hardMaxKm, 10), 40);
    }
    if (types.has("administrative_area_level_1")) {
      hardMaxKm = Math.min(Math.max(hardMaxKm, 60), 250);
    }
    if (types.has("country")) {
      hardMaxKm = 2000;
    }

    if (wantsNear) hardMaxKm = Math.max(3, hardMaxKm * 0.7);
    if (wantsFar) hardMaxKm = Math.min(2000, hardMaxKm * 1.25);

    return { hardMaxKm, basis: `viewport` };
  }

  const coarse = normalizeScopeTerms(q);
  if (coarse === "東京都") return { hardMaxKm: wantsNear ? 25 : 60, basis: "keyword:都内/東京" };
  if (coarse === "東京都23区") return { hardMaxKm: wantsNear ? 18 : 45, basis: "keyword:23区" };
  if (coarse === "関東地方") return { hardMaxKm: wantsNear ? 120 : 350, basis: "keyword:関東" };
  if (coarse === "日本") return { hardMaxKm: 2000, basis: "keyword:全国/日本" };

  return { hardMaxKm: wantsFar ? 200 : 50, basis: "fallback" };
}

/** =========================
 * Genres (same as your code)
 * ========================= */
const GENRE_SYNONYMS: Array<{ canon: string; keys: string[] }> = [
  { canon: "ラーメン", keys: ["ラーメン", "拉麺", "ramen"] },
  { canon: "寿司", keys: ["寿司", "すし", "sushi"] },
  { canon: "焼肉", keys: ["焼肉", "yakiniku"] },
  { canon: "居酒屋", keys: ["居酒屋", "いざかや", "izakaya"] },
  { canon: "カフェ", keys: ["カフェ", "喫茶", "coffee", "cafe"] },
  { canon: "イタリアン", keys: ["イタリアン", "italian", "パスタ", "ピザ"] },
  { canon: "フレンチ", keys: ["フレンチ", "french", "ビストロ"] },
  { canon: "中華", keys: ["中華", "china", "chinese", "餃子"] },
  { canon: "韓国料理", keys: ["韓国", "korean", "サムギョプサル"] },
  { canon: "カレー", keys: ["カレー", "curry"] },
  { canon: "そば", keys: ["そば", "蕎麦", "soba"] },
  { canon: "うどん", keys: ["うどん", "udon"] },
  { canon: "和食", keys: ["和食", "定食", "小料理"] },
  { canon: "海鮮", keys: ["海鮮", "魚", "刺身"] },
  { canon: "バー", keys: ["バー", "bar", "ワイン", "wine"] },
  { canon: "スイーツ", keys: ["スイーツ", "デザート", "ケーキ", "パフェ"] },
];

function extractGenresFromQuery(userQuery: string): string[] {
  const q = normalizeStrLoose(userQuery);
  if (!q) return [];
  const hits: string[] = [];
  for (const row of GENRE_SYNONYMS) {
    if (row.keys.some((k) => q.includes(normalizeStrLoose(k)))) hits.push(row.canon);
  }
  return uniq(hits);
}

function candidateMatchesGenre(c: Candidate, genres: string[]): boolean {
  if (genres.length === 0) return true;

  const pg = normalizeStrLoose(c.primary_genre || "");
  const tags = Array.isArray(c.genre_tags) ? c.genre_tags.map((t) => normalizeStrLoose(String(t))) : [];

  for (const g of genres) {
    const gg = normalizeStrLoose(g);
    if (pg && pg === gg) return true;
    if (tags.includes(gg)) return true;
  }

  const name = normalizeStrLoose(c.name);
  for (const g of genres) {
    const gg = normalizeStrLoose(g);
    if (gg && name.includes(gg)) return true;
  }

  return false;
}

function filterCandidatesByGenre(args: {
  candidates: Candidate[];
  genres: string[];
  maxResults: number;
}) {
  const { candidates, genres, maxResults } = args;
  if (genres.length === 0) {
    return { filtered: candidates, applied: false, keptRatio: 1 };
  }

  const filtered = candidates.filter((c) => candidateMatchesGenre(c, genres));

  const needAtLeast = Math.max(maxResults * 4, 12);
  if (filtered.length >= needAtLeast) {
    return {
      filtered,
      applied: true,
      keptRatio: filtered.length / Math.max(1, candidates.length),
    };
  }

  return {
    filtered: candidates,
    applied: false,
    keptRatio: filtered.length / Math.max(1, candidates.length),
  };
}

/** =========================
 * LLM Ranking (+ history)
 * ========================= */
type Picked = {
  place_id: string;
  headline: string;
  subline: string;
  reason: string;
  match_score: number;
};
type Understood = { summary: string; extracted_tags: string[] };

function compactHistoryForPrompt(history: Array<{ role: string; content: string }>, maxMsgs = 20, maxChars = 280) {
  const h = (history ?? []).slice(-maxMsgs);
  return h
    .map((m) => {
      const role = m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user";
      const content = (m.content ?? "").replace(/\s+/g, " ").trim();
      const cut = content.length > maxChars ? content.slice(0, maxChars) + "…" : content;
      return `${role}: ${cut}`;
    })
    .join("\n");
}

async function rankWithLLM(args: {
  openai: OpenAI;
  userQuery: string;
  centerLabel: string | null;
  maxResults: number;
  genresFromQuery: string[];
  genreFilterApplied: boolean;
  pool: Array<Candidate & { distance_km?: number | null }>;
  allowDistance: boolean;

  // ✅ 追加
  history: Array<{ role: string; content: string }>;
}) {
  const { openai, userQuery, centerLabel, maxResults, genresFromQuery, genreFilterApplied, pool, allowDistance, history } = args;

  const compact = pool
    .slice()
    .sort((a, b) => (a.distance_km ?? 1e18) - (b.distance_km ?? 1e18))
    .map((c) => ({
      place_id: c.place_id,
      name: c.name,
      address: c.address,
      distance_km: allowDistance && Number.isFinite(c.distance_km as any) ? Number((c.distance_km as number).toFixed(2)) : null,
      primary_genre: c.primary_genre ?? null,
      genre_tags: Array.isArray(c.genre_tags) ? c.genre_tags : null,
      budget_mid_yen: c.budget_mid_yen ?? null,
      is_saved: !!c.is_saved,
    }));

  const instructions =
    "あなたは飲食店レコメンドの文章生成AIです。" +
    "会話履歴を踏まえて、ユーザーの意図を自然に補完してください（ただし捏造はしない）。" +
    "ユーザーの直近の入力は前の発言の続きである可能性が高い。" +
    "候補一覧の place_id から必ず選んでください。" +
    (allowDistance
      ? "距離がある場合は、まず近い候補を強く優先してください（ただしユーザーの希望ジャンルが明確ならジャンル一致も重視）。"
      : "距離情報がないので、ジャンル一致・店名・住所のヒントを重視して選んでください。") +
    "また、ユーザーの入力が曖昧で精度が出しづらいとあなたが感じた場合に限り、" +
    "『追加で書いてくれるともっと良くなる条件』を短い文章で1つだけ提案してよい。" +
    "提案は専門用語なし、最大2文。十分条件が揃っているなら提案は null にする。" +
    "必ずJSONだけを返す。";

  const formatHint = `
出力JSON（厳守）:
{
  "understood": { "summary": string, "extracted_tags": string[] },
  "assistant_message": string|null,
  "results": [
    { "place_id": string, "headline": string, "subline": string, "reason": string, "match_score": number }
  ]
}
`;

  const historyText = compactHistoryForPrompt(history, 20, 280);

  const input =
    `会話履歴（古い→新しい）:\n${historyText || "（なし）"}\n\n` +
    `中心地: ${centerLabel ?? "（未指定）"}\n` +
    `ユーザー文: ${userQuery}\n` +
    `maxResults: ${maxResults}\n` +
    `ユーザー文から拾えた料理ジャンル(参考): ${genresFromQuery.length ? genresFromQuery.join(", ") : "なし"}\n` +
    `ジャンルで事前に絞ったか: ${genreFilterApplied ? "はい" : "いいえ（絞ると少なすぎるため）"}\n` +
    `候補一覧:\n` +
    JSON.stringify(compact, null, 2) +
    `\n\n${formatHint}`;

  const resp = await openai.responses.create({
    model: process.env.OPENAI_MODEL_RECOMMEND_MAP || "gpt-4.1-mini",
    instructions,
    input,
  });

  const obj = extractFirstJsonObject(resp.output_text || "") || {};

  const understood: Understood = obj?.understood?.summary
    ? obj.understood
    : { summary: "ユーザーの希望に合うお店を候補から選びます。", extracted_tags: [] as string[] };

  const poolSet = new Set(pool.map((p) => p.place_id));
  let results = Array.isArray(obj?.results) ? obj.results : [];
  results = results
    .filter((r: any) => poolSet.has(safeStr(r?.place_id)))
    .slice(0, maxResults);

  const assistant_message_raw = typeof obj?.assistant_message === "string" ? obj.assistant_message.trim() : null;

  return {
    understood,
    results: results as Picked[],
    assistant_message: assistant_message_raw && assistant_message_raw.length ? assistant_message_raw : null,
  };
}

/** =========================
 * Graph State (+ history)
 * ========================= */
const GraphState = Annotation.Root({
  startedAt: Annotation<number>({ value: (_a, b) => b, default: () => 0 }),
  userQuery: Annotation<string>({ value: (_a, b) => b, default: () => "" }),
  maxResults: Annotation<number>({ value: (_a, b) => b, default: () => 4 }),
  candidates: Annotation<Candidate[]>({ value: (_a, b) => b, default: () => [] }),

  // ✅ 追加: 履歴（LLMに渡す）
  history: Annotation<Array<{ role: string; content: string }>>({
    value: (_a, b) => b,
    default: () => [],
  }),

  genresFromQuery: Annotation<string[]>({ value: (_a, b) => b, default: () => [] }),
  genreFilterApplied: Annotation<boolean>({ value: (_a, b) => b, default: () => false }),

  googleKey: Annotation<string>({ value: (_a, b) => b, default: () => "" }),
  openai: Annotation<OpenAI | null>({ value: (_a, b) => b, default: () => null }),

  locationText: Annotation<string | null>({ value: (_a, b) => b, default: () => null }),
  locationReason: Annotation<string>({ value: (_a, b) => b, default: () => "" }),

  geo: Annotation<Geo | null>({ value: (_a, b) => b, default: () => null }),
  center: Annotation<{ lat: number; lng: number } | null>({ value: (_a, b) => b, default: () => null }),
  centerLabel: Annotation<string | null>({ value: (_a, b) => b, default: () => null }),

  hardMaxKm: Annotation<number>({ value: (_a, b) => b, default: () => 0 }),
  hardBasis: Annotation<string>({ value: (_a, b) => b, default: () => "" }),

  inScope: Annotation<Array<Candidate & { distance_km?: number | null }>>({ value: (_a, b) => b, default: () => [] }),
  pool: Annotation<Array<Candidate & { distance_km?: number | null }>>({ value: (_a, b) => b, default: () => [] }),
  scopeRelaxed: Annotation<boolean>({ value: (_a, b) => b, default: () => false }),

  understood: Annotation<Understood>({
    value: (_a, b) => b,
    default: () => ({ summary: "ユーザーの希望に合うお店を候補から選びます。", extracted_tags: [] }),
  }),
  picked: Annotation<Picked[]>({ value: (_a, b) => b, default: () => [] }),
  assistantMessage: Annotation<string | null>({ value: (_a, b) => b, default: () => null }),
  results: Annotation<any[]>({ value: (_a, b) => b, default: () => [] }),

  trace: Annotation<string[]>({ value: (a, b) => (a || []).concat(b || []), default: () => [] }),
  response: Annotation<any | null>({ value: (_a, b) => b, default: () => null }),
});

type S = typeof GraphState.State;

const graph = new StateGraph(GraphState)
  .addNode("extract_genres", async (state: S) => {
    const genresFromQuery = extractGenresFromQuery(state.userQuery || "");
    return {
      genresFromQuery,
      trace: [[
        "------- extract_genres -------",
        `genresFromQuery: ${genresFromQuery.length ? genresFromQuery.join(", ") : "none"}`
      ].join("\n")],
    };
  })

  .addNode("filter_by_genre", async (state: S) => {
    const { filtered, applied, keptRatio } = filterCandidatesByGenre({
      candidates: state.candidates,
      genres: state.genresFromQuery,
      maxResults: state.maxResults,
    });

    return {
      candidates: filtered,
      genreFilterApplied: applied,
      trace: [[
        "------- filter_by_genre -------",
        `applied: ${applied}`,
        `candidates(after): ${filtered.length}`,
        `keptRatio: ${keptRatio.toFixed(3)}`
      ].join("\n")],
    };
  })

  .addNode("infer_location", async (state: S) => {
    const q = state.userQuery || "";
    const coarse = normalizeScopeTerms(q);
    const openai = state.openai;

    const inferred = openai ? await inferLocationText(openai, q) : { location_query: null, reason_short: "" };

    const locationText = coarse || inferred.location_query;
    const locationReason = inferred.reason_short || "";

    return {
      locationText,
      locationReason,
      trace: [[
        "------- infer_location -------",
        `query: ${q}`,
        `coarse: ${coarse ?? "null"}`,
        `inferred: ${inferred.location_query ?? "null"}`,
        `locationText: ${locationText ?? "null"}`
      ].join("\n")],
    };
  })

  .addNode("geocode_center", async (state: S) => {
    const googleKey = state.googleKey || "";
    const locationText = state.locationText;

    let geo: Geo | null = null;
    if (googleKey && locationText) geo = await geocode(locationText, googleKey);

    if (!geo) {
      return {
        geo: null,
        center: null,
        centerLabel: null,
        trace: [[
          "------- geocode_center -------",
          `locationText: ${locationText ?? "null"}`,
          "geo: null",
          "center: null (no fallback center)"
        ].join("\n")],
      };
    }

    return {
      geo,
      center: { lat: geo.lat, lng: geo.lng },
      centerLabel: geo.formatted_address || locationText || "geocode",
      trace: [[
        "------- geocode_center -------",
        `locationText: ${locationText ?? "null"}`,
        `geo: ${geo.formatted_address}`,
        "center: set"
      ].join("\n")],
    };
  })

  .addNode("decide_radius", async (state: S) => {
    if (!state.center) {
      return {
        hardMaxKm: 0,
        hardBasis: "no_center",
        trace: [["------- decide_radius -------", "no center -> no distance constraint"].join("\n")],
      };
    }
    const { hardMaxKm, basis } = decideHardMaxRadiusKm({ userQuery: state.userQuery, geo: state.geo });
    return {
      hardMaxKm,
      hardBasis: basis,
      trace: [["------- decide_radius -------", `hardMaxKm: ${hardMaxKm.toFixed(3)}`, `basis: ${basis}`].join("\n")],
    };
  })

  .addNode("compute_scope", async (state: S) => {
    if (!state.center) {
      return {
        inScope: state.candidates.map((c) => ({ ...c, distance_km: null })),
        scopeRelaxed: false,
        trace: [[
          "------- compute_scope -------",
          "no center -> inScope = all candidates (distance_km=null)"
        ].join("\n")],
      };
    }

    const center = state.center;
    const withDist = state.candidates
      .map((c) => ({ ...c, distance_km: haversineKm(center, { lat: c.lat, lng: c.lng }) }))
      .sort((a, b) => (a.distance_km! - b.distance_km!));

    const inScope = withDist.filter((x) => (x.distance_km ?? 1e18) <= state.hardMaxKm);

    if (inScope.length === 0) {
      const POOL_CAP = 80;
      const relaxed = withDist.slice(0, POOL_CAP);
      return {
        inScope: relaxed,
        scopeRelaxed: true,
        trace: [[
          "------- compute_scope -------",
          `hardMaxKm: ${state.hardMaxKm.toFixed(2)}`,
          "inScope: 0 -> relaxed to nearest candidates"
        ].join("\n")],
      };
    }

    return {
      inScope,
      scopeRelaxed: false,
      trace: [[
        "------- compute_scope -------",
        `candidates: ${state.candidates.length}`,
        `hardMaxKm: ${state.hardMaxKm.toFixed(2)}`,
        `inScope: ${inScope.length}`
      ].join("\n")],
    };
  })

  .addNode("build_pool", async (state: S) => {
    const POOL_CAP = 80;
    const pool = state.inScope.slice(0, POOL_CAP);
    return {
      pool,
      trace: [["------- build_pool -------", `pool: ${pool.length}`].join("\n")],
    };
  })

  .addNode("rank_llm", async (state: S) => {
    const openai = state.openai!;
    const allowDistance = !!state.center;

    try {
      const llm = await rankWithLLM({
        openai,
        userQuery: state.userQuery,
        centerLabel: state.centerLabel,
        maxResults: state.maxResults,
        genresFromQuery: state.genresFromQuery,
        genreFilterApplied: state.genreFilterApplied,
        pool: state.pool,
        allowDistance,
        history: state.history, // ✅
      });

      const hasGenre = state.genresFromQuery.length > 0;
      const hasLocation = !!state.locationText || !!state.center;
      const forceStopAdvice = hasGenre && hasLocation;

      let assistantMessage = llm.assistant_message;

      if (!state.center && !assistantMessage) {
        assistantMessage =
          "どのあたりで探すか（例：駅名やエリア名）も入れてくれると、近い順でかなり精度が上がるよ。";
      }

      if (forceStopAdvice) assistantMessage = null;

      return {
        understood: llm.understood,
        picked: llm.results,
        assistantMessage,
        trace: [["------- rank_llm -------", `picked: ${llm.results.length}`].join("\n")],
      };
    } catch {
      const fallbackPicked: Picked[] = state.pool.slice(0, state.maxResults).map((p) => ({
        place_id: p.place_id,
        headline: p.name,
        subline: p.address,
        reason: "近い候補から表示しています（推薦が不安定だったので簡易表示）。",
        match_score: 45,
      }));
      const assistantMessage = state.center
        ? null
        : "どのあたりで探すか（駅名やエリア名）も入れてくれると、近い順で精度が上がるよ。";

      return {
        picked: fallbackPicked,
        assistantMessage,
        trace: [["------- rank_llm -------", "LLM failed -> fallback"].join("\n")],
      };
    }
  })

  .addNode("merge_fill_sort", async (state: S) => {
    const byId = new Map(state.pool.map((p) => [p.place_id, p]));
    let results = state.picked
      .map((r) => {
        const p = byId.get(r.place_id);
        if (!p) return null;
        return {
          id: r.place_id,
          place_id: r.place_id,
          headline: r.headline || p.name,
          subline: r.subline || p.address,
          reason: r.reason || "",
          match_score: safeNum(r.match_score, 50),

          lat: p.lat,
          lng: p.lng,
          name: p.name,
          address: p.address,

          primary_genre: p.primary_genre ?? null,
          genre_tags: Array.isArray(p.genre_tags) ? p.genre_tags : null,

          budget_mid_yen: p.budget_mid_yen ?? null,
          is_saved: !!p.is_saved,
          distance_km: state.center && Number.isFinite(p.distance_km as any) ? Number((p.distance_km as number).toFixed(3)) : null,
        };
      })
      .filter(Boolean) as any[];

    if (results.length < state.maxResults) {
      const already = new Set(results.map((x) => x.place_id));
      for (const p of state.pool) {
        if (results.length >= state.maxResults) break;
        if (already.has(p.place_id)) continue;
        results.push({
          id: p.place_id,
          place_id: p.place_id,
          headline: p.name,
          subline: p.address,
          reason: "近い候補から補完しています。",
          match_score: 40,
          lat: p.lat,
          lng: p.lng,
          name: p.name,
          address: p.address,
          primary_genre: p.primary_genre ?? null,
          genre_tags: Array.isArray(p.genre_tags) ? p.genre_tags : null,
          budget_mid_yen: p.budget_mid_yen ?? null,
          is_saved: !!p.is_saved,
          distance_km: state.center && Number.isFinite(p.distance_km as any) ? Number((p.distance_km as number).toFixed(3)) : null,
        });
      }
    }

    results.sort((a, b) => {
      const ds = (b.match_score ?? 0) - (a.match_score ?? 0);
      if (Math.abs(ds) >= 8) return ds;
      const da = a.distance_km ?? 1e18;
      const db = b.distance_km ?? 1e18;
      return da - db;
    });

    return {
      results: results.slice(0, state.maxResults),
      trace: [["------- merge_fill_sort -------", `results: ${Math.min(results.length, state.maxResults)}`].join("\n")],
    };
  })

  .addNode("finalize", async (state: S) => {
    const response = {
      ok: true,
      understood: state.understood,
      assistant_message: state.assistantMessage,
      location: state.center
        ? {
            location_text: state.locationText,
            location_reason: state.locationReason,
            center: { ...state.center, label: state.centerLabel ?? "" },
            hard_max_km: Number(state.hardMaxKm.toFixed(3)),
            hard_basis: state.hardBasis,
            scope_relaxed: !!state.scopeRelaxed,
          }
        : {
            location_text: state.locationText,
            location_reason: state.locationReason,
            center: null,
            hard_max_km: null,
            hard_basis: "no_center",
            scope_relaxed: false,
          },
      results: state.results,
      meta: {
        candidates_count: state.candidates.length,
        pool_count: state.pool.length,
        ms: Date.now() - state.startedAt,
        trace: state.trace.join("\n"),
        genres_from_query: state.genresFromQuery,
        genre_filter_applied: state.genreFilterApplied,
      },
    };
    return { response, trace: [["------- finalize -------", "done"].join("\n")] };
  })

  .addEdge("__start__", "extract_genres")
  .addEdge("extract_genres", "filter_by_genre")
  .addEdge("filter_by_genre", "infer_location")
  .addEdge("infer_location", "geocode_center")
  .addEdge("geocode_center", "decide_radius")
  .addEdge("decide_radius", "compute_scope")
  .addEdge("compute_scope", "build_pool")
  .addEdge("build_pool", "rank_llm")
  .addEdge("rank_llm", "merge_fill_sort")
  .addEdge("merge_fill_sort", "finalize")
  .addEdge("finalize", "__end__")
  .compile();

/** =========================
 * DB helpers: threads & messages
 * ========================= */
async function ensureThreadId(args: {
  supabase: any;
  userId: string;
  threadId: string | null;
}) {
  const { supabase, userId } = args;
  const tid = (args.threadId ?? "").trim() || null;

  if (!tid) {
    const { data, error } = await supabase
      .from("ai_threads")
      .insert({ user_id: userId, title: null })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(`Failed to create thread: ${error?.message ?? "unknown"}`);
    }
    return data.id as string;
  }

  // 既存 thread の所有者チェック
  const { data: t, error: tErr } = await supabase
    .from("ai_threads")
    .select("id")
    .eq("id", tid)
    .eq("user_id", userId)
    .maybeSingle();

  if (tErr) throw new Error(`Failed to load thread: ${tErr.message}`);
  if (!t?.id) {
    const e = new Error("Thread not found or not allowed");
    (e as any).status = 403;
    throw e;
  }
  return tid;
}

async function insertMessage(args: {
  supabase: any;
  threadId: string;
  userId: string;
  role: "system" | "user" | "assistant";
  content: string;
  meta?: any;
}) {
  const { supabase, threadId, userId, role, content, meta } = args;
  const { error } = await supabase.from("ai_thread_messages").insert({
    thread_id: threadId,
    user_id: userId,
    role,
    content,
    meta: meta ?? null,
  });
  if (error) throw new Error(`Failed to insert message: ${error.message}`);
}

async function loadHistory(args: {
  supabase: any;
  threadId: string;
  limit?: number;
}) {
  const { supabase, threadId } = args;
  const limit = Math.max(1, Math.min(80, args.limit ?? 40));

  const { data, error } = await supabase
    .from("ai_thread_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load history: ${error.message}`);
  const rows = (data ?? []) as Array<{ role: string; content: string }>;
  return rows.slice().reverse();
}

/** =========================
 * POST
 * ========================= */
export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = (await req.json().catch(() => ({}))) as ApiBody;

  const query = (body?.query ?? "").toString().trim();
  const maxResults = clamp(Number(body?.maxResults ?? 4), 1, 10);
  const candidates = normalizeCandidates(body?.candidates);

  if (!query) return NextResponse.json({ ok: false, error: "query is required" }, { status: 400 });

  // supabase (RLS前提)
  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const userId = userRes.user.id;

  // thread確保（無ければ作る）
  let thread_id: string;
  try {
    thread_id = await ensureThreadId({
      supabase,
      userId,
      threadId: body?.threadId ?? null,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to ensure thread" }, { status });
  }

  // 候補が無い場合も “会話の流れ” は保存する
  try {
    await insertMessage({
      supabase,
      threadId: thread_id,
      userId, 
      role: "user",
      content: query,
      meta: { maxResults },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to log user message" }, { status: 500 });
  }

  if (candidates.length === 0) {
    const resp = {
      ok: true,
      thread_id,
      understood: { summary: "候補がありません（まだお店データがありません）。", extracted_tags: [] },
      assistant_message: "まずはお店をいくつか保存すると、ここにおすすめが出せるようになります。",
      location: null,
      results: [],
      meta: { candidates_count: 0, pool_count: 0, ms: Date.now() - startedAt, trace: "------- empty_candidates -------" },
    };

    const assistantText = [resp.understood.summary, resp.assistant_message].filter(Boolean).join("\n\n");
    try {
      await insertMessage({
        supabase,
        threadId: thread_id,
        userId, 
        role: "assistant",
        content: assistantText,
        meta: {
          understood: resp.understood,
          assistant_message: resp.assistant_message,
          results: resp.results,
          location: resp.location,
          trace: resp.meta?.trace ?? null,
        },
      });
    } catch {}

    return NextResponse.json(resp);
  }

  // OpenAI
  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || "";
  if (!openaiKey) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }
  const openai = new OpenAI({ apiKey: openaiKey });

  // Google
  const googleKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_GEOCODING_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    "";

  // 履歴ロード（user message入れた後に読むので、今回分も含む）
  let history: Array<{ role: string; content: string }> = [];
  try {
    history = await loadHistory({ supabase, threadId: thread_id, limit: 40 });
  } catch {
    history = [];
  }

  const out = await graph.invoke({
    startedAt,
    userQuery: query,
    maxResults,
    candidates,
    googleKey,
    openai,
    history,
    trace: ["------- __start__ -------"],
  });

  if (!out.response) {
    return NextResponse.json({ ok: false, error: "Graph failed to produce response" }, { status: 500 });
  }

  // thread_id を必ず返す
  const resp = { ...out.response, thread_id };

  // assistantをDBに保存（UIに表示してる文字列をそのまま）
  const assistantText = [
    resp?.understood?.summary ?? "",
    typeof resp?.assistant_message === "string" ? resp.assistant_message : "",
  ]
    .map((s: string) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  try {
    await insertMessage({
      supabase,
      threadId: thread_id,
      userId, 
      role: "assistant",
      content: assistantText || "（結果をまとめました）",
      meta: {
        understood: resp.understood ?? null,
        assistant_message: resp.assistant_message ?? null,
        results: resp.results ?? [],
        location: resp.location ?? null,
        trace: resp?.meta?.trace ?? null,
      },
    });
  } catch {
    // 失敗しても推薦結果は返す（UX優先）
  }

  return NextResponse.json(resp);
}

/** =========================
 * GET (history)
 * GET /api/recommend-map?thread_id=xxxx
 * ========================= */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const thread_id = (url.searchParams.get("thread_id") ?? "").trim();
  if (!thread_id) {
    return NextResponse.json({ ok: false, error: "thread_id is required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const userId = userRes.user.id;

  // 所有者チェック
  const { data: t, error: tErr } = await supabase
    .from("ai_threads")
    .select("id")
    .eq("id", thread_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  if (!t?.id) return NextResponse.json({ ok: false, error: "Thread not found or not allowed" }, { status: 403 });

  const { data, error } = await supabase
    .from("ai_thread_messages")
    .select("id, role, content, meta, created_at")
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    thread_id,
    messages: (data ?? []) as MsgRow[],
  });
}
