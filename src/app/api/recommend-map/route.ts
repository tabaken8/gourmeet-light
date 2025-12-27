import { NextResponse } from "next/server";
import OpenAI from "openai";

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
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
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

/** JSON.parse を安全にやる（失敗したら null） */
function tryParseJsonObject(text: string): any | null {
  const s = (text || "").trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object") return obj;
    return null;
  } catch {
    return null;
  }
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

/** クエリ中の “超一般スコープ語” だけ軽く補正（列挙地名は増やさない） */
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
    "明示の地名が無い場合も、常識的推論で一意に定まるなら返してよい（例：織田信長の出身県→愛知県）。" +
    "不明なら null。" +
    "必ずJSONだけを返す。";

  const formatHint = `
出力JSONの形（厳守）:
{
  "location_query": string|null,
  "reason_short": string
}
`;

  const model = process.env.OPENAI_MODEL_RECOMMEND_MAP || "gpt-4.1-mini";

  try {
    const resp = await openai.responses.create({
      model,
      instructions,
      input: `ユーザー文:\n${userQuery}\n\n${formatHint}`,
      // ✅ JSONだけ返させる（混ざり物でパース失敗→既定文、を潰す）
      text: { format: { type: "json_object" } },
    });

    const obj = tryParseJsonObject(resp.output_text || "") || {};
    const location_query =
      typeof obj?.location_query === "string" && obj.location_query.trim()
        ? obj.location_query.trim()
        : null;
    const reason_short = safeStr(obj?.reason_short, "");
    return {
      location_query,
      reason_short,
      _debug: {
        llm_model: model,
        parsed: !!obj && typeof obj === "object" && Object.keys(obj).length > 0,
      },
    };
  } catch {
    return {
      location_query: null as string | null,
      reason_short: "",
      _debug: { llm_model: model, parsed: false },
    };
  }
}

/**
 * viewport + types から「hard max radius（禁忌制約）」を決める
 */
function decideHardMaxRadiusKm(args: {
  userQuery: string;
  geo: Geo | null;
}): { hardMaxKm: number; basis: string } {
  const q = args.userQuery || "";
  const geo = args.geo;

  const wantsNear =
    q.includes("近く") || q.includes("徒歩") || q.includes("今から") || q.includes("すぐ");
  const wantsFar =
    q.includes("旅行") || q.includes("遠出") || q.includes("出張") || q.includes("ドライブ");

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

  const model = process.env.OPENAI_MODEL_RECOMMEND_MAP || "gpt-4.1-mini";

  const resp = await openai.responses.create({
    model,
    instructions,
    input,
    // ✅ JSONだけ返させる（混ざり物でパース失敗→既定文、を潰す）
    text: { format: { type: "json_object" } },
  });

  const obj = tryParseJsonObject(resp.output_text || "") || {};
  const understood = obj?.understood?.summary
    ? obj.understood
    : { summary: "ユーザーの希望に合うお店を候補から選びます。", extracted_tags: [] as string[] };

  let results = Array.isArray(obj?.results) ? obj.results : [];

  const poolSet = new Set(pool.map((p) => p.place_id));
  results = results.filter((r: any) => poolSet.has(safeStr(r?.place_id)));
  results = results.slice(0, maxResults);

  return {
    understood,
    results,
    _debug: {
      llm_model: model,
      parsed: !!obj && typeof obj === "object" && Object.keys(obj).length > 0,
    },
  };
}

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
      meta: { candidates_count: 0, pool_count: 0, ms: Date.now() - startedAt },
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

  // A) LLMで地名推定（+ “都内/関東/全国”の超一般語は軽く補正）
  const coarse = normalizeScopeTerms(query);
  const inferred = await inferLocationText(openai, query);

  const locationText = coarse || inferred.location_query;
  const locationReason = inferred.reason_short || "";

  // B) geocode → 中心座標確定
  let geo: Geo | null = null;
  if (googleKey && locationText) {
    geo = await geocode(locationText, googleKey);
  }

  // center fallback（geo無しなら候補平均）
  let center = null as null | { lat: number; lng: number };
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

  // C) hard max radius（禁忌）を決める
  const radiusDec = decideHardMaxRadiusKm({ userQuery: query, geo });
  const hardMaxKm = radiusDec.hardMaxKm;

  // D) 全候補の距離を計算し、hardMaxで “物理的に除外”
  const withDist = candidates.map((c) => ({
    ...c,
    distance_km: haversineKm(center!, { lat: c.lat, lng: c.lng }),
  }));
  withDist.sort((a, b) => a.distance_km - b.distance_km);

  const inScope = withDist.filter((x) => x.distance_km <= hardMaxKm);

  if (inScope.length === 0) {
    return NextResponse.json({
      ok: true,
      understood: {
        summary:
          `「${locationText ?? "指定エリア"}」周辺として解釈しましたが、` +
          `候補の中にスコープ内（〜${hardMaxKm.toFixed(1)}km）のお店がありませんでした。`,
        extracted_tags: [],
      },
      location: {
        location_text: locationText,
        location_reason: locationReason,
        center: { ...center!, label: centerLabel },
        hard_max_km: Number(hardMaxKm.toFixed(3)),
        hard_basis: radiusDec.basis,
      },
      results: [],
      meta: {
        candidates_count: candidates.length,
        pool_count: 0,
        ms: Date.now() - startedAt,
        llm_location_model: inferred._debug?.llm_model,
        llm_location_parsed: inferred._debug?.parsed ?? false,
      },
    });
  }

  // E) LLMに渡すpool（スコープ内のみ、近い順から）
  const POOL_CAP = 80;
  const pool = inScope.slice(0, POOL_CAP);

  // F) LLMで文章＋選抜
  let understood = { summary: "ユーザーの希望に合うお店を候補から選びます。", extracted_tags: [] as string[] };
  let picked: Array<{ place_id: string; headline: string; subline: string; reason: string; match_score: number }> = [];

  let llmRankDebug: any = null;

  try {
    const llm = await rankWithLLM({ openai, userQuery: query, centerLabel, maxResults, pool });
    understood = llm.understood;
    picked = llm.results;
    llmRankDebug = llm._debug;
  } catch {
    picked = pool.slice(0, maxResults).map((p) => ({
      place_id: p.place_id,
      headline: p.name,
      subline: p.address,
      reason: "距離が近い候補から表示しています（LLM失敗fallback）。",
      match_score: 50,
    }));
    llmRankDebug = { failed: true };
  }

  // G) 結果に結合（place_idはpool内に限定される）
  const byId = new Map(pool.map((p) => [p.place_id, p]));
  const results = picked
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

  // H) 足りない分はスコープ内の近い順で埋める（遠方は絶対に混ぜない）
  if (results.length < maxResults) {
    const already = new Set(results.map((x) => x.place_id));
    for (const p of pool) {
      if (results.length >= maxResults) break;
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

  return NextResponse.json({
    ok: true,
    understood,
    location: {
      location_text: locationText,
      location_reason: locationReason,
      center: { ...center!, label: centerLabel },
      hard_max_km: Number(hardMaxKm.toFixed(3)),
      hard_basis: radiusDec.basis,
    },
    results: results.slice(0, maxResults),
    meta: {
      candidates_count: candidates.length,
      pool_count: pool.length,
      ms: Date.now() - startedAt,
      llm_location_model: inferred._debug?.llm_model,
      llm_location_parsed: inferred._debug?.parsed ?? false,
      llm_rank_model: llmRankDebug?.llm_model,
      llm_rank_parsed: llmRankDebug?.parsed ?? false,
      llm_rank_failed: !!llmRankDebug?.failed,
    },
  });
}

export function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
