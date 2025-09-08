// src/app/api/places/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const key = process.env.GOOGLE_PLACES_KEY; // NEXT_PUBLIC じゃなくてOK

  if (!query) {
    return NextResponse.json({ error: "q (query) required" }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&language=ja&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json({ error: "Google Places fetch failed" }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
