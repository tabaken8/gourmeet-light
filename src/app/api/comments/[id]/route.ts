import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  const { data: auth, error: aErr } = await supabase.auth.getUser();
  if (aErr) return json({ error: aErr.message }, 401);
  if (!auth.user) return json({ error: "Unauthorized" }, 401);

  const commentId = params.id;

  // RLSで「自分のコメントだけ」が保証される
  const { error } = await supabase.from("comments").delete().eq("id", commentId);

  if (error) return json({ error: error.message }, 400);

  return json({ ok: true });
}
