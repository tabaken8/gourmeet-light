import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const form = await req.formData();
  const title = (form.get("title") ?? "").toString();
  const content = (form.get("content") ?? "").toString();

  // RLSにより本人の投稿のみ更新される
  await supabase.from("posts").update({ title, content }).eq("id", params.id);

  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL("/timeline", base));
}
