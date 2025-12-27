// app/api/place-details/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("place_id");
  if (!placeId) {
    return NextResponse.json({ error: "place_id is required" }, { status: 400 });
  }

  const key =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY; // 念のため

  if (!key) {
    return NextResponse.json({ error: "Missing Google Places API key" }, { status: 500 });
  }

  const fields = "place_id,name,formatted_address,geometry,types,photos";
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&language=ja` +
    `&key=${encodeURIComponent(key)}`;

  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();

  if (j.status !== "OK" || !j.result) {
    return NextResponse.json(
      { error: j.status, message: j.error_message ?? "Place Details failed" },
      { status: 502 }
    );
  }

  const p = j.result;

  const lat = p?.geometry?.location?.lat ?? null;
  const lng = p?.geometry?.location?.lng ?? null;

  const place_types = Array.isArray(p?.types) ? p.types : null;
  const primary_type = Array.isArray(place_types) && place_types.length > 0 ? place_types[0] : null;

  // photo_reference → Place Photo URL
  const photoRef = p?.photos?.[0]?.photo_reference ?? null;
  const photo_url = photoRef
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(
        photoRef
      )}&key=${encodeURIComponent(key)}`
    : null;

  return NextResponse.json({
    place_id: placeId,
    name: p?.name ?? null,
    address: p?.formatted_address ?? null,
    lat,
    lng,
    photo_url,
    place_types,
    primary_type,
  });
}
