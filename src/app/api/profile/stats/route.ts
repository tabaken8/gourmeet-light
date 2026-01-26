// src/app/api/profile/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type GenreRow = { genre: string; count: number };

function normalizeGenre(x: any): string {
  const s = typeof x === "string" ? x.trim() : "";
  return s ? s : "未分類";
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id")?.trim();

  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  // ✅ me は “居ても居なくても” OK（publicなら未ログインでも見せたい場合に備える）
  const {
    data: { user: me },
  } = await supabase.auth.getUser();

  // profile取得（公開/非公開判定）
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, is_public")
    .eq("id", userId)
    .maybeSingle();

  if (profErr || !profile) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }

  const isPublic = profile.is_public ?? true;

  // ✅ 閲覧権限：
  // - 公開プロフィールならOK
  // - 本人ならOK
  // - それ以外は「acceptedフォロー」ならOK
  let canView = false;
  if (isPublic) canView = true;
  if (me && me.id === userId) canView = true;

  if (!canView && me) {
    const { data: rel } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", me.id)
      .eq("followee_id", userId)
      .eq("status", "accepted")
      .maybeSingle();

    if (rel) canView = true;
  }

  if (!canView) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ① 投稿総数
  const { count: totalPosts = 0 } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  // ② posts から place_id（= google place id）を集める
  const { data: postPlaceRows, error: ppErr } = await supabase
    .from("posts")
    .select("place_id")
    .eq("user_id", userId)
    .not("place_id", "is", null)
    .limit(5000);

  if (ppErr) {
    return NextResponse.json({ error: "failed to load posts" }, { status: 500 });
  }

  const placeIds = Array.from(
    new Set(
      (postPlaceRows ?? [])
        .map((r: any) => (typeof r?.place_id === "string" ? r.place_id : null))
        .filter((x: any): x is string => !!x)
    )
  );

  // place が無い投稿しかない場合
  if (placeIds.length === 0) {
    return NextResponse.json({
      ok: true,
      userId,
      totalPosts,
      topGenre: "未分類",
      genres: [{ genre: "未分類", count: totalPosts }],
    });
  }

  // ③ places から primary_genre を引く（place_id が主キー）
  // supabase の in() は大量だと詰むので chunk
  const placeGenreMap = new Map<string, string>();
  const CHUNK = 200;

  for (let i = 0; i < placeIds.length; i += CHUNK) {
    const chunk = placeIds.slice(i, i + CHUNK);
    const { data: places, error: plErr } = await supabase
      .from("places")
      .select("place_id, primary_genre")
      .in("place_id", chunk);

    if (plErr) {
      return NextResponse.json({ error: "failed to load places" }, { status: 500 });
    }

    for (const p of places ?? []) {
      const pid = typeof (p as any)?.place_id === "string" ? (p as any).place_id : null;
      if (!pid) continue;
      placeGenreMap.set(pid, normalizeGenre((p as any).primary_genre));
    }
  }

  // ④ もう一度 posts を見て、place_id→genre でカウント
  // （posts を全部持って来るのが嫌なら、RPC化やview化は後で）
  const { data: postRows2, error: p2Err } = await supabase
    .from("posts")
    .select("place_id")
    .eq("user_id", userId)
    .not("place_id", "is", null)
    .limit(5000);

  if (p2Err) {
    return NextResponse.json({ error: "failed to load posts" }, { status: 500 });
  }

  const counter = new Map<string, number>();
  for (const r of postRows2 ?? []) {
    const pid = typeof (r as any)?.place_id === "string" ? (r as any).place_id : null;
    if (!pid) continue;
    const g = placeGenreMap.get(pid) ?? "未分類";
    counter.set(g, (counter.get(g) ?? 0) + 1);
  }

  const genres: GenreRow[] = Array.from(counter.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count);

  const topGenre = genres[0]?.genre ?? "未分類";

  return NextResponse.json({
    ok: true,
    userId,
    totalPosts,
    topGenre,
    genres,
  });
}
