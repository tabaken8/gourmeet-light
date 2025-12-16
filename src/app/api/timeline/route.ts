import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlacePhotoRefs } from "@/lib/google/getPlacePhotoRefs";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

type PlacePhotos = { refs: string[]; attributionsHtml: string };

async function buildPlacePhotoMap(placeIds: string[], perPlace = 6) {
  const uniq = Array.from(new Set(placeIds)).filter(Boolean);
  const limited = uniq.slice(0, 10); // ★重くなるので上限（必要なら増やす）

  const map: Record<string, PlacePhotos> = {};
  await Promise.all(
    limited.map(async (pid) => {
      try {
        map[pid] = await getPlacePhotoRefs(pid, perPlace);
      } catch (e) {
        console.error("[getPlacePhotoRefs failed]", pid, e);
        map[pid] = { refs: [], attributionsHtml: "" };
      }
    })
  );
  return map;
}

function countByPostId(rows: any[]) {
  return rows.reduce((m: Record<string, number>, r: any) => {
    m[r.post_id] = (m[r.post_id] ?? 0) + 1;
    return m;
  }, {});
}

export async function GET(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "friends" ? "friends" : "discover";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 30);
  const cursor = url.searchParams.get("cursor"); // created_at のISO想定

  // ✅ friends だけログイン必須
  if (tab === "friends" && !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ✅ 追加: recommend_score / price_yen / price_range を返す
  const postSelect =
    "id, content, user_id, created_at, image_urls, image_variants, place_name, place_address, place_id, recommend_score, price_yen, price_range";

  // ---------------- discover（未ログインOK） ----------------
  if (tab === "discover") {
    let q = supabase
      .from("posts")
      .select(
        `${postSelect}, profiles!inner ( id, display_name, avatar_url, is_public )`
      )
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor) q = q.lt("created_at", cursor);

    const { data: rows, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const raw = (rows ?? []) as any[];

    // ★ Place写真
    const placeIds = raw.map((r) => r.place_id).filter(Boolean);
    const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

    // ★ Like集計（このバッチ分だけ）
    const postIds = raw.map((r) => r.id);
    let likeCountMap: Record<string, number> = {};
    let likedSet = new Set<string>();

    if (postIds.length) {
      const { data: likesAll } = await supabase
        .from("post_likes")
        .select("post_id")
        .in("post_id", postIds);

      likeCountMap = countByPostId(likesAll ?? []);

      if (user) {
        const { data: myLikes } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds);
        likedSet = new Set((myLikes ?? []).map((r: any) => r.post_id));
      }
    }

    const posts = raw.map((r) => ({
      id: r.id,
      content: r.content,
      user_id: r.user_id,
      created_at: r.created_at,
      image_urls: r.image_urls,
      image_variants: r.image_variants,
      place_name: r.place_name,
      place_address: r.place_address,
      place_id: r.place_id,

      // ✅ 追加: TimelineFeedが読む
      recommend_score: r.recommend_score ?? null,
      price_yen: r.price_yen ?? null,
      price_range: r.price_range ?? null,

      profile: r.profiles
        ? {
            id: r.profiles.id,
            display_name: r.profiles.display_name,
            avatar_url: r.profiles.avatar_url,
            is_public: r.profiles.is_public,
          }
        : null,
      placePhotos: r.place_id ? placePhotoMap[r.place_id] ?? null : null,

      // ★ 追加：いいね初期値
      likeCount: likeCountMap[r.id] ?? 0,
      likedByMe: user ? likedSet.has(r.id) : false,
    }));

    const nextCursor = posts.length ? posts[posts.length - 1].created_at : null;
    return json({ posts, nextCursor });
  }

  // ---------------- friends（ログイン必須） ----------------
  const { data: follows, error: fErr } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user!.id)
    .eq("status", "accepted");

  if (fErr) return json({ error: fErr.message }, 500);

  const followeeIds = (follows ?? []).map((x: any) => x.followee_id);
  const visibleUserIds = Array.from(new Set([user!.id, ...followeeIds]));

  if (visibleUserIds.length === 0) {
    return json({ posts: [], nextCursor: null });
  }

  let pq = supabase
    .from("posts")
    .select(postSelect) // ✅ ここも postSelect を使ってるので追加分が返る
    .in("user_id", visibleUserIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) pq = pq.lt("created_at", cursor);

  const { data: postRows, error: pErr } = await pq;
  if (pErr) return json({ error: pErr.message }, 500);

  const base = (postRows ?? []) as any[];
  const userIds = Array.from(new Set(base.map((p) => p.user_id)));

  const { data: profs, error: prErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_public")
    .in("id", userIds);

  if (prErr) return json({ error: prErr.message }, 500);

  const profMap: Record<string, any> = {};
  for (const p of profs ?? []) profMap[p.id] = p;

  // ★ Place写真
  const placeIds = base.map((p) => p.place_id).filter(Boolean);
  const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

  // ★ Like集計
  const postIds = base.map((p) => p.id);
  let likeCountMap: Record<string, number> = {};
  let likedSet = new Set<string>();

  if (postIds.length) {
    const { data: likesAll } = await supabase
      .from("post_likes")
      .select("post_id")
      .in("post_id", postIds);

    likeCountMap = countByPostId(likesAll ?? []);

    const { data: myLikes } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", user!.id)
      .in("post_id", postIds);

    likedSet = new Set((myLikes ?? []).map((r: any) => r.post_id));
  }

  const posts = base.map((p) => ({
    ...p, // ✅ postSelectで取ってる recommend_score / price_* も自然に入る
    profile: profMap[p.user_id] ?? null,
    placePhotos: p.place_id ? placePhotoMap[p.place_id] ?? null : null,
    likeCount: likeCountMap[p.id] ?? 0,
    likedByMe: likedSet.has(p.id),
  }));

  const nextCursor = posts.length ? posts[posts.length - 1].created_at : null;
  return json({ posts, nextCursor });
}
