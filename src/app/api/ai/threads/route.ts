// app/api/ai/threads/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const runtime = "nodejs";

type ThreadRow = {
  id: string;
  title: string | null;
  created_at: string | null;
};

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const userId = userRes.user.id;

  const { data, error } = await supabase
    .from("ai_threads")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, threads: (data ?? []) as ThreadRow[] });
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const userId = userRes.user.id;

  const body = (await req.json().catch(() => ({}))) as { title?: string | null };
  const title = typeof body?.title === "string" ? body.title.trim() : null;

  const { data, error } = await supabase
    .from("ai_threads")
    .insert({ user_id: userId, title: title && title.length ? title : null })
    .select("id, title, created_at")
    .single();

  if (error || !data?.id) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Failed to create thread" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, thread: data as ThreadRow });
}
