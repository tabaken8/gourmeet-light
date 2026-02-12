import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const placeId = (url.searchParams.get("place_id") ?? "").trim();
  const scope = (url.searchParams.get("scope") ?? "all").toLowerCase();
  const limit = Number(url.searchParams.get("limit") ?? "18");

  if (!placeId) return NextResponse.json({ posts: [] });

  const supabase = createRouteHandlerClient({ cookies });
  const safeScope = scope === "following" ? "following" : "all";

  const { data, error } = await supabase.rpc("posts_by_place", {
    place_id_in: placeId,
    limit_n: limit,
    scope: safeScope,
  });

  if (error) {
    return NextResponse.json({ posts: [], error: error.message }, { status: 400 });
  }

  return NextResponse.json({ posts: data ?? [] });
}
