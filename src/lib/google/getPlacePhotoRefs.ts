type PlacePhotoRefsResult = {
  refs: string[];
  attributionsHtml: string;
};

export async function getPlacePhotoRefs(
  placeId: string,
  limit = 4
): Promise<PlacePhotoRefsResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  const detailsUrl =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=photos` +
    `&key=${encodeURIComponent(key)}`;

  const res = await fetch(detailsUrl, {
    next: { revalidate: 60 * 60 },
  });

  const json = await res.json();

  // ✅ ここが超重要：Google側の status を必ず見る
  if (!res.ok) {
    console.error("[PlaceDetails] HTTP", res.status, json);
    throw new Error(`Place Details HTTP ${res.status}`);
  }

  if (json.status !== "OK") {
    console.error("[PlaceDetails] status=", json.status, "msg=", json.error_message, json);
    throw new Error(`Place Details status ${json.status}: ${json.error_message ?? ""}`);
  }

  const photos: any[] = json?.result?.photos ?? [];
  console.log("[PlaceDetails] placeId=", placeId, "photos=", photos.length);

  const refs = photos
    .map((p) => p.photo_reference)
    .filter(Boolean)
    .slice(0, limit);

  const attributions: string[] = photos
    .flatMap((p) => p.html_attributions ?? [])
    .filter(Boolean);

  return { refs, attributionsHtml: attributions.join(" ") };
}
