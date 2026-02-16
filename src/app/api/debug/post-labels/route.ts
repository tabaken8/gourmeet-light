import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BACKFILL_SECRET = process.env.BACKFILL_SECRET!;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(req: Request) {
  // ✅ secret（ヘッダ or query どっちでもOK）
  const { searchParams } = new URL(req.url);
  const secret = req.headers.get("x-backfill-secret") || searchParams.get("secret") || "";

  if (!BACKFILL_SECRET || secret !== BACKFILL_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const id = (searchParams.get("id") || "").trim();
  if (!id) return json({ ok: false, error: "missing_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("posts")
    .select("id, created_at, image_label_version, image_labeled_at, image_labels")
    .eq("id", id)
    .maybeSingle();

  if (error) return json({ ok: false, error: error.message }, 500);
  if (!data) return json({ ok: false, error: "not_found" }, 404);

  return json({ ok: true, post: data });
}
