// src/app/api/places/suggest-type/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SuggestionSource = "places-new" | "places-classic" | "heuristic";

type Suggestion = {
  emoji: string;
  key: string;          // あなた側のカテゴリキー（保存用）
  matchedType: string;  // Google側で一致したtype（デバッグ用）
  source: SuggestionSource;
} | null;

// ====== あなたのカテゴリ設計（絵文字とキー） ======
const SUGGEST: Record<string, { emoji: string; key: string; score: number }> = {
  ramen_restaurant: { emoji: "🍜", key: "ramen", score: 110 },
  sushi_restaurant: { emoji: "🍣", key: "sushi", score: 110 },
  barbecue_restaurant: { emoji: "🥩", key: "yakiniku", score: 105 },
  izakaya: { emoji: "🍺", key: "izakaya", score: 104 },

  japanese_restaurant: { emoji: "🍱", key: "japanese", score: 100 },
  chinese_restaurant: { emoji: "🥟", key: "chinese", score: 100 },
  korean_restaurant: { emoji: "🥘", key: "korean", score: 98 },
  italian_restaurant: { emoji: "🍝", key: "italian", score: 98 },
  indian_restaurant: { emoji: "🍛", key: "indian", score: 95 },
  thai_restaurant: { emoji: "🌶️", key: "thai", score: 95 },
  vietnamese_restaurant: { emoji: "🍜", key: "vietnamese", score: 95 },

  cafe: { emoji: "☕", key: "cafe", score: 92 },
  coffee_shop: { emoji: "☕", key: "cafe", score: 90 },
  bakery: { emoji: "🥐", key: "bakery", score: 88 },
  bar: { emoji: "🍺", key: "bar", score: 85 },
  fast_food_restaurant: { emoji: "🍔", key: "fastfood", score: 84 },
  meal_takeaway: { emoji: "🥡", key: "takeaway", score: 82 },
  meal_delivery: { emoji: "🛵", key: "delivery", score: 80 },

  restaurant: { emoji: "🍽️", key: "restaurant", score: 60 },
  food: { emoji: "🍽️", key: "food", score: 55 },
};

const IGNORE = new Set([
  "point_of_interest",
  "establishment",
  "store",
  "premise",
  "route",
  "political",
  "locality",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "neighborhood",
]);

function pickFromTypes(types: string[], source: SuggestionSource): Suggestion {
  const best =
    types
      .filter((t) => !IGNORE.has(t))
      .map((t) => (SUGGEST[t] ? { type: t, ...SUGGEST[t] } : null))
      .filter(
        (x): x is { type: string; emoji: string; key: string; score: number } => !!x
      )
      .sort((a, b) => b.score - a.score)[0] ?? null;

  if (best) {
    return { emoji: best.emoji, key: best.key, matchedType: best.type, source };
  }

  if (types.includes("restaurant") || types.includes("food")) {
    return { emoji: "🍽️", key: "restaurant", matchedType: "restaurant", source };
  }

  return { emoji: "📍", key: "other", matchedType: "other", source };
}

function heuristicFromName(name: string | null | undefined): Suggestion {
  const n = (name ?? "").trim();
  if (!n) return null;

  const rules: Array<{ re: RegExp; type: string }> = [
    { re: /ラーメン|らーめん|拉麺/i, type: "ramen_restaurant" },
    { re: /寿司|鮨|すし/i, type: "sushi_restaurant" },
    { re: /焼肉|ホルモン/i, type: "barbecue_restaurant" },
    { re: /中華|餃子|担々/i, type: "chinese_restaurant" },
    { re: /韓国|サムギョプサル|チゲ/i, type: "korean_restaurant" },
    { re: /カフェ|珈琲|コーヒー/i, type: "cafe" },
    { re: /パン|ベーカリー/i, type: "bakery" },
    { re: /居酒屋/i, type: "izakaya" },
  ];

  const hit = rules.find((r) => r.re.test(n));
  if (!hit) return null;

  const meta = SUGGEST[hit.type];
  if (!meta) return null;

  return { emoji: meta.emoji, key: meta.key, matchedType: hit.type, source: "heuristic" };
}

async function fetchPlacesNew(placeId: string, apiKey: string) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ja`;

  const r = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,types,primaryType,formattedAddress",
    },
  });

  const j = await r.json().catch(() => null);
  return { ok: r.ok, httpStatus: r.status, json: j };
}

async function fetchPlacesClassic(placeId: string, apiKey: string) {
  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent("types,name")}` +
    `&language=ja` +
    `&key=${encodeURIComponent(apiKey)}`;

  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  return { ok: r.ok, httpStatus: r.status, json: j };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const placeId = String(body?.placeId ?? "").trim();
    if (!placeId) {
      return NextResponse.json({ error: "placeId is required" }, { status: 400 });
    }

    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Google API key is missing (set GOOGLE_MAPS_API_KEY)" },
        { status: 500 }
      );
    }

    // 1) Places API (New)
    const newRes = await fetchPlacesNew(placeId, apiKey);
    if (newRes.ok) {
      const types: string[] = Array.isArray(newRes.json?.types) ? newRes.json.types : [];
      const primaryType =
        typeof newRes.json?.primaryType === "string" ? newRes.json.primaryType : null;

      const byPrimary: Suggestion =
        primaryType && SUGGEST[primaryType]
          ? {
              emoji: SUGGEST[primaryType].emoji,
              key: SUGGEST[primaryType].key,
              matchedType: primaryType,
              source: "places-new",
            }
          : null;

      const suggestion = byPrimary ?? pickFromTypes(types, "places-new");

      return NextResponse.json({
        ok: true,
        placeId,
        source: "places-new",
        primaryType,
        types,
        suggestion,
        suggestedEmoji: suggestion?.emoji ?? null,
        suggestedKey: suggestion?.key ?? null,
        suggestedType: suggestion?.key ?? null,
        matchedType: suggestion?.matchedType ?? null,
      });
    }

    // 2) Classic fallback
    const classicRes = await fetchPlacesClassic(placeId, apiKey);

    if (!classicRes.ok) {
      return NextResponse.json(
        { error: "Places API failed", newError: newRes, classicError: classicRes },
        { status: 500 }
      );
    }

    const gStatus = String(classicRes.json?.status ?? "");
    if (gStatus !== "OK") {
      return NextResponse.json(
        {
          error: "Places API returned non-OK status",
          googleStatus: gStatus,
          message: classicRes.json?.error_message ?? null,
          newError: newRes,
          details: classicRes.json,
        },
        { status: 500 }
      );
    }

    const types: string[] = Array.isArray(classicRes.json?.result?.types)
      ? classicRes.json.result.types
      : [];
    const name: string | null =
      typeof classicRes.json?.result?.name === "string" ? classicRes.json.result.name : null;

    const heuristic = heuristicFromName(name);
    const suggestion = heuristic ?? pickFromTypes(types, "places-classic");

    return NextResponse.json({
      ok: true,
      placeId,
      source: "places-classic",
      name,
      types,
      suggestion,
      suggestedEmoji: suggestion?.emoji ?? null,
      suggestedKey: suggestion?.key ?? null,
      suggestedType: suggestion?.key ?? null,
      matchedType: suggestion?.matchedType ?? null,
      newError: newRes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
