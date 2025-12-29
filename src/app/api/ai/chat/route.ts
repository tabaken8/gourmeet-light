// app/api/ai/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
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
};

type ApiBody = {
  message?: string;
  maxResults?: number;
  threadId?: string | null;
};

type MsgRow = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  meta: any | null;
  created_at: string;
};

type EvidencePost = {
  post_id: string;
  post_url: string;
  created_at: string | null;
  content: string | null;
  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;
  image_thumb_url: string | null;

  // ✅ ここは「任意の人に対して表示OK」（ただし自分の投稿は除外）
  author_display_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;

  // ✅ social proximity
  distance_k: number | null; // 1=direct follow, 2=followee of followee, ...
  is_direct_follow: boolean;
};

type ApiResult = {
  id: string;
  place_id: string;
  headline: string;
  subline: string;
  reason: string;
  match_score: number;

  lat: number;
  lng: number;
  name: string;
  address: string;

  primary_genre: string | null;
  genre_tags: string[] | null;
  distance_km: number | null;

  // 参考（UIでは使わなくてもOK）
  social_score: number; // 0..(small)
  closest_k: number | null;

  evidence_posts: EvidencePost[];
};

type Understood = { summary: string; extracted_tags: string[] };

type Picked = {
  place_id: string;
  headline: string;
  subline: string;
  reason: string;
  match_score: number;
};

/** =========================
 * Helpers
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

function clipText(s: string, n: number) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n) + "…";
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

function decideHardMaxRadiusKm(args: { userQuery: string; geo: Geo | null }) {
  const q = args.userQuery || "";
  const geo = args.geo;

  const wantsNear = q.includes("近く") || q.includes("徒歩") || q.includes("今から") || q.includes("すぐ");
  const wantsFar = q.includes("旅行") || q.includes("遠出") || q.includes("出張") || q.includes("ドライブ");

  const clampKm = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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

    return { hardMaxKm, basis: "viewport" };
  }

  const coarse = normalizeScopeTerms(q);
  if (coarse === "東京都") return { hardMaxKm: wantsNear ? 25 : 60, basis: "keyword:都内/東京" };
  if (coarse === "東京都23区") return { hardMaxKm: wantsNear ? 18 : 45, basis: "keyword:23区" };
  if (coarse === "関東地方") return { hardMaxKm: wantsNear ? 120 : 350, basis: "keyword:関東" };
  if (coarse === "日本") return { hardMaxKm: 2000, basis: "keyword:全国/日本" };

  return { hardMaxKm: wantsFar ? 200 : 50, basis: "fallback" };
}

/** =========================
 * Genres
 * ========================= */
const GENRE_SYNONYMS: Array<{ canon: string; keys: string[] }> = [
  { canon: "ラーメン", keys: ["ラーメン", "拉麺", "ramen", "中華そば", "つけ麺", "担々麺", "家系", "二郎"] },
  { canon: "寿司", keys: ["寿司", "すし", "sushi"] },
  { canon: "焼肉", keys: ["焼肉", "yakiniku"] },
  { canon: "居酒屋", keys: ["居酒屋", "いざかや", "izakaya"] },
  { canon: "カフェ", keys: ["カフェ", "喫茶", "coffee", "cafe"] },
  { canon: "イタリアン", keys: ["イタリアン", "italian", "パスタ", "ピザ"] },
  { canon: "フレンチ", keys: ["フレンチ", "french", "ビストロ"] },
  { canon: "中華", keys: ["中華", "chinese", "餃子", "町中華"] },
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

function filterCandidatesByGenre(args: { candidates: Candidate[]; genres: string[]; maxResults: number }) {
  const { candidates, genres, maxResults } = args;
  if (genres.length === 0) return { filtered: candidates, applied: false };

  const filtered = candidates.filter((c) => candidateMatchesGenre(c, genres));
  const needAtLeast = Math.max(maxResults * 4, 12);

  if (filtered.length >= needAtLeast) return { filtered, applied: true };
  return { filtered: candidates, applied: false };
}

/** =========================
 * Social graph: k-hop distances (BFS)
 *  - edges: follows where status='accepted'
 *  - direction: follower_id -> followee_id
 *  - exclude self
 * ========================= */
async function computeFollowDistances(args: {
  supabase: any;
  userId: string;
  maxHops?: number;
  maxNodes?: number;
}) {
  const { supabase, userId } = args;
  const maxHops = clamp(Number(args.maxHops ?? 3), 1, 6);
  const maxNodes = clamp(Number(args.maxNodes ?? 3000), 200, 20000);

  const dist = new Map<string, number>();
  let frontier = new Set<string>([userId]);

  for (let hop = 1; hop <= maxHops; hop++) {
    if (frontier.size === 0) break;
    if (dist.size >= maxNodes) break;

    const followerIds = Array.from(frontier).slice(0, 1000);
    frontier = new Set<string>();

    const { data, error } = await supabase
      .from("follows")
      .select("follower_id, followee_id, status")
      .in("follower_id", followerIds)
      .eq("status", "accepted")
      .limit(20000);

    if (error) {
      // 失敗しても推薦自体は止めたくないので、ここは空で返す
      return dist;
    }

    for (const r of data ?? []) {
      const followee = safeStr((r as any)?.followee_id);
      if (!followee) continue;
      if (followee === userId) continue;
      if (dist.has(followee)) continue;

      dist.set(followee, hop);
      frontier.add(followee);

      if (dist.size >= maxNodes) break;
    }
  }

  return dist; // userId -> hop
}

/** =========================
 * DB: threads & messages
 * ========================= */
async function ensureThreadId(args: { supabase: any; userId: string; threadId: string | null }) {
  const { supabase, userId } = args;
  const tid = (args.threadId ?? "").trim() || null;

  if (!tid) {
    const { data, error } = await supabase
      .from("ai_threads")
      .insert({ user_id: userId, title: null })
      .select("id")
      .single();

    if (error || !data?.id) throw new Error(`Failed to create thread: ${error?.message ?? "unknown"}`);
    return data.id as string;
  }

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

async function setThreadTitleIfEmpty(args: { supabase: any; threadId: string; userId: string; title: string }) {
  const { supabase, threadId, userId, title } = args;
  const t = (title ?? "").trim();
  if (!t) return;

  const { data } = await supabase
    .from("ai_threads")
    .select("title")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.title) return;

  await supabase.from("ai_threads").update({ title: t.slice(0, 60) }).eq("id", threadId).eq("user_id", userId);
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

async function loadHistory(args: { supabase: any; threadId: string; limit?: number }) {
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
 * DB: candidates from public.places
 * ========================= */
async function loadCandidatesFromPlaces(args: { supabase: any; limit?: number }) {
  const { supabase } = args;
  const limit = Math.max(50, Math.min(5000, args.limit ?? 2000));

  const { data, error } = await supabase
    .from("places")
    .select("place_id,name,address,lat,lng,primary_genre,genre_tags,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load places: ${error.message}`);

  const rows = (data ?? []) as any[];
  const out: Candidate[] = [];
  for (const r of rows) {
    const place_id = safeStr(r?.place_id);
    const name = safeStr(r?.name);
    const address = safeStr(r?.address);
    const lat = safeNum(r?.lat, NaN);
    const lng = safeNum(r?.lng, NaN);
    if (!place_id) continue;
    if (!name || !address) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    out.push({
      place_id,
      name,
      address,
      lat,
      lng,
      primary_genre: r?.primary_genre == null ? null : safeStr(r?.primary_genre, "").trim() || null,
      genre_tags: Array.isArray(r?.genre_tags) ? r.genre_tags.map((x: any) => String(x)) : null,
    });
  }
  return out;
}

/** =========================
 * DB: evidence posts (exclude self)
 * + add k-hop distance
 * ========================= */
function pickThumbFromImageVariants(image_variants: any): string | null {
  if (!Array.isArray(image_variants)) return null;
  const first = image_variants[0];
  const thumb = typeof first?.thumb === "string" ? first.thumb : null;
  return thumb && thumb.trim() ? thumb : null;
}

async function loadEvidencePostsForPlaces(args: {
  supabase: any;
  placeIds: string[];
  userId: string;
  distanceMap: Map<string, number>; // user -> hop
  perPlace?: number;
}) {
  const { supabase, placeIds, userId, distanceMap } = args;
  const perPlace = Math.max(1, Math.min(6, args.perPlace ?? 3));
  const ids = placeIds.filter(Boolean);
  if (ids.length === 0) return new Map<string, EvidencePost[]>();

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id,user_id,content,created_at,image_variants,recommend_score,price_yen,price_range,place_id, profiles:profiles(id,display_name,username,avatar_url)"
    )
    .in("place_id", ids)
    .neq("user_id", userId) // ✅ 自分自身は除外
    .order("created_at", { ascending: false })
    .limit(800);

  if (error) throw new Error(`Failed to load posts: ${error.message}`);

  const grouped = new Map<string, EvidencePost[]>();

  for (const row of (data ?? []) as any[]) {
    const place_id = safeStr(row?.place_id);
    if (!place_id) continue;

    const authorId = safeStr(row?.user_id);
    if (!authorId) continue;
    if (authorId === userId) continue; // 念のため

    const k = distanceMap.get(authorId) ?? null;
    const isDirect = k === 1;

    const prof = row?.profiles ?? null;
    const display_name_raw = prof?.display_name ? String(prof.display_name) : null;
    const username_raw = prof?.username ? String(prof.username) : null;
    const avatar_url_raw = prof?.avatar_url ? String(prof.avatar_url) : null;

    // ✅ フォロー関係に関係なく「任意の人」に対して出してOK
    const author_display_name = display_name_raw || username_raw || null;
    const author_username = username_raw || null;
    const author_avatar_url = avatar_url_raw || null;

    const ev: EvidencePost = {
      post_id: safeStr(row?.id),
      post_url: `/posts/${safeStr(row?.id)}`,
      created_at: row?.created_at ?? null,
      content: typeof row?.content === "string" ? row.content : null,
      recommend_score: row?.recommend_score == null ? null : Number(row.recommend_score),
      price_yen: row?.price_yen == null ? null : Number(row.price_yen),
      price_range: row?.price_range == null ? null : String(row.price_range),
      image_thumb_url: pickThumbFromImageVariants(row?.image_variants),

      author_display_name,
      author_username,
      author_avatar_url,

      distance_k: k,
      is_direct_follow: isDirect,
    };

    if (!grouped.has(place_id)) grouped.set(place_id, []);
    grouped.get(place_id)!.push(ev);
  }

  // placeごとに優先順：
  //  1) direct follow (k=1)
  //  2) 小さいk
  //  3) recommend_score
  //  4) 新しい順
  for (const [pid, arr] of grouped.entries()) {
    arr.sort((a, b) => {
      const da = a.distance_k ?? 1e9;
      const db = b.distance_k ?? 1e9;
      const aDirect = a.is_direct_follow ? 1 : 0;
      const bDirect = b.is_direct_follow ? 1 : 0;
      if (bDirect !== aDirect) return bDirect - aDirect;
      if (da !== db) return da - db;

      const ra = a.recommend_score ?? -1;
      const rb = b.recommend_score ?? -1;
      if (rb !== ra) return rb - ra;

      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });
    grouped.set(pid, arr.slice(0, perPlace));
  }

  return grouped;
}

/** =========================
 * Social scoring per place
 *  - weight = 1/k (k hop)
 *  - use recommend_score if present
 * ========================= */
function computeSocialScore(evidence: EvidencePost[]) {
  let score = 0;
  let closestK: number | null = null;

  for (const p of evidence ?? []) {
    const k = p.distance_k;
    if (!k || k <= 0) continue;

    if (closestK == null || k < closestK) closestK = k;

    const w = 1 / k;
    const rs = p.recommend_score == null ? 0.7 : clamp(p.recommend_score / 10, 0, 1);
    score += w * rs;
  }

  // ざっくり 0..数点 に収まる想定
  return { social_score: score, closest_k: closestK };
}

/** =========================
 * LLM rank (poolにsocialヒントも渡す)
 * ========================= */
function compactHistoryForPrompt(history: Array<{ role: string; content: string }>, maxMsgs = 20, maxChars = 240) {
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
  pool: Array<Candidate & { distance_km?: number | null; social_score?: number; closest_k?: number | null }>;
  allowDistance: boolean;
  history: Array<{ role: string; content: string }>;
}) {
  const { openai, userQuery, centerLabel, maxResults, genresFromQuery, genreFilterApplied, pool, allowDistance, history } =
    args;

  const compact = pool
    .slice()
    .sort((a, b) => (a.distance_km ?? 1e18) - (b.distance_km ?? 1e18))
    .map((c) => ({
      place_id: c.place_id,
      name: c.name,
      address: c.address,
      distance_km:
        allowDistance && Number.isFinite(c.distance_km as any) ? Number((c.distance_km as number).toFixed(2)) : null,
      primary_genre: c.primary_genre ?? null,
      genre_tags: Array.isArray(c.genre_tags) ? c.genre_tags : null,

      // ✅ social proximity hint（LLMが“友達の輪”で優先しやすいように）
      social_score: typeof c.social_score === "number" ? Number(c.social_score.toFixed(3)) : 0,
      closest_k: c.closest_k ?? null,
    }));

  const instructions =
    "あなたは飲食店レコメンドの文章生成AIです。" +
    "会話履歴を踏まえて、ユーザーの意図を自然に補完してください（ただし捏造はしない）。" +
    "候補一覧の place_id から必ず選んでください。" +
    (allowDistance
      ? "距離がある場合は近さを強く優先。ただしユーザーの希望ジャンルが明確なら一致も重視。"
      : "距離情報がないので、ジャンル一致・店名・住所のヒントを重視。") +
    "social_score が高い候補は『信頼できるつながりの投稿が多い』という意味なので、同条件なら優先してよい。" +
    "JSONだけを返す。";

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

  const historyText = compactHistoryForPrompt(history, 20, 240);

  const input =
    `会話履歴（古い→新しい）:\n${historyText || "（なし）"}\n\n` +
    `中心地: ${centerLabel ?? "（未指定）"}\n` +
    `ユーザー文: ${userQuery}\n` +
    `maxResults: ${maxResults}\n` +
    `ユーザー文から拾えた料理ジャンル(参考): ${genresFromQuery.length ? genresFromQuery.join(", ") : "なし"}\n` +
    `ジャンルで事前に絞ったか: ${genreFilterApplied ? "はい" : "いいえ"}\n` +
    `候補一覧:\n${JSON.stringify(compact, null, 2)}\n\n${formatHint}`;

  const resp = await openai.responses.create({
    model: process.env.OPENAI_MODEL_RECOMMEND_MAP || "gpt-4.1-mini",
    instructions,
    input,
  });

  const obj = extractFirstJsonObject(resp.output_text || "") || {};
  const understood: Understood = obj?.understood?.summary
    ? obj.understood
    : { summary: "ユーザーの希望に合うお店を候補から選びます。", extracted_tags: [] };

  const poolSet = new Set(pool.map((p) => p.place_id));
  let results = Array.isArray(obj?.results) ? obj.results : [];
  results = results.filter((r: any) => poolSet.has(safeStr(r?.place_id))).slice(0, maxResults);

  const assistant_message_raw = typeof obj?.assistant_message === "string" ? obj.assistant_message.trim() : null;

  return {
    understood,
    results: results as Picked[],
    assistant_message: assistant_message_raw && assistant_message_raw.length ? assistant_message_raw : null,
  };
}

/** =========================
 * GET: history
 * ========================= */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const thread_id = (url.searchParams.get("thread_id") ?? "").trim();
  if (!thread_id) return NextResponse.json({ ok: false, error: "thread_id is required" }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userRes?.user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  const userId = userRes.user.id;

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

  return NextResponse.json({ ok: true, thread_id, messages: (data ?? []) as MsgRow[] });
}

/** =========================
 * POST: main
 * ========================= */
export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = (await req.json().catch(() => ({}))) as ApiBody;

  const message = (body?.message ?? "").toString().trim();
  const maxResults = clamp(Number(body?.maxResults ?? 4), 1, 10);
  if (!message) return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const userId = userRes.user.id;

  let thread_id: string;
  try {
    thread_id = await ensureThreadId({ supabase, userId, threadId: body?.threadId ?? null });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to ensure thread" }, { status });
  }

  setThreadTitleIfEmpty({ supabase, threadId: thread_id, userId, title: message }).catch(() => {});

  try {
    await insertMessage({
      supabase,
      threadId: thread_id,
      userId,
      role: "user",
      content: message,
      meta: { maxResults },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to log user message" }, { status: 500 });
  }

  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || "";
  if (!openaiKey) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY is missing" }, { status: 500 });
  const openai = new OpenAI({ apiKey: openaiKey });

  const googleKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_GEOCODING_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    "";

  let history: Array<{ role: string; content: string }> = [];
  try {
    history = await loadHistory({ supabase, threadId: thread_id, limit: 40 });
  } catch {
    history = [];
  }

  let candidates: Candidate[] = [];
  try {
    candidates = await loadCandidatesFromPlaces({ supabase, limit: 2000 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to load candidates" }, { status: 500 });
  }

  if (candidates.length === 0) {
    const resp = {
      ok: true,
      thread_id,
      understood: { summary: "候補がありません（placesテーブルが空です）。", extracted_tags: [] },
      assistant_message: "まずは投稿を増やすと、ここにおすすめが出せるようになります。",
      results: [] as ApiResult[],
      meta: { ms: Date.now() - startedAt, trace: "empty_places" },
    };

    await insertMessage({
      supabase,
      threadId: thread_id,
      userId,
      role: "assistant",
      content: [resp.understood.summary, resp.assistant_message].filter(Boolean).join("\n\n"),
      meta: resp,
    }).catch(() => {});

    return NextResponse.json(resp);
  }

  const trace: string[] = [];
  trace.push("------- __start__ -------");

  // 1) genres
  const genresFromQuery = extractGenresFromQuery(message);
  trace.push(`genresFromQuery: ${genresFromQuery.join(", ") || "none"}`);

  // 2) genre filter
  const { filtered: genreFiltered, applied: genreFilterApplied } = filterCandidatesByGenre({
    candidates,
    genres: genresFromQuery,
    maxResults,
  });
  trace.push(`genreFilterApplied: ${genreFilterApplied} candidates(after): ${genreFiltered.length}`);

  // 3) infer location
  const coarse = normalizeScopeTerms(message);
  const inferred = await inferLocationText(openai, message);
  const locationText = coarse || inferred.location_query;
  trace.push(`locationText: ${locationText ?? "null"}`);

  // 4) geocode
  let geo: Geo | null = null;
  let center: { lat: number; lng: number } | null = null;
  let centerLabel: string | null = null;
  if (googleKey && locationText) {
    geo = await geocode(locationText, googleKey);
    if (geo) {
      center = { lat: geo.lat, lng: geo.lng };
      centerLabel = geo.formatted_address || locationText;
    }
  }
  trace.push(`center: ${center ? "set" : "null"}`);

  // 5) radius
  let hardMaxKm = 0;
  let hardBasis = "no_center";
  if (center) {
    const rr = decideHardMaxRadiusKm({ userQuery: message, geo });
    hardMaxKm = rr.hardMaxKm;
    hardBasis = rr.basis;
  }
  trace.push(`hardMaxKm: ${center ? hardMaxKm.toFixed(2) : "n/a"} basis=${hardBasis}`);

  // 6) in-scope
  let withDist: Array<Candidate & { distance_km?: number | null }> = [];
  if (!center) {
    withDist = genreFiltered.map((c) => ({ ...c, distance_km: null }));
  } else {
    withDist = genreFiltered
      .map((c) => ({ ...c, distance_km: haversineKm(center!, { lat: c.lat, lng: c.lng }) }))
      .sort((a, b) => (a.distance_km! - b.distance_km!));
  }

  let inScope = withDist;
  let scopeRelaxed = false;
  if (center) {
    const narrowed = withDist.filter((x) => (x.distance_km ?? 1e18) <= hardMaxKm);
    if (narrowed.length === 0) {
      inScope = withDist.slice(0, 80);
      scopeRelaxed = true;
    } else {
      inScope = narrowed;
    }
  }
  trace.push(`inScope: ${inScope.length} scopeRelaxed=${scopeRelaxed}`);

  // 7) pool
  const pool = inScope.slice(0, 80);
  trace.push(`pool: ${pool.length}`);

  // ✅ social: distance map（k-hop）
  const distanceMap = await computeFollowDistances({ supabase, userId, maxHops: 3, maxNodes: 3000 });
  trace.push(`distanceMap.size: ${distanceMap.size}`);

  // ✅ poolのplace_idに対して evidence を取って social_score を付ける（LLMにも渡す）
  const poolPlaceIds = pool.map((p) => p.place_id);
  let evidenceMapPool = new Map<string, EvidencePost[]>();
  try {
    evidenceMapPool = await loadEvidencePostsForPlaces({
      supabase,
      placeIds: poolPlaceIds,
      userId,
      distanceMap,
      perPlace: 3,
    });
  } catch (e: any) {
    trace.push(`warn: evidence(pool) failed: ${e?.message ?? "unknown"}`);
  }

  const poolWithSocial = pool.map((p) => {
    const ev = evidenceMapPool.get(p.place_id) ?? [];
    const { social_score, closest_k } = computeSocialScore(ev);
    return { ...p, social_score, closest_k };
  });

  // 8) rank by LLM（social_scoreヒント込み）
  let understood: Understood = { summary: "ユーザーの希望に合うお店を候補から選びます。", extracted_tags: [] };
  let picked: Picked[] = [];
  let assistant_message: string | null = null;

  try {
    const llm = await rankWithLLM({
      openai,
      userQuery: message,
      centerLabel,
      maxResults,
      genresFromQuery,
      genreFilterApplied,
      pool: poolWithSocial,
      allowDistance: !!center,
      history,
    });

    understood = llm.understood;
    picked = llm.results;
    assistant_message = llm.assistant_message;

    if (!center && !assistant_message) {
      assistant_message = "どのあたりで探すか（例：駅名やエリア名）も入れてくれると、近い順で精度が上がるよ。";
    }
    if (genresFromQuery.length > 0 && (locationText || center)) assistant_message = null;

    trace.push(`picked: ${picked.length}`);
  } catch {
    picked = poolWithSocial.slice(0, maxResults).map((p) => ({
      place_id: p.place_id,
      headline: p.name,
      subline: p.address,
      reason: "近い候補から表示しています（推薦が不安定だったので簡易表示）。",
      match_score: 45,
    }));
    assistant_message = center ? null : "どのあたりで探すか（駅名やエリア名）も入れてくれると、近い順で精度が上がるよ。";
    trace.push("LLM failed -> fallback");
  }

  // 9) merge
  const byId = new Map(poolWithSocial.map((p) => [p.place_id, p]));
  let resultsBase = picked
    .map((r) => {
      const p = byId.get(r.place_id);
      if (!p) return null;
      return {
        id: r.place_id,
        place_id: r.place_id,
        headline: r.headline || p.name,
        subline: r.subline || p.address,
        reason: r.reason || "",
        match_score: clamp(safeNum(r.match_score, 50), 0, 100),
        lat: p.lat,
        lng: p.lng,
        name: p.name,
        address: p.address,
        primary_genre: p.primary_genre ?? null,
        genre_tags: Array.isArray(p.genre_tags) ? p.genre_tags : null,
        distance_km: center && Number.isFinite(p.distance_km as any) ? Number((p.distance_km as number).toFixed(3)) : null,
        social_score: typeof p.social_score === "number" ? p.social_score : 0,
        closest_k: p.closest_k ?? null,
      };
    })
    .filter(Boolean) as Omit<ApiResult, "evidence_posts">[];

  if (resultsBase.length < maxResults) {
    const already = new Set(resultsBase.map((x) => x.place_id));
    for (const p of poolWithSocial) {
      if (resultsBase.length >= maxResults) break;
      if (already.has(p.place_id)) continue;
      resultsBase.push({
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
        distance_km: center && Number.isFinite(p.distance_km as any) ? Number((p.distance_km as number).toFixed(3)) : null,
        social_score: typeof p.social_score === "number" ? p.social_score : 0,
        closest_k: p.closest_k ?? null,
      });
    }
  }

  // ✅ social proximity を “推薦スコア” にも反映（並び替え + match_score調整）
  //  - match_score += round( social_score * 12 )  (上限 12点程度)
  //  - 同点なら social_score→距離
  resultsBase = resultsBase
    .map((r) => {
      const boost = clamp(Math.round((r.social_score ?? 0) * 12), 0, 12);
      return { ...r, match_score: clamp((r.match_score ?? 0) + boost, 0, 100) };
    })
    .sort((a, b) => {
      const ds = (b.match_score ?? 0) - (a.match_score ?? 0);
      if (Math.abs(ds) >= 6) return ds;
      const ss = (b.social_score ?? 0) - (a.social_score ?? 0);
      if (Math.abs(ss) >= 0.05) return ss;
      const da = a.distance_km ?? 1e18;
      const db = b.distance_km ?? 1e18;
      return da - db;
    })
    .slice(0, maxResults);

  // ✅ evidence_posts を最終結果に付与（poolで取ったやつを流用）
  const results: ApiResult[] = resultsBase.map((r) => {
    const evidence = evidenceMapPool.get(r.place_id) ?? [];

    // ✅ 「〇〇さんも行って褒めてた」コメントは “direct follow (k=1)” の投稿がある時だけ
    const direct = evidence.find((p) => p.is_direct_follow && p.author_display_name);
    let reason = r.reason;

    if (direct) {
      const quoted = direct.content && direct.content.trim() ? `「${clipText(direct.content, 60)}」` : "と褒めてました";
      // 「あなたがフォローしている」みたいな文言は入れない
      reason = `${reason}\n\n${direct.author_display_name}さんも行って、${quoted}。`;
    }

    return {
      ...(r as any),
      reason,
      evidence_posts: evidence,
    };
  });

  const resp = {
    ok: true,
    thread_id,
    understood,
    assistant_message,
    location: center
      ? {
          location_text: locationText,
          location_reason: inferred.reason_short || "",
          center: { ...center, label: centerLabel ?? "" },
          hard_max_km: Number(hardMaxKm.toFixed(3)),
          hard_basis: hardBasis,
          scope_relaxed: !!scopeRelaxed,
        }
      : {
          location_text: locationText,
          location_reason: inferred.reason_short || "",
          center: null,
          hard_max_km: null,
          hard_basis: "no_center",
          scope_relaxed: false,
        },
    results,
    meta: {
      ms: Date.now() - startedAt,
      trace: trace.join("\n"),
      candidates_count: candidates.length,
      pool_count: pool.length,
      genres_from_query: genresFromQuery,
      genre_filter_applied: genreFilterApplied,
      social_max_hops: 3,
    },
  };

  const assistantText = [
    resp?.understood?.summary ?? "",
    typeof resp?.assistant_message === "string" ? resp.assistant_message : "",
  ]
    .map((s: string) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  await insertMessage({
    supabase,
    threadId: thread_id,
    userId,
    role: "assistant",
    content: assistantText || "（おすすめをまとめました）",
    meta: resp,
  }).catch(() => {});

  return NextResponse.json(resp);
}
