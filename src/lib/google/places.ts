// src/lib/google/places.ts
export async function searchPlaces(query: string) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
  if (!key) throw new Error("Google Places API key not set");

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Google Places API error");
  return res.json();
}
