import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("place_id");
  if (!placeId) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY missing" }, { status: 500 });

  const url =
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` +
    `?languageCode=ja&regionCode=JP`;

  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "types,primaryType,displayName",
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: json?.error?.message ?? "Places API failed" }, { status: res.status });

  return NextResponse.json({
    place_id: placeId,
    types: json.types ?? [],
    primaryType: json.primaryType ?? null,
    displayName: json.displayName?.text ?? null,
  });
}
