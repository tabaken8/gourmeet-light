// app/api/search/suggest/station/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function toInt(x: string | null, d: number) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.max(1, Math.min(20, toInt(searchParams.get("limit"), 8)));

  if (!q) return NextResponse.json({ ok: true, stations: [] });

  const { data, error } = await supabase.rpc("suggest_stations_v1", {
    q,
    lim: limit,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    stations: Array.isArray(data) ? data : [],
  });
}
