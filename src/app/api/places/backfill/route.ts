import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE!;
  const googleKey =
    process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });
  }
  if (!googleKey) {
    return NextResponse.json({ error: "Missing Google key" }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 任意：limit を外部から指定
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body?.limit ?? 50), 200);

  // 1) lat/lng欠損を拾う
  const { data: rows, error: selErr } = await admin
    .from("places")
    .select("place_id")
    .or("lat.is.null,lng.is.null")
    .limit(limit);

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  const placeIds = (rows ?? []).map((r) => r.place_id).filter(Boolean);

  let ok = 0;
  let fail = 0;
  const errors: any[] = [];

  // 2) 1件ずつ Place Details -> upsert
  for (const placeId of placeIds) {
    try {
      const fields = [
        "place_id",
        "name",
        "formatted_address",
        "geometry/location",
      ].join(",");

      const detailsUrl =
        "https://maps.googleapis.com/maps/api/place/details/json" +
        `?place_id=${encodeURIComponent(placeId)}` +
        `&fields=${encodeURIComponent(fields)}` +
        `&language=ja&region=JP` +
        `&key=${encodeURIComponent(googleKey)}`;

      const resp = await fetch(detailsUrl, { cache: "no-store" });
      const json = await resp.json();

      if (json.status !== "OK" || !json.result) throw new Error(json.status);

      const r = json.result;
      const lat = r?.geometry?.location?.lat ?? null;
      const lng = r?.geometry?.location?.lng ?? null;

      const row = {
        place_id: placeId,
        name: r?.name ?? null,
        address: r?.formatted_address ?? null,
        lat: typeof lat === "number" ? lat : null,
        lng: typeof lng === "number" ? lng : null,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await admin
        .from("places")
        .upsert(row, { onConflict: "place_id" });

      if (upErr) throw upErr;

      ok++;
      // 任意：レート制限対策で少し待つ
      await new Promise((r) => setTimeout(r, 80));
    } catch (e: any) {
      fail++;
      errors.push({ placeId, error: e?.message ?? String(e) });
    }
  }

  return NextResponse.json({ ok: true, processed: placeIds.length, okCount: ok, failCount: fail, errors });
}
