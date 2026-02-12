// app/api/discover/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ImageVariant = { thumb?: string | null; full?: string | null };

function pickThumb(p: any): string | null {
  const variants = Array.isArray(p?.image_variants) ? (p.image_variants as ImageVariant[]) : [];
  const v0 = variants[0];
  if (v0?.thumb) return v0.thumb;
  if (v0?.full) return v0.full;
  const urls = Array.isArray(p?.image_urls) ? (p.image_urls as string[]) : [];
  return urls[0] ?? null;
}

function toInt(x: string | null, fallback: number) {
  const n = x == null ? NaN : Number(x);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const url = new URL(req.url);

  const limit = toInt(url.searchParams.get("limit"), 24);
  const followOnly = url.searchParams.get("follow_only") === "1";
  const excludePostId = url.searchParams.get("exclude_post_id"); // optional

  // who am I
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    return NextResponse.json({ posts: [], error: authErr.message }, { status: 200 });
  }
  const meId = authData.user?.id ?? null;

  // following ids (accepted)
  let followingIds: string[] = [];
  if (meId) {
    const { data: fData, error: fErr } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", meId)
      .eq("status", "accepted");

    if (!fErr && Array.isArray(fData)) {
      followingIds = fData
        .map((r: any) => r?.followee_id)
        .filter((x: any) => typeof x === "string");
    }
  }

  // base query
  let q = supabase
    .from("posts")
    .select(
      `
        id,
        user_id,
        created_at,
        visited_on,
        content,
        image_urls,
        image_variants,
        place_id,
        place_name,
        place_address,
        recommend_score,
        price_yen,
        price_range,
        profiles (
          id,
          username,
          display_name,
          avatar_url,
          is_public
        ),
        places:places (
          place_id,
          name,
          address,
          primary_genre,
          area_label_ja,
          photo_url
        )
      `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludePostId) q = q.neq("id", excludePostId);

  // follow_only=1 => (me + followees) の投稿だけ
  if (followOnly) {
    if (!meId) {
      // 未ログインで follow_only を要求されたら空
      return NextResponse.json({ posts: [] }, { status: 200 });
    }
    const ids = Array.from(new Set([meId, ...followingIds]));
    if (ids.length === 0) return NextResponse.json({ posts: [] }, { status: 200 });

    const csv = `(${ids.map((x) => `"${x}"`).join(",")})`;
    const qa: any = q;
    q = qa.in("user_id", csv);
  } else {
    // discover（おすすめ）: 自分は除外、さらに「フォローしてる人」も除外（MoreDiscoverBlock踏襲）
    if (meId) q = q.neq("user_id", meId);

    if (meId && followingIds.length > 0) {
      const csv = `(${followingIds.map((x) => `"${x}"`).join(",")})`;
      const qa: any = q;
      q = qa.not("user_id", "in", csv);
    }
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ posts: [], error: error.message }, { status: 200 });
  }

  const postsRaw = Array.isArray(data) ? data : [];
  const posts = postsRaw.map((p: any) => ({
    ...p,
    _thumb: pickThumb(p),
  }));

  return NextResponse.json({ posts }, { status: 200 });
}
