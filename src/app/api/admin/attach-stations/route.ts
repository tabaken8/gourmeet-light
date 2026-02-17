import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const GOOGLE_PLACES_NEARBY_URL =
  "https://places.googleapis.com/v1/places:searchNearby"; // Nearby Search (New) :contentReference[oaicite:3]{index=3}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function searchNearbyStations(lat: number, lng: number, radiusM: number, languageCode = "ja") {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  // まず train/subway を優先。0件なら transit_station へフォールバック（バス停混入しやすいので最後） :contentReference[oaicite:4]{index=4}
  const queries: string[][] = [
    ["train_station", "subway_station"],
    ["transit_station"],
  ];

  for (const includedTypes of queries) {
    const body = {
      includedTypes,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      languageCode,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusM,
        },
      },
    };

    const res = await fetch(GOOGLE_PLACES_NEARBY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // field mask必須 :contentReference[oaicite:5]{index=5}
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.types",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Nearby Search failed: ${res.status} ${text}`);
    }

    const json = await res.json();
    const places = (json.places ?? []) as Array<{
      id?: string;
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
      types?: string[];
    }>;

    if (places.length > 0) return places;
  }

  return [];
}

export async function POST(req: Request) {
  try {
    const { place_id, topK = 10, radiusM = 3000 } = await req.json();

    if (!place_id || typeof place_id !== "string") {
      return NextResponse.json({ error: "place_id is required" }, { status: 400 });
    }

    // 1) placesテーブルから店のlat/lng取得
    const { data: placeRow, error: placeErr } = await supabaseAdmin
      .from("places")
      .select("place_id, lat, lng, name")
      .eq("place_id", place_id)
      .single();

    if (placeErr || !placeRow) {
      return NextResponse.json({ error: "place not found", detail: placeErr }, { status: 404 });
    }
    if (placeRow.lat == null || placeRow.lng == null) {
      return NextResponse.json({ error: "place lat/lng is null" }, { status: 400 });
    }

    const shop = { lat: placeRow.lat as number, lng: placeRow.lng as number };

    // 2) Googleで駅候補検索
    const stations = await searchNearbyStations(shop.lat, shop.lng, radiusM, "ja");

    // 3) 距離計算して上位Kに絞る
    const ranked = stations
      .map((s) => {
        const stLat = s.location?.latitude;
        const stLng = s.location?.longitude;
        const d =
          stLat != null && stLng != null
            ? Math.round(haversineMeters(shop, { lat: stLat, lng: stLng }))
            : null;
        return {
          station_place_id: s.id ?? null,
          station_name: s.displayName?.text ?? null,
          station_lat: stLat ?? null,
          station_lng: stLng ?? null,
          station_types: s.types ?? null,
          distance_m: d,
        };
      })
      .filter((x) => x.station_place_id)
      .sort((a, b) => (a.distance_m ?? 1e18) - (b.distance_m ?? 1e18))
      .slice(0, topK)
      .map((x, i) => ({
        place_id,
        ...x,
        rank: i + 1,
        source: "google_nearby",
        updated_at: new Date().toISOString(),
      }));

    // 4) upsert
    const { error: upsertErr } = await supabaseAdmin
      .from("place_station_links")
      .upsert(ranked, { onConflict: "place_id,station_place_id" });

    if (upsertErr) {
      return NextResponse.json({ error: "upsert failed", detail: upsertErr }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      place_id,
      place_name: placeRow.name,
      inserted_or_updated: ranked.length,
      stations: ranked,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
