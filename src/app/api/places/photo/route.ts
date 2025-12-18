import { NextResponse } from "next/server";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function looksLikeNewPhotoName(ref: string) {
  // places/{placeId}/photos/{photoRef}
  return ref.startsWith("places/") && ref.includes("/photos/") && !ref.includes("..");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = (url.searchParams.get("ref") ?? "").trim();
  const wRaw = url.searchParams.get("w") ?? "800";
  const w = Math.max(1, Math.min(4800, Number(wRaw) || 800));

  if (!ref) return json({ error: "Missing ref" }, 400);

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return json({ error: "Missing GOOGLE_MAPS_API_KEY" }, 500);

  // =========================
  // 1) New Places Photo (preferred)
  // =========================
  if (looksLikeNewPhotoName(ref)) {
    // まず photoUri を取得（skipHttpRedirect=true）
const safePath = ref.split("/").map(encodeURIComponent).join("/");

const metaUrl =
  `https://places.googleapis.com/v1/${safePath}/media` +
  `?key=${encodeURIComponent(key)}` +
  `&maxWidthPx=${encodeURIComponent(String(w))}` +
  `&skipHttpRedirect=true`;


    const metaRes = await fetch(metaUrl, { cache: "no-store" });
    const meta = await metaRes.json().catch(() => ({}));

    if (!metaRes.ok) {
      return json(
        { error: meta?.error?.message ?? "Failed to fetch photo meta", status: metaRes.status },
        502
      );
    }

    const photoUri = meta?.photoUri as string | undefined;
    if (!photoUri) return json({ error: "photoUri missing" }, 502);

    // 実画像を取得して返す（ここをCDNキャッシュさせる）
    const imgRes = await fetch(photoUri, { redirect: "follow" });
    if (!imgRes.ok || !imgRes.body) {
      return json({ error: "Failed to fetch image", status: imgRes.status }, 502);
    }

    const headers = new Headers();
    headers.set("Content-Type", imgRes.headers.get("content-type") ?? "image/jpeg");
    // Vercel/CDN向け（同一ref+wはキャッシュが効く）
    headers.set("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");

    return new NextResponse(imgRes.body, { status: 200, headers });
  }

  // =========================
  // 2) Legacy photo_reference fallback
  // =========================
  const photoUrl =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=${encodeURIComponent(String(w))}` +
    `&photo_reference=${encodeURIComponent(ref)}` +
    `&key=${encodeURIComponent(key)}`;

  const res = await fetch(photoUrl, { redirect: "manual" });
  const location = res.headers.get("location");

  // 302でgoogleusercontentに飛ぶのでkeyを隠す
  if (location) {
    const out = NextResponse.redirect(location, { status: 302 });
    // redirectの場合でも多少キャッシュさせる
    out.headers.set("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    return out;
  }

  if (res.ok) {
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  return json({ error: "Failed to fetch photo", status: res.status }, 502);
}
