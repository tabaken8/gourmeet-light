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
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photo_url?: string | null;

  primary_genre?: string | null;
  genre_tags?: string[]; // NOT NULL default '{}'::text[]
};

type ChatBody = {
  message?: string;
  threadId?: string | null;
  maxResults?: number;
};

type Understood = {
  summary: string;
  extracted_tags: string[];
};

type EvidencePost = {
  post_id: string;
  author_id: string;
  author_display_name: string | null;
  author_avatar_url: string | null;

  content: string | null;
  created_at: string;
  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;

  image_thumb_url: string | null;
  post_url: string;

  // social graph
  k_distance: number | null; // shortest k hops from viewer -> author (directed follows)
  is_direct_follow: boolean;
  weight: number; // computed for sorting
};

type Picked = {
  place_id: string;
  headline: string;
  subline: string;
  reason: string;
  match_score: number;
};

type ApiResponse = {
  ok: boolean;
  thread_id: string;
  understood: Understood;
  assistant_message: string | null;
  results: Array<{
    place_id: string;
    headline: string;
    subline: string;
    reason: string;
    match_score: number;

    lat: number | null;
    lng: number | null;
    name: string | null;
    address: string | null;
    photo_url: string | null;

    primary_genre: string | null;
    genre_tags: string[];

    distance_km: number | null;

    social_score: number;
    closest_k: number | null;

    evidence_posts: EvidencePost[];
  }>;
  meta: any;
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

function clipText(s: string, n: number) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n) + "…";
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
 * Thread title (FIX)
 *  - 新規/未設定(title is null)のみ自動で付与
 * ========================= */
function pickAreaLabel(centerLabel: string | null): string | null {
  const s = (centerLabel ?? "").trim();
  if (!s) return null;

  const cleaned = s
    .replace(/^日本[、,]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const head = cleaned.split(/[、,]/)[0]?.trim() || cleaned;
  return head.length ? head : null;
}

function normalizeTitlePiece(s: string) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[「」『』【】（）()\[\]<>]/g, "")
    .trim();
}

function clipTitle(s: string, max = 28) {
  const t = normalizeTitlePiece(s);
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function buildThreadTitle(args: {
  message: string;
  centerLabel: string | null;
  understoodTags: string[];
  genreTerms: string[];
}) {
  const msg = normalizeTitlePiece(args.message);
  const area = pickAreaLabel(args.centerLabel);

  const tagPool = [
    ...(args.understoodTags ?? []),
    ...(args.genreTerms ?? []),
  ]
    .map((x) => normalizeTitlePiece(String(x)))
    .filter(Boolean);

  const genre = tagPool[0] ?? null;

  if (area && genre) return clipTitle(`${area}で${genre}`);
  if (area) return clipTitle(`${area}でおすすめ`);
  if (genre) return clipTitle(`${genre}探し`);
  return clipTitle(msg || "チャット");
}

async function maybeSetThreadTitle(args: {
  supabase: any;
  userId: string;
  threadId: string;
  title: string;
}) {
  const { supabase, userId, threadId, title } = args;
  const t = title.trim();
  if (!t) return;

  // ✅ 既存タイトルは上書きしない（title が null のときだけ）
  await supabase
    .from("ai_threads")
    .update({ title: t })
    .eq("id", threadId)
    .eq("user_id", userId)
    .is("title", null);
}

/** =========================
 * Geo (distance)
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
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type Geo = {
  lat: number;
  lng: number;
  formatted_address: string;
  types: string[];
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

  const types = Array.isArray(first?.types) ? first.types.map((t: any) => String(t)) : [];

  return {
    lat: Number(lat),
    lng: Number(lng),
    formatted_address: safeStr(first?.formatted_address, ""),
    types,
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

function decideHardMaxRadiusKm(userQuery: string, geo: Geo | null): { hardMaxKm: number; basis: string } {
  const q = userQuery || "";
  const wantsNear =
    q.includes("近く") || q.includes("徒歩") || q.includes("今から") || q.includes("すぐ") || q.includes("駅近");

  const wantsFar = q.includes("旅行") || q.includes("遠出") || q.includes("出張") || q.includes("ドライブ");

  if (geo?.types?.length) {
    const types = new Set(geo.types);
    let hardMaxKm = 30;

    if (types.has("neighborhood") || types.has("sublocality") || types.has("sublocality_level_1")) hardMaxKm = 8;
    else if (types.has("locality")) hardMaxKm = 25;
    else if (types.has("administrative_area_level_1")) hardMaxKm = 150;
    else if (types.has("country")) hardMaxKm = 2000;

    if (wantsNear) hardMaxKm = Math.max(3, hardMaxKm * 0.7);
    if (wantsFar) hardMaxKm = Math.min(2000, hardMaxKm * 1.25);

    return { hardMaxKm, basis: "geo.types" };
  }

  const coarse = normalizeScopeTerms(q);
  if (coarse === "東京都") return { hardMaxKm: wantsNear ? 25 : 60, basis: "keyword:都内/東京" };
  if (coarse === "東京都23区") return { hardMaxKm: wantsNear ? 18 : 45, basis: "keyword:23区" };
  if (coarse === "関東地方") return { hardMaxKm: wantsNear ? 120 : 350, basis: "keyword:関東" };
  if (coarse === "日本") return { hardMaxKm: 2000, basis: "keyword:全国/日本" };

  return { hardMaxKm: wantsFar ? 200 : 50, basis: "fallback" };
}

/** =========================
 * Threads & messages (ai_threads / ai_thread_messages)
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

/** =========================
 * LLM: infer location & genre terms
 * ========================= */
async function inferLocationText(openai: OpenAI, userQuery: string) {
  const instructions =
    "あなたは地名推定器です。ユーザー文から『検索の中心地』としてジオコーディング可能な地名文字列を1つ推定して返してください。" +
    "料理ジャンル（例: ラーメン/中華そば/寿司/焼肉/カフェ等）や国名形容（例: イタリア料理）は地名ではありません。地名として返してはいけません。" +
    "不明なら null。必ずJSONだけを返す。";
  const formatHint = `{
  "location_query": string|null,
  "reason_short": string
}`;

  try {
    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL_RECOMMEND_MAP || "gpt-4.1-mini",
      instructions,
      input: `ユーザー文:\n${userQuery}\n\n出力形式:\n${formatHint}`,
    });

    const obj = extractFirstJsonObject(resp.output_text || "");
    const location_query =
      typeof obj?.location_query === "string" && obj.location_query.trim()
        ? obj.location_query.trim()
        : null;
    return { location_query, reason_short: safeStr(obj?.reason_short, "") };
  } catch {
    return { location_query: null as string | null, reason_short: "" };
  }
}

async function inferGenreTerms(openai: OpenAI, userQuery: string) {
  const instructions =
    "あなたは飲食店ジャンルの検索語生成器です。" +
    "ユーザー文から、検索時に使うと良いジャンル語・同義語・近縁語を5〜12個程度まで挙げてください。" +
    "例: 中華そば -> ラーメン, つけ麺, 魚介豚骨 など。" +
    "地名は含めない。必ずJSONだけを返す。";
  const formatHint = `{
  "genre_terms": string[],
  "reason_short": string
}`;

  try {
    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL_RECOMMEND_MAP || "gpt-4.1-mini",
      instructions,
      input: `ユーザー文:\n${userQuery}\n\n出力形式:\n${formatHint}`,
    });

    const obj = extractFirstJsonObject(resp.output_text || "") || {};
    const genre_terms = Array.isArray(obj?.genre_terms)
      ? uniq(obj.genre_terms.map((x: any) => String(x)).map((s: string) => s.trim()).filter(Boolean))
      : [];
    return { genre_terms, reason_short: safeStr(obj?.reason_short, "") };
  } catch {
    return { genre_terms: [] as string[], reason_short: "" };
  }
}

function candidateMatchesAnyGenreTerm(c: Candidate, terms: string[]) {
  if (!terms.length) return true;

  const pg = normalizeStrLoose(c.primary_genre || "");
  const tags = Array.isArray(c.genre_tags) ? c.genre_tags.map((t) => normalizeStrLoose(String(t))) : [];
  const name = normalizeStrLoose(c.name || "");

  for (const t of terms) {
    const tt = normalizeStrLoose(t);
    if (!tt) continue;
    if (pg && pg.includes(tt)) return true;
    if (tags.some((x) => x.includes(tt))) return true;
    if (name.includes(tt)) return true;
  }
  return false;
}

/** =========================
 * Fetch candidates from public.places
 * ========================= */
async function loadPlacesCandidates(args: {
  supabase: any;
  limit: number;
}): Promise<Candidate[]> {
  const { supabase, limit } = args;

  const { data, error } = await supabase
    .from("places")
    .select("place_id,name,address,lat,lng,photo_url,primary_genre,genre_tags")
    .order("updated_at", { ascending: false })
    .limit(clamp(limit, 200, 2000));

  if (error) throw new Error(`Failed to load places: ${error.message}`);

  const rows = (data ?? []) as any[];
  return rows
    .map((r) => ({
      place_id: safeStr(r.place_id),
      name: r.name ?? null,
      address: r.address ?? null,
      lat: r.lat == null ? null : Number(r.lat),
      lng: r.lng == null ? null : Number(r.lng),
      photo_url: r.photo_url ?? null,
      primary_genre: r.primary_genre ?? null,
      genre_tags: Array.isArray(r.genre_tags) ? r.genre_tags.map((x: any) => String(x)) : [],
    }))
    .filter((x) => x.place_id);
}

/** =========================
 * Evidence posts & profiles
 * ========================= */
async function loadEvidencePosts(args: {
  supabase: any;
  placeIds: string[];
  viewerId: string;
}) {
  const { supabase, placeIds, viewerId } = args;
  if (!placeIds.length) return new Map<string, any[]>();

  const { data, error } = await supabase
    .from("posts")
    .select("id,user_id,content,created_at,image_variants,recommend_score,price_yen,price_range,place_id")
    .in("place_id", placeIds)
    .neq("user_id", viewerId);

  if (error) throw new Error(`Failed to load posts: ${error.message}`);
  const rows = (data ?? []) as any[];

  const authorIds = uniq(rows.map((r) => String(r.user_id)).filter(Boolean));
  const byAuthor = new Map<string, { display_name: string | null; avatar_url: string | null }>();

  if (authorIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url")
      .in("id", authorIds);

    if (!pErr && profs) {
      for (const p of profs as any[]) {
        byAuthor.set(String(p.id), {
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
        });
      }
    }
  }

  const byPlace = new Map<string, any[]>();
  for (const r of rows) {
    const pid = safeStr(r.place_id);
    if (!pid) continue;
    const arr = byPlace.get(pid) ?? [];
    arr.push({
      id: String(r.id),
      user_id: String(r.user_id),
      content: r.content ?? null,
      created_at: String(r.created_at ?? ""),
      recommend_score: r.recommend_score == null ? null : Number(r.recommend_score),
      price_yen: r.price_yen == null ? null : Number(r.price_yen),
      price_range: r.price_range ?? null,
      image_variants: r.image_variants ?? null,
      author_display_name: byAuthor.get(String(r.user_id))?.display_name ?? null,
      author_avatar_url: byAuthor.get(String(r.user_id))?.avatar_url ?? null,
    });
    byPlace.set(pid, arr);
  }

  return byPlace;
}

/** =========================
 * Follow graph: shortest k hops
 * (viewer -> ... -> author)
 * ========================= */
async function computeKDists(args: {
  supabase: any;
  viewerId: string;
  targetUserIds: string[];
  kMax?: number;
}) {
  const { supabase, viewerId, targetUserIds } = args;
  const kMax = clamp(args.kMax ?? 4, 1, 6);
  const targets = new Set(targetUserIds.filter(Boolean));
  const dist = new Map<string, number>();

  if (!targets.size) return dist;
  if (targets.has(viewerId)) targets.delete(viewerId);

  let frontier = new Set<string>([viewerId]);
  let visited = new Set<string>([viewerId]);

  for (let depth = 1; depth <= kMax; depth++) {
    const from = Array.from(frontier);
    if (!from.length) break;

    const { data, error } = await supabase
      .from("follows")
      .select("follower_id,followee_id,status")
      .in("follower_id", from)
      .eq("status", "accepted");

    if (error) break;

    const next = new Set<string>();
    for (const row of (data ?? []) as any[]) {
      const to = String(row.followee_id);
      if (!to || visited.has(to)) continue;
      visited.add(to);
      next.add(to);
      if (targets.has(to) && !dist.has(to)) dist.set(to, depth);
    }

    let allFound = true;
    for (const t of targets) {
      if (!dist.has(t)) {
        allFound = false;
        break;
      }
    }
    if (allFound) break;

    frontier = next;
  }

  return dist;
}

/** =========================
 * Social score per place
 * ========================= */
function daysAgoIso(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 9999;
  const now = Date.now();
  return Math.max(0, (now - t) / (1000 * 60 * 60 * 24));
}

function postThumbFromVariants(image_variants: any): string | null {
  const arr = Array.isArray(image_variants) ? image_variants : null;
  const first = arr?.[0];
  const thumb = first?.thumb;
  return typeof thumb === "string" && thumb ? thumb : null;
}

function computeSocialScore(evidence: EvidencePost[]) {
  let social_score = 0;
  let closest_k: number | null = null;

  for (const p of evidence) {
    const k = p.k_distance;
    if (k != null) closest_k = closest_k == null ? k : Math.min(closest_k, k);

    const hop = k == null ? 0 : 1 / Math.max(1, k);
    const rs = p.recommend_score == null ? 0 : clamp(p.recommend_score, 0, 10);
    const scoreBoost = 0.6 + (rs / 10) * 0.9;
    const recency = Math.exp(-daysAgoIso(p.created_at) / 45);
    social_score += hop * scoreBoost * recency;
  }

  return { social_score, closest_k };
}

function makeDirectHint(evidence: EvidencePost[]) {
  const direct = (evidence ?? []).find((p) => p.is_direct_follow && p.author_display_name);
  if (!direct) return null;

  const excerpt =
    direct.content && direct.content.trim() ? clipText(direct.content, 60) : null;

  return { author: direct.author_display_name!, excerpt };
}

function stablePickTemplate(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 4;
}

function appendSocialOneLiner(args: { base: string; hint: { author: string; excerpt: string | null } }) {
  const { base, hint } = args;
  const a = hint.author;
  const ex = hint.excerpt;

  const variants = [
    ex ? `${a}さんの投稿でも「${ex}」とかなり高評価でした。` : `${a}さんの投稿でも評判が良かったお店です。`,
    ex ? `${a}さんも訪れていて、「${ex}」というコメントが残っていました。` : `${a}さんも行っていて、好意的な投稿がありました。`,
    ex ? `ちなみに、${a}さんが「${ex}」と書いていて、期待値が上がります。` : `ちなみに、${a}さんの投稿でもおすすめに挙がっていました。`,
    ex ? `${a}さんの感想が「${ex}」で、安心して推しやすい一軒です。` : `${a}さんの投稿があるので、参考にしやすいです。`,
  ];

  const pick = variants[stablePickTemplate(a + (ex ?? ""))] || variants[0];
  return `${base}\n\n${pick}`;
}

/** =========================
 * LLM Ranking
 * ========================= */
async function rankWithLLM(args: {
  openai: OpenAI;
  userQuery: string;
  centerLabel: string | null;
  maxResults: number;
  pool: Array<
    Candidate & {
      distance_km: number | null;
      social_score: number;
      closest_k: number | null;
      direct_follow_hint: { author: string; excerpt: string | null } | null;
    }
  >;
  history: Array<{ role: string; content: string }>;
}) {
  const { openai, userQuery, centerLabel, maxResults, pool, history } = args;

  const compact = pool
    .slice()
    .sort((a, b) => (a.distance_km ?? 1e18) - (b.distance_km ?? 1e18))
    .map((c) => ({
      place_id: c.place_id,
      name: c.name ?? null,
      address: c.address ?? null,
      distance_km: c.distance_km != null ? Number(c.distance_km.toFixed(2)) : null,
      primary_genre: c.primary_genre ?? null,
      genre_tags: Array.isArray(c.genre_tags) ? c.genre_tags : [],
      social_score: Number((c.social_score ?? 0).toFixed(3)),
      closest_k: c.closest_k ?? null,
      direct_follow_hint: c.direct_follow_hint ?? null,
    }));

  const instructions =
    "あなたは飲食店レコメンドの文章生成AIです。" +
    "口調は必ず丁寧語（です・ます）。タメ口や独り言（例: えーと、うーん、〜だね）は禁止です。" +
    "文章は明るく前向きにしつつ、過度な煽りや誇張はしません。" +
    "会話履歴を踏まえてユーザーの意図を自然に補完してください（捏造はしない）。" +
    "候補一覧の place_id から必ず選んでください。" +
    "距離がある場合は近い候補を優先しつつ、ジャンル一致も重視してください。" +
    "social_score が高い候補は『信頼できるつながりの投稿が多い』という意味なので、同条件なら優先してよいです。" +
    "direct_follow_hint が null の候補について、特定ユーザーの体験談（『〇〇さんが〜』等）を持ち出してはいけません。" +
    "direct_follow_hint がある候補だけ、理由に自然な一文として織り込んでよいです（表現は毎回変えてよい）。" +
    "必ずJSONだけを返してください。";

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
    : { summary: "ご希望に合うお店を候補から選びます。", extracted_tags: [] as string[] };

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
 * POST /api/ai/chat
 * ========================= */
export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = (await req.json().catch(() => ({}))) as ChatBody;

  const message = (body?.message ?? "").toString().trim();
  const maxResults = clamp(Number(body?.maxResults ?? 4), 1, 10);

  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const userId = userRes.user.id;

  // thread 確保
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

  // user message を保存
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

  // 履歴（今回分も含める）
  let history: Array<{ role: string; content: string }> = [];
  try {
    history = await loadHistory({ supabase, threadId: thread_id, limit: 40 });
  } catch {
    history = [];
  }

  // 1) location 推定→ geocode
  const coarse = normalizeScopeTerms(message);
  const inferredLoc = await inferLocationText(openai, message);
  const locationText = coarse || inferredLoc.location_query;
  const locationReason = inferredLoc.reason_short || "";

  let geo: Geo | null = null;
  if (googleKey && locationText) {
    geo = await geocode(locationText, googleKey);
  }

  const center = geo ? { lat: geo.lat, lng: geo.lng } : null;
  const centerLabel = geo?.formatted_address || locationText || null;

  const { hardMaxKm, basis: hardBasis } = center
    ? decideHardMaxRadiusKm(message, geo)
    : { hardMaxKm: 0, basis: "no_center" };

  // 2) genre terms 推定
  const g = await inferGenreTerms(openai, message);
  const genreTerms = g.genre_terms;

  // 3) candidates
  let places: Candidate[] = [];
  try {
    places = await loadPlacesCandidates({ supabase, limit: 1500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to load candidates" }, { status: 500 });
  }

  // 4) genre で一次絞り
  let genreApplied = false;
  let filtered = places;
  if (genreTerms.length) {
    const hit = places.filter((c) => candidateMatchesAnyGenreTerm(c, genreTerms));
    const needAtLeast = Math.max(maxResults * 10, 60);
    if (hit.length >= needAtLeast) {
      filtered = hit;
      genreApplied = true;
    }
  }

  // 5) 距離計算 & scope
  const withDist = filtered
    .map((c) => {
      const lat = c.lat;
      const lng = c.lng;
      const distance_km =
        center && Number.isFinite(lat as any) && Number.isFinite(lng as any)
          ? haversineKm(center, { lat: Number(lat), lng: Number(lng) })
          : null;
      return { ...c, distance_km };
    })
    .sort((a, b) => (a.distance_km ?? 1e18) - (b.distance_km ?? 1e18));

  let inScope = withDist;
  let scopeRelaxed = false;

  if (center) {
    const scoped = withDist.filter((x) => (x.distance_km ?? 1e18) <= hardMaxKm);
    if (scoped.length) {
      inScope = scoped;
    } else {
      scopeRelaxed = true;
      inScope = withDist.slice(0, 120);
    }
  }

  const POOL_CAP = 90;
  const pool = inScope.slice(0, POOL_CAP);

  if (!pool.length) {
    const resp: ApiResponse = {
      ok: true,
      thread_id,
      understood: { summary: "候補が見つかりませんでした。条件を少し広げて試してみてください。", extracted_tags: [] },
      assistant_message: center
        ? "エリアを少し広め（例：市区町村や沿線）にしていただくと見つかりやすいです！"
        : "場所（駅名やエリア名）も入れていただくと精度が上がります！",
      results: [],
      meta: {
        ms: Date.now() - startedAt,
        candidates_count: places.length,
        filtered_count: filtered.length,
        pool_count: 0,
        location_text: locationText,
        location_reason: locationReason,
        hard_max_km: center ? hardMaxKm : null,
        hard_basis: hardBasis,
        genre_terms: genreTerms,
        genre_filter_applied: genreApplied,
        scope_relaxed: scopeRelaxed,
      },
    };

    // ✅ thread title を（未設定なら）付与
    try {
      const title = buildThreadTitle({
        message,
        centerLabel,
        understoodTags: resp.understood?.extracted_tags ?? [],
        genreTerms,
      });
      await maybeSetThreadTitle({ supabase, userId, threadId: thread_id, title });
    } catch {}

    const assistantText = [resp.understood.summary, resp.assistant_message].filter(Boolean).join("\n\n");
    try {
      await insertMessage({
        supabase,
        threadId: thread_id,
        userId,
        role: "assistant",
        content: assistantText,
        meta: resp,
      });
    } catch {}

    return NextResponse.json(resp);
  }

  // 6) Evidence posts
  const poolIds = pool.map((p) => p.place_id);
  let rawByPlace = new Map<string, any[]>();
  try {
    rawByPlace = await loadEvidencePosts({ supabase, placeIds: poolIds, viewerId: userId });
  } catch {
    rawByPlace = new Map();
  }

  // 7) follow graph の k
  const allAuthorIds = uniq(
    Array.from(rawByPlace.values())
      .flat()
      .map((p: any) => String(p.user_id))
      .filter(Boolean)
  );

  const kDist = await computeKDists({
    supabase,
    viewerId: userId,
    targetUserIds: allAuthorIds,
    kMax: 4,
  });

  // 8) EvidencePost に整形 + 重み付け
  const evidenceMap = new Map<string, EvidencePost[]>();

  for (const pid of poolIds) {
    const rows = rawByPlace.get(pid) ?? [];
    const ev: EvidencePost[] = rows.map((r: any) => {
      const authorId = String(r.user_id);
      const k = kDist.get(authorId) ?? null;

      const recommend = r.recommend_score == null ? null : Number(r.recommend_score);
      const hop = k == null ? 0 : 1 / Math.max(1, k);
      const scoreBoost = recommend == null ? 1 : 0.6 + (clamp(recommend, 0, 10) / 10) * 0.9;
      const recency = Math.exp(-daysAgoIso(String(r.created_at ?? "")) / 45);

      const weight = hop * scoreBoost * recency;

      const post_id = String(r.id);
      const post_url = `https://gourmeet.jp/posts/${post_id}`;

      return {
        post_id,
        author_id: authorId,
        author_display_name: r.author_display_name ?? null,
        author_avatar_url: r.author_avatar_url ?? null,
        content: r.content ?? null,
        created_at: String(r.created_at ?? ""),
        recommend_score: recommend,
        price_yen: r.price_yen == null ? null : Number(r.price_yen),
        price_range: r.price_range ?? null,
        image_thumb_url: postThumbFromVariants(r.image_variants),
        post_url,
        k_distance: k,
        is_direct_follow: k === 1,
        weight,
      };
    });

    ev.sort((a, b) => {
      const da = a.is_direct_follow ? 1 : 0;
      const db = b.is_direct_follow ? 1 : 0;
      if (db !== da) return db - da;
      const w = (b.weight ?? 0) - (a.weight ?? 0);
      if (Math.abs(w) > 1e-6) return w;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });

    evidenceMap.set(pid, ev.slice(0, 6));
  }

  // 9) social_score
  const poolWithSocial = pool.map((p) => {
    const ev = evidenceMap.get(p.place_id) ?? [];
    const { social_score, closest_k } = computeSocialScore(ev);
    const direct_follow_hint = makeDirectHint(ev);

    return {
      ...p,
      social_score,
      closest_k,
      direct_follow_hint,
    };
  });

  // 10) LLM rank
  let llmOut: { understood: Understood; assistant_message: string | null; results: Picked[] };
  try {
    llmOut = await rankWithLLM({
      openai,
      userQuery: message,
      centerLabel,
      maxResults,
      pool: poolWithSocial.map((p: any) => ({
        ...p,
        distance_km: (p as any).distance_km ?? null,
      })),
      history,
    });
  } catch {
    llmOut = {
      understood: { summary: "条件に合いそうなお店を近い順にまとめました！", extracted_tags: [] },
      assistant_message: center ? null : "場所（駅名やエリア名）も入れていただくと、近い順でさらに精度が上がります！",
      results: poolWithSocial.slice(0, maxResults).map((p, i) => ({
        place_id: p.place_id,
        headline: p.name ?? "（店名未設定）",
        subline: p.address ?? "",
        reason: "条件に近い候補から順にご提案します。",
        match_score: 60 - i * 2,
      })),
    };
  }

  // 11) final merge
  const byId = new Map(poolWithSocial.map((p: any) => [p.place_id, p]));
  const picked = llmOut.results.slice(0, maxResults);

  const results = picked
    .map((r) => {
      const p: any = byId.get(r.place_id);
      if (!p) return null;

      const ev = evidenceMap.get(r.place_id) ?? [];
      const hint = p.direct_follow_hint as { author: string; excerpt: string | null } | null;

      let reason = String(r.reason || "").trim();
      if (hint && hint.author && !reason.includes(hint.author)) {
        reason = appendSocialOneLiner({ base: reason || "おすすめ理由をまとめました。", hint });
      }

      return {
        place_id: r.place_id,
        headline: r.headline || (p.name ?? "（店名未設定）"),
        subline: r.subline || (p.address ?? ""),
        reason,
        match_score: safeNum(r.match_score, 50),

        lat: p.lat ?? null,
        lng: p.lng ?? null,
        name: p.name ?? null,
        address: p.address ?? null,
        photo_url: p.photo_url ?? null,

        primary_genre: p.primary_genre ?? null,
        genre_tags: Array.isArray(p.genre_tags) ? p.genre_tags : [],

        distance_km: p.distance_km != null ? Number(Number(p.distance_km).toFixed(3)) : null,

        social_score: Number((p.social_score ?? 0).toFixed(3)),
        closest_k: p.closest_k ?? null,

        evidence_posts: ev,
      };
    })
    .filter(Boolean) as ApiResponse["results"];

  let assistant_message = llmOut.assistant_message;
  if (!center && !assistant_message) {
    assistant_message = "場所（駅名やエリア名）も入れていただくと、近い順でさらに精度が上がります！";
  }

  const extracted = uniq([
    ...((llmOut.understood?.extracted_tags ?? []) as string[]),
    ...genreTerms.slice(0, 3),
  ]).slice(0, 10);

  const understood: Understood = {
    summary: llmOut.understood?.summary || "ご希望に合う候補をまとめました！",
    extracted_tags: extracted,
  };

  const resp: ApiResponse = {
    ok: true,
    thread_id,
    understood,
    assistant_message: assistant_message ?? null,
    results,
    meta: {
      ms: Date.now() - startedAt,
      candidates_count: places.length,
      filtered_count: filtered.length,
      pool_count: pool.length,
      location: center
        ? {
            location_text: locationText,
            location_reason: locationReason,
            center: { ...center, label: centerLabel ?? "" },
            hard_max_km: Number(hardMaxKm.toFixed(3)),
            hard_basis: hardBasis,
            scope_relaxed: scopeRelaxed,
          }
        : {
            location_text: locationText,
            location_reason: locationReason,
            center: null,
            hard_max_km: null,
            hard_basis: "no_center",
            scope_relaxed: false,
          },
      genre_terms: genreTerms,
      genre_filter_applied: genreApplied,
    },
  };

  // ✅ thread title を（未設定なら）付与（ここが「無題固定」バグの根治）
  try {
    const title = buildThreadTitle({
      message,
      centerLabel,
      understoodTags: resp.understood?.extracted_tags ?? [],
      genreTerms,
    });
    await maybeSetThreadTitle({ supabase, userId, threadId: thread_id, title });
  } catch {}

  // assistant をDBに保存
  const assistantText = [resp.understood.summary, resp.assistant_message].filter(Boolean).join("\n\n");
  try {
    await insertMessage({
      supabase,
      threadId: thread_id,
      userId,
      role: "assistant",
      content: assistantText || "（おすすめをまとめました）",
      meta: resp,
    });
  } catch {}

  return NextResponse.json(resp);
}

/** =========================
 * GET /api/ai/chat?thread_id=xxxx
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
    messages: data ?? [],
  });
}
