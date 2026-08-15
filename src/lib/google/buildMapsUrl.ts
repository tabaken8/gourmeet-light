export function buildGoogleMapsUrl(opts: {
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  const { placeId, name, address, lat, lng } = opts;

  // Google Maps URLs API (公式)
  // https://developers.google.com/maps/documentation/urls/get-started
  //
  // place_id がある場合は query_place_id を使う。
  // 旧形式 /maps/place/?q=place_id:... は PC ブラウザでは動くが
  // スマホの Google Maps アプリでは認識されない。
  if (placeId) {
    const query = name || address || "";
    const qs = query
      ? `query=${encodeURIComponent(query)}&query_place_id=${placeId}`
      : `query_place_id=${placeId}`;
    return `https://www.google.com/maps/search/?api=1&${qs}`;
  }
  if (name || address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((name || address)!)}`;
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return null;
}
