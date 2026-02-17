import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const stationPlaceId = searchParams.get("station_place_id");
  const radiusM = Number(searchParams.get("radius_m") ?? "2000");
  const limitN = Math.min(Number(searchParams.get("limit") ?? "50"), 200);

  if (!stationPlaceId) {
    return NextResponse.json({ error: "station_place_id is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("search_posts_by_station", {
    station_place_id: stationPlaceId,
    radius_m: radiusM,
    limit_n: limitN,
  });

  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    station_place_id: stationPlaceId,
    radius_m: radiusM,
    count: data?.length ?? 0,
    data,
  });
}
