import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function toInt(x: string | null, d: number) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : d;
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const station_place_id = (searchParams.get("station_place_id") ?? "").trim();
  const station_name = (searchParams.get("station_name") ?? "").trim(); // UI表示用（任意）
  const radius_m = clamp(toInt(searchParams.get("radius_m"), 2000), 100, 20000);
  const limit = clamp(toInt(searchParams.get("limit"), 50), 1, 100);

  // いまは未使用（将来対応用）
  const follow = searchParams.get("follow") === "1";
  const cursor = searchParams.get("cursor");

  if (!station_place_id) {
    return NextResponse.json({ ok: false, error: "station_place_id is required" }, { status: 400 });
  }

  // RPC: public.search_posts_by_station_ui(station_place_id text, radius_m integer, limit_n integer)
  const { data, error } = await supabase.rpc("search_posts_by_station_ui", {
    station_place_id,
    radius_m,
    limit_n: limit,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, hint: "RPC args must be station_place_id, radius_m, limit_n" },
      { status: 400 }
    );
  }

  const rows = Array.isArray(data) ? data : [];

  // 1) 正規化（TimelinePostList が使う id / user_id / created_at を確実に作る）
  const normalized = rows.map((r: any) => {
    const id = r?.post_id ?? r?.id ?? null;
    const user_id = r?.user_id ?? null;
    const created_at = r?.post_created_at ?? r?.created_at ?? null;

    return {
      ...r,
      id: id ? String(id) : null,
      user_id: user_id ? String(user_id) : null,
      created_at,
    };
  });

  // 2) Drop invalid + dedupe（/u/null 防止のため user_id 必須）
  const seen = new Set<string>();
  const posts = normalized.filter((p: any) => {
    const id = p?.id;
    const user_id = p?.user_id;
    if (!id || typeof id !== "string") return false;
    if (!user_id || typeof user_id !== "string") return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // 3) profile を一括付与（station時にユーザー名がnullになる問題の解決）
  //    ※ profiles の主キーが auth.users.id と同じ UUID (profiles.id) 前提
  const userIds = Array.from(
    new Set(posts.map((p: any) => p.user_id).filter((x: any) => typeof x === "string" && x.length > 0))
  );

  const profileMap = new Map<string, any>();
  if (userIds.length > 0) {
    const { data: profRows, error: profErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, is_public")
      .in("id", userIds);

    // profErr は握りつぶして OK（profile が取れなくても posts は返せる）
    if (!profErr && Array.isArray(profRows)) {
      for (const pr of profRows) {
        const pid = pr?.id ? String(pr.id) : "";
        if (!pid) continue;
        profileMap.set(pid, pr);
      }
    }
  }

  const postsWithProfile = posts.map((p: any) => ({
    ...p,
    profile: profileMap.get(p.user_id) ?? null,
  }));

  return NextResponse.json({
    ok: true,
    mode: "station",
    station_place_id,
    station_name: station_name || null,
    radius_m,
    count: postsWithProfile.length,
    posts: postsWithProfile,
    // nextCursor: null, // まだ未実装
    // debug: { follow, cursor }, // 必要なら一時的に
  });
}
