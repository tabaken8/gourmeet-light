// app/api/posts/[id]/likers/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user;

  // ✅ Next.js 15: params は Promise
  const { id: postId } = await ctx.params;

  // 全likers（最近順）
  const { data: likes, error: lerr } = await supabase
    .from("post_likes")
    .select("user_id, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (lerr) return json({ error: lerr.message }, 500);

  const userIds = Array.from(new Set((likes ?? []).map((r: any) => r.user_id).filter(Boolean)));
  if (userIds.length === 0) return json({ likers: [] });

  // プロフィール
  const { data: profs, error: perr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  if (perr) return json({ error: perr.message }, 500);

  const pmap: Record<string, any> = {};
  for (const p of profs ?? []) pmap[p.id] = p;

  // フォロー状態（me -> liker）
  let followingSet = new Set<string>();
  if (me?.id) {
    const { data: follows } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", me.id)
      .eq("status", "accepted")
      .in("followee_id", userIds);

    followingSet = new Set((follows ?? []).map((x: any) => x.followee_id).filter(Boolean));
  }

  // likes順に並べる（重複防止も兼ねる）
  const seen = new Set<string>();
  const ordered = (likes ?? [])
    .map((r: any) => {
      const uid = r.user_id as string | null;
      if (!uid || seen.has(uid)) return null;
      const p = pmap[uid];
      if (!p) return null;
      seen.add(uid);

      return {
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        is_following: me?.id ? followingSet.has(p.id) : false,
      };
    })
    .filter(Boolean);

  return json({ likers: ordered });
}
