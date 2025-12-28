import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Annotation, StateGraph } from "@langchain/langgraph";

export const runtime = "nodejs";

type Candidate = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  genre_emoji?: string | null;
  budget_mid_yen?: number | null;
  is_saved?: boolean;
};

type ApiBody = {
  query?: string;
  maxResults?: number;
  candidates?: Candidate[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
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
function safeStr(x: unknown, fallback = ""): string {
  return typeof x === "string" ? x : fallback;
}
function safeNum(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
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
    out.push({
      place_id,
      name,
      address,
      lat,
      lng,
      genre_emoji: safeStr(o.genre_emoji, "📍"),
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
    hardMaxKm = clamp(hardMaxKm, 3, 450);

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

    return { hardMaxKm, basis: `viewport(types=${Array.from(types).slice(0, 4).join(",")})` };
  }

  const coarse = normalizeScopeTerms(q);
  if (coarse === "東京都") return { hardMaxKm: wantsNear ? 25 : 60, basis: "keyword:都内/東京" };
  if (coarse === "東京都23区") return { hardMaxKm: wantsNear ? 18 : 45, basis: "keyword:23区" };
  if (coarse === "関東地方") return { hardMaxKm: wantsNear ? 120 : 350, basis: "keyword:関東" };
  if (coarse === "日本") return { hardMaxKm: 2000, basis: "keyword:全国/日本" };

  return { hardMaxKm: wantsFar ? 200 : 50, basis: "fallback" };
}

type Picked = {
  place_id: string;
  headline: string;
  subline: string;
  reason: string;
  match_score: number;
};

type Understood = { summary: string; extracted_tags: string[] };

async function rankWithLLM(args: {
  openai: OpenAI;
  userQuery: string;
  centerLabel: string;
  maxResults: number;
  pool: Array<Candidate & { distance_km: number }>;
}) {
  const { openai, userQuery, centerLabel, maxResults, pool } = args;

  const compact = pool
    .slice()
    .sort((a, b) => a.distance_km - b.distance_km)
    .map((c) => ({
      place_id: c.place_id,
      name: c.name,
      address: c.address,
      distance_km: Number(c.distance_km.toFixed(2)),
      genre_emoji: c.genre_emoji ?? "📍",
      budget_mid_yen: c.budget_mid_yen ?? null,
      is_saved: !!c.is_saved,
    }));

  const instructions =
    "あなたは飲食店レコメンドの文章生成AIです。" +
    "ユーザー希望に合う候補を選び、理由が具体的になるように書いてください。" +
    "ただし距離は現実の制約なので、近い候補を強く優先してください。" +
    "必ず候補一覧のplace_idから選ぶこと。必ずJSONだけを返す。";

  const formatHint = `
出力JSON（厳守）:
{
  "understood": { "summary": string, "extracted_tags": string[] },
  "results": [
    { "place_id": string, "headline": string, "subline": string, "reason": string, "match_score": number }
  ]
}
`;

  const input =
    `中心地: ${centerLabel}\n` +
    `ユーザー文: ${userQuery}\n` +
    `maxResults: ${maxResults}\n` +
    `候補一覧（距離が小さいほど中心に近い）:\n` +
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

  let results = Array.isArray(obj?.results) ? obj.results : [];
  const poolSet = new Set(pool.map((p) => p.place_id));
  results = results.filter((r: any) => poolSet.has(safeStr(r?.place_id)));
  results = results.slice(0, maxResults);

  return { understood, results: results as Picked[] };
}

/**
 * ✅ あなたの環境の型定義に合わせて
 * Annotation は必ず { value, default } を渡す
 */
const GraphState = Annotation.Root({
  startedAt: Annotation<number>({
    value: (_a, b) => b,
    default: () => 0,
  }),
  userQuery: Annotation<string>({
    value: (_a, b) => b,
    default: () => "",
  }),
  maxResults: Annotation<number>({
    value: (_a, b) => b,
    default: () => 4,
  }),
  candidates: Annotation<Candidate[]>({
    value: (_a, b) => b,
    default: () => [],
  }),

  googleKey: Annotation<string>({
    value: (_a, b) => b,
    default: () => "",
  }),
  openai: Annotation<OpenAI | null>({
    value: (_a, b) => b,
    default: () => null,
  }),

  locationText: Annotation<string | null>({
    value: (_a, b) => b,
    default: () => null,
  }),
  locationReason: Annotation<string>({
    value: (_a, b) => b,
    default: () => "",
  }),

  geo: Annotation<Geo | null>({
    value: (_a, b) => b,
    default: () => null,
  }),
  center: Annotation<{ lat: number; lng: number } | null>({
    value: (_a, b) => b,
    default: () => null,
  }),
  centerLabel: Annotation<string>({
    value: (_a, b) => b,
    default: () => "",
  }),

  hardMaxKm: Annotation<number>({
    value: (_a, b) => b,
    default: () => 0,
  }),
  hardBasis: Annotation<string>({
    value: (_a, b) => b,
    default: () => "",
  }),

  inScope: Annotation<Array<Candidate & { distance_km: number }>>({
    value: (_a, b) => b,
    default: () => [],
  }),
  pool: Annotation<Array<Candidate & { distance_km: number }>>({
    value: (_a, b) => b,
    default: () => [],
  }),

  understood: Annotation<Understood>({
    value: (_a, b) => b,
    default: () => ({ summary: "ユーザーの希望に合うお店を候補から選びます。", extracted_tags: [] }),
  }),
  picked: Annotation<Picked[]>({
    value: (_a, b) => b,
    default: () => [],
  }),
  results: Annotation<any[]>({
    value: (_a, b) => b,
    default: () => [],
  }),

  trace: Annotation<string[]>({
    // trace は concat したいので value を concat にする
    value: (a, b) => (a || []).concat(b || []),
    default: () => [],
  }),

  response: Annotation<any | null>({
    value: (_a, b) => b,
    default: () => null,
  }),
});

type S = typeof GraphState.State;

// ✅ chain-style で node union を更新し続ける
const graph = new StateGraph(GraphState)
  // ------- infer_location -------
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
      trace: [
        [
          "------- infer_location -------",
          `query: ${q}`,
          `coarse: ${coarse ?? "null"}`,
          `inferred: ${inferred.location_query ?? "null"}`,
          `locationText: ${locationText ?? "null"}`,
        ].join("\n"),
      ],
    };
  })
  // ------- geocode_center -------
  .addNode("geocode_center", async (state: S) => {
    const googleKey = state.googleKey || "";
    const locationText = state.locationText;
    const candidates = state.candidates;

    let geo: Geo | null = null;
    if (googleKey && locationText) geo = await geocode(locationText, googleKey);

    let center: { lat: number; lng: number } | null = null;
    let centerLabel = "";
    if (geo) {
      center = { lat: geo.lat, lng: geo.lng };
      centerLabel = geo.formatted_address || locationText || "geocode";
    } else {
      const avgLat = candidates.reduce((s, c) => s + c.lat, 0) / candidates.length;
      const avgLng = candidates.reduce((s, c) => s + c.lng, 0) / candidates.length;
      center = { lat: avgLat, lng: avgLng };
      centerLabel = "候補の中心（fallback）";
    }

    return {
      geo,
      center,
      centerLabel,
      trace: [
        [
          "------- geocode_center -------",
          `locationText: ${locationText ?? "null"}`,
          `geo: ${geo ? geo.formatted_address : "null"}`,
          `centerLabel: ${centerLabel}`,
        ].join("\n"),
      ],
    };
  })
  // ------- decide_radius -------
  .addNode("decide_radius", async (state: S) => {
    const { hardMaxKm, basis } = decideHardMaxRadiusKm({ userQuery: state.userQuery, geo: state.geo });
    return {
      hardMaxKm,
      hardBasis: basis,
      trace: [["------- decide_radius -------", `hardMaxKm: ${hardMaxKm.toFixed(3)}`, `basis: ${basis}`].join("\n")],
    };
  })
  // ------- compute_scope -------
  .addNode("compute_scope", async (state: S) => {
    const center = state.center!;
    const withDist = state.candidates
      .map((c) => ({ ...c, distance_km: haversineKm(center, { lat: c.lat, lng: c.lng }) }))
      .sort((a, b) => a.distance_km - b.distance_km);

    const inScope = withDist.filter((x) => x.distance_km <= state.hardMaxKm);
    return {
      inScope,
      trace: [
        [
          "------- compute_scope -------",
          `candidates: ${state.candidates.length}`,
          `hardMaxKm: ${state.hardMaxKm.toFixed(3)}`,
          `inScope: ${inScope.length}`,
        ].join("\n"),
      ],
    };
  })
  // ------- no_results -------
  .addNode("no_results", async (state: S) => {
    const response = {
      ok: true,
      understood: {
        summary:
          `「${state.locationText ?? "指定エリア"}」周辺として解釈しましたが、` +
          `候補の中にスコープ内（〜${state.hardMaxKm.toFixed(1)}km）のお店がありませんでした。`,
        extracted_tags: [],
      },
      location: {
        location_text: state.locationText,
        location_reason: state.locationReason,
        center: { ...state.center!, label: state.centerLabel },
        hard_max_km: Number(state.hardMaxKm.toFixed(3)),
        hard_basis: state.hardBasis,
      },
      results: [],
      meta: {
        candidates_count: state.candidates.length,
        pool_count: 0,
        ms: Date.now() - state.startedAt,
        trace: state.trace.concat(["------- no_results -------"]).join("\n"),
      },
    };

    return {
      response,
      trace: [["------- no_results -------", "short-circuit to __end__"].join("\n")],
    };
  })
  // ------- build_pool -------
  .addNode("build_pool", async (state: S) => {
    const POOL_CAP = 80;
    const pool = state.inScope.slice(0, POOL_CAP);
    return {
      pool,
      trace: [["------- build_pool -------", `pool: ${pool.length}`].join("\n")],
    };
  })
  // ------- rank_llm -------
  .addNode("rank_llm", async (state: S) => {
    const openai = state.openai!;
    try {
      const llm = await rankWithLLM({
        openai,
        userQuery: state.userQuery,
        centerLabel: state.centerLabel,
        maxResults: state.maxResults,
        pool: state.pool,
      });
      return {
        understood: llm.understood,
        picked: llm.results,
        trace: [["------- rank_llm -------", `picked: ${llm.results.length}`].join("\n")],
      };
    } catch {
      const fallbackPicked: Picked[] = state.pool.slice(0, state.maxResults).map((p) => ({
        place_id: p.place_id,
        headline: p.name,
        subline: p.address,
        reason: "距離が近い候補から表示しています（LLM失敗fallback）。",
        match_score: 50,
      }));
      return {
        picked: fallbackPicked,
        trace: [["------- rank_llm -------", "LLM failed -> fallback"].join("\n")],
      };
    }
  })
  // ------- merge_fill_sort -------
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
          genre_emoji: p.genre_emoji ?? "📍",
          budget_mid_yen: p.budget_mid_yen ?? null,
          is_saved: !!p.is_saved,
          distance_km: Number(p.distance_km.toFixed(3)),
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
          reason: "スコープ内の近い候補から補完しています。",
          match_score: 40,
          lat: p.lat,
          lng: p.lng,
          name: p.name,
          address: p.address,
          genre_emoji: p.genre_emoji ?? "📍",
          budget_mid_yen: p.budget_mid_yen ?? null,
          is_saved: !!p.is_saved,
          distance_km: Number(p.distance_km.toFixed(3)),
        });
      }
    }

    results.sort((a, b) => {
      const ds = (b.match_score ?? 0) - (a.match_score ?? 0);
      if (Math.abs(ds) >= 8) return ds;
      return (a.distance_km ?? 0) - (b.distance_km ?? 0);
    });

    return {
      results: results.slice(0, state.maxResults),
      trace: [["------- merge_fill_sort -------", `results: ${Math.min(results.length, state.maxResults)}`].join("\n")],
    };
  })
  // ------- finalize -------
  .addNode("finalize", async (state: S) => {
    const response = {
      ok: true,
      understood: state.understood,
      location: {
        location_text: state.locationText,
        location_reason: state.locationReason,
        center: { ...state.center!, label: state.centerLabel },
        hard_max_km: Number(state.hardMaxKm.toFixed(3)),
        hard_basis: state.hardBasis,
      },
      results: state.results,
      meta: {
        candidates_count: state.candidates.length,
        pool_count: state.pool.length,
        ms: Date.now() - state.startedAt,
        trace: state.trace.join("\n"),
      },
    };
    return { response, trace: [["------- finalize -------", "done"].join("\n")] };
  })
  // edges
  .addEdge("__start__", "infer_location")
  .addEdge("infer_location", "geocode_center")
  .addEdge("geocode_center", "decide_radius")
  .addEdge("decide_radius", "compute_scope")
  .addConditionalEdges(
    "compute_scope",
    (state: S) => (state.inScope.length === 0 ? "no_results" : "build_pool"),
    { no_results: "no_results", build_pool: "build_pool" }
  )
  .addEdge("no_results", "__end__")
  .addEdge("build_pool", "rank_llm")
  .addEdge("rank_llm", "merge_fill_sort")
  .addEdge("merge_fill_sort", "finalize")
  .addEdge("finalize", "__end__")
  .compile();

export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = (await req.json().catch(() => ({}))) as ApiBody;

  const query = (body?.query ?? "").toString().trim();
  const maxResults = clamp(Number(body?.maxResults ?? 4), 1, 10);
  const candidates = normalizeCandidates(body?.candidates);

  if (!query) return NextResponse.json({ ok: false, error: "query is required" }, { status: 400 });

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      understood: { summary: "候補がありません（まだお店データがありません）。", extracted_tags: [] },
      location: null,
      results: [],
      meta: { candidates_count: 0, pool_count: 0, ms: Date.now() - startedAt, trace: "------- empty_candidates -------" },
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || "";
  if (!openaiKey) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY is missing" }, { status: 500 });
  }
  const openai = new OpenAI({ apiKey: openaiKey });

  const googleKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_GEOCODING_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    "";

  const out = await graph.invoke({
    startedAt,
    userQuery: query,
    maxResults,
    candidates,
    googleKey,
    openai,
    trace: ["------- __start__ -------"],
  });

  if (!out.response) {
    return NextResponse.json({ ok: false, error: "Graph failed to produce response" }, { status: 500 });
  }
  return NextResponse.json(out.response);
}

export function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
