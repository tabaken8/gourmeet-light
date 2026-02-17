import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function toInt(x: string | null, d: number) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

function toIsoOrNull(x: string | null) {
  if (!x) return null;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const followOnly = searchParams.get("follow") === "1";
  const limit = Math.max(1, Math.min(50, toInt(searchParams.get("limit"), 20)));
  const cursorIso = toIsoOrNull(searchParams.get("cursor"));

  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id ?? null;

  if (!q) return NextResponse.json({ posts: [], nextCursor: null });

  const { data, error } = await supabase.rpc("search_posts_v3", {
    q,
    me,
    follow_only: followOnly,
    lim: limit,
    cur: cursorIso,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = Array.isArray(data) ? data : [];
  const nextCursor = rows.length === limit ? (rows[rows.length - 1]?.created_at ?? null) : null;

  return NextResponse.json({ posts: rows, nextCursor });
}
