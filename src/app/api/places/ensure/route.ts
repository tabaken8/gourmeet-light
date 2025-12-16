import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = { placeId: string };

export async function POST(req: Request) {
  try {
    const { placeId } = (await req.json()) as Body;
    if (!placeId || typeof placeId !== "string") {
      return NextResponse.json({ error: "placeId is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
    const googleKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }
    if (!googleKey) {
      return NextResponse.json(
        { error: "Missing Google env var: GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) Google Place Details で座標など取得
    const fields = [
      "place_id",
      "name",
      "formatted_address",
      "geometry/location",
      "photos",
    ].join(",");

    const detailsUrl =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&key=${encodeURIComponent(googleKey)}`;

    const resp = await fetch(detailsUrl);
    if (!resp.ok) {
      return NextResponse.json({ error: "Failed to fetch Place Details" }, { status: 500 });
    }

    const json = await resp.json();

    if (json.status !== "OK" || !json.result) {
      return NextResponse.json(
        { error: `Place Details error: ${json.status}`, detail: json.error_message ?? null },
        { status: 500 }
      );
    }

    const r = json.result as any;
    const lat = r?.geometry?.location?.lat ?? null;
    const lng = r?.geometry?.location?.lng ?? null;

    // photo_url は一旦nullでOK（後でPhotos APIで作るならここを拡張）
    const row = {
      place_id: placeId,
      name: (r?.name ?? null) as string | null,
      address: (r?.formatted_address ?? null) as string | null,
      lat: (typeof lat === "number" ? lat : null) as number | null,
      lng: (typeof lng === "number" ? lng : null) as number | null,
      updated_at: new Date().toISOString(),
    };

    // 2) places を upsert（lat/lngまで入る）
    const { error } = await admin
      .from("places")
      .upsert(row, { onConflict: "place_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, place: row });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
