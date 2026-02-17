import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const GOOGLE_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";

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

  const queries: string[][] = [
    ["train_station", "subway_station"],
    ["transit_station"], // fallback
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
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types",
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

async function attachStationsForPlace(placeId: string, topK: number, radiusM: number) {
  // placesからlat/lng取得
  const { data: placeRow, error: placeErr } = await supabaseAdmin
    .from("places")
    .select("place_id, lat, lng, name")
    .eq("place_id", placeId)
    .single();

  if (placeErr || !placeRow) throw new Error(`place not found: ${placeId}`);
  if (placeRow.lat == null || placeRow.lng == null) throw new Error(`lat/lng null: ${placeId}`);

  const shop = { lat: placeRow.lat as number, lng: placeRow.lng as number };
  const stations = await searchNearbyStations(shop.lat, shop.lng, radiusM, "ja");

  const ranked = stations
    .map((s) => {
      const stLat = s.location?.latitude;
      const stLng = s.location?.longitude;
      const d =
        stLat != null && stLng != null ? Math.round(haversineMeters(shop, { lat: stLat, lng: stLng })) : null;
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
      place_id: placeId,
      ...x,
      rank: i + 1,
      source: "google_nearby",
      updated_at: new Date().toISOString(),
    }));

  const { error: upsertErr } = await supabaseAdmin
    .from("place_station_links")
    .upsert(ranked, { onConflict: "place_id,station_place_id" });

  if (upsertErr) throw new Error(`upsert failed: ${JSON.stringify(upsertErr)}`);

  return { place_id: placeId, place_name: placeRow.name, inserted_or_updated: ranked.length };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit ?? 20), 100);
    const topK = Math.min(Number(body.topK ?? 10), 20);
    const radiusM = Math.min(Number(body.radiusM ?? 3000), 20000);

    // 対象抽出：postsに出てくるplace_idのうち、駅リンクがまだ無いものを最近順に
    const { data: targets, error: tErr } = await supabaseAdmin
      .rpc("places_missing_station_links", { limit_n: limit });

    // ↑このRPCは下で作る。無いと動かないので、まずは作ろう。

    if (tErr) return NextResponse.json({ error: tErr }, { status: 500 });

    const results: any[] = [];
    const errors: any[] = [];

    for (const row of targets ?? []) {
      const placeId = row.place_id as string;
      try {
        const r = await attachStationsForPlace(placeId, topK, radiusM);
        results.push(r);
      } catch (e: any) {
        errors.push({ place_id: placeId, error: e?.message ?? String(e) });
      }
    }

    return NextResponse.json({
      ok: true,
      requested: limit,
      processed: (targets ?? []).length,
      succeeded: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
