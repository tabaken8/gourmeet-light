import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/geocode
 * body: { text: string, bias?: {lat:number,lng:number} }
 * returns: { ok, source, placeName, lat, lng, viewport? }
 */
type Body = {
  text?: string;
  bias?: { lat: number; lng: number };
};

function envKey() {
  // 本番はサーバ専用キーを推奨（GOOGLE_MAPS_API_KEY）
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    ""
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST { text, bias? } -> { lat,lng }",
  });
}

export async function POST(req: Request) {
  const key = envKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Google Maps API key is missing (set GOOGLE_MAPS_API_KEY)" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.text ?? "").toString().trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
  }

  // 近くの候補を優先させたいので bias があるなら bounds で軽く寄せる
  // bounds は "southwest|northeast" 形式
  let boundsParam = "";
  if (body.bias && Number.isFinite(body.bias.lat) && Number.isFinite(body.bias.lng)) {
    const dLat = 0.08; // ざっくり数km〜十数km
    const dLng = 0.10;
    const swLat = clamp(body.bias.lat - dLat, -85, 85);
    const swLng = clamp(body.bias.lng - dLng, -179, 179);
    const neLat = clamp(body.bias.lat + dLat, -85, 85);
    const neLng = clamp(body.bias.lng + dLng, -179, 179);
    boundsParam = `&bounds=${swLat},${swLng}|${neLat},${neLng}`;
  }

  // 1) Geocoding API
  const geoUrl =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(text)}` +
    `&language=ja&region=JP` +
    boundsParam +
    `&key=${encodeURIComponent(key)}`;

  const geoRes = await fetch(geoUrl, { cache: "no-store" });
  const geoJson = await geoRes.json().catch(() => null);

  if (geoJson?.status === "OK" && Array.isArray(geoJson.results) && geoJson.results.length) {
    const r0 = geoJson.results[0];
    const loc = r0?.geometry?.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      return NextResponse.json({
        ok: true,
        source: "geocode",
        placeName: r0.formatted_address ?? text,
        lat: loc.lat,
        lng: loc.lng,
        viewport: r0?.geometry?.viewport ?? null,
      });
    }
  }

  // 2) Places Text Search（あいまい地名/施設名の救済）
  const placesUrl =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(text)}` +
    `&language=ja&region=JP` +
    (body.bias ? `&location=${body.bias.lat},${body.bias.lng}&radius=8000` : "") +
    `&key=${encodeURIComponent(key)}`;

  const plRes = await fetch(placesUrl, { cache: "no-store" });
  const plJson = await plRes.json().catch(() => null);

  if (plJson?.status === "OK" && Array.isArray(plJson.results) && plJson.results.length) {
    const r0 = plJson.results[0];
    const loc = r0?.geometry?.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      return NextResponse.json({
        ok: true,
        source: "places_textsearch",
        placeName: r0.name ?? text,
        lat: loc.lat,
        lng: loc.lng,
        viewport: r0?.geometry?.viewport ?? null,
      });
    }
  }

  return NextResponse.json(
    { ok: false, error: "No geocoding result", debug: { geocodeStatus: geoJson?.status, placesStatus: plJson?.status } },
    { status: 404 }
  );
}
