export function buildGoogleMapsUrl(opts: {
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  const { placeId, name, address, lat, lng } = opts;

  if (placeId) {
    return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  }
  if (name || address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((name || address)!)}`;
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return null;
}
