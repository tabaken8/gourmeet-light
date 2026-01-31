// src/app/api/profile/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GenreRow = { genre: string; count: number };

export const dynamic = "force-dynamic";

function normalizeGenre(g: any): string {
  const s = typeof g === "string" ? g.trim() : "";
  return s || "未分類";
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // viewer（ログイン必須）
  const {
    data: { user: me },
  } = await supabase.auth.getUser();

  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // target user id
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  // target profile (公開/非公開判定)
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, is_public")
    .eq("id", userId)
    .maybeSingle();

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isPublic = profile.is_public ?? true;

  // ---- access check ----
  let canView = false;

  if (me.id === userId) {
    canView = true;
  } else if (isPublic) {
    canView = true;
  } else {
    // 非公開なら「承認済みフォロー」だけOK
    const { data: rel, error: fErr } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", me.id)
      .eq("followee_id", userId)
      .eq("status", "accepted")
      .maybeSingle();

    if (!fErr && rel) canView = true;
  }

  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ---- stats build (all-time) ----
  // posts（必要最低限）
  const { data: posts, error: postsErr } = await supabase
    .from("posts")
    .select("id, place_id")
    .eq("user_id", userId)
    .limit(5000);

  if (postsErr) {
    return NextResponse.json({ error: postsErr.message }, { status: 500 });
  }

  const totalPosts = posts?.length ?? 0;

  // place_id -> genre を引くために places をまとめて取得
  const placeIds = Array.from(
    new Set(
      (posts ?? [])
        .map((p: any) => (typeof p?.place_id === "string" ? p.place_id : null))
        .filter((x: any): x is string => !!x)
    )
  );

  let placeGenreMap = new Map<string, string>();

  if (placeIds.length > 0) {
    const { data: places, error: placesErr } = await supabase
      .from("places")
      .select("place_id, primary_genre")
      .in("place_id", placeIds)
      .limit(5000);

    if (placesErr) {
      return NextResponse.json({ error: placesErr.message }, { status: 500 });
    }

    for (const r of places ?? []) {
      const pid = typeof (r as any)?.place_id === "string" ? (r as any).place_id : null;
      if (!pid) continue;
      placeGenreMap.set(pid, normalizeGenre((r as any)?.primary_genre));
    }
  }

  // 集計：投稿単位で primary_genre をカウント
  const genreCount = new Map<string, number>();

  for (const p of posts ?? []) {
    const pid = typeof (p as any)?.place_id === "string" ? (p as any).place_id : null;
    const genre = pid ? placeGenreMap.get(pid) ?? "未分類" : "未分類";
    genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
  }

  const genres: GenreRow[] = Array.from(genreCount.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12); // 上位だけ（円グラフ向け）

  const topGenre = genres[0]?.genre ?? "未分類";

  return NextResponse.json({
    ok: true,
    userId,
    totalPosts,
    topGenre,
    genres, // [{genre,count}]
  });
}
