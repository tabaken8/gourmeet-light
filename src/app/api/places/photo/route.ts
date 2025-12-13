import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  const w = url.searchParams.get("w") ?? "800";

  if (!ref) {
    return NextResponse.json({ error: "Missing ref" }, { status: 400 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Missing GOOGLE_MAPS_API_KEY" },
      { status: 500 }
    );
  }

  // legacy photo endpoint (keyはここでだけ使う)
  const photoUrl =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=${encodeURIComponent(w)}` +
    `&photo_reference=${encodeURIComponent(ref)}` +
    `&key=${encodeURIComponent(key)}`;

  // 302 で googleusercontent に飛ばされるので Location を抜いて key を隠す
  const res = await fetch(photoUrl, { redirect: "manual" });

  const location = res.headers.get("location");
  if (location) {
    return NextResponse.redirect(location, { status: 302 });
  }

  // まれに 200 で画像が返る場合もあるのでフォールバック
  if (res.ok) {
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return NextResponse.json(
    { error: "Failed to fetch photo", status: res.status },
    { status: 502 }
  );
}
