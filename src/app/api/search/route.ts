import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normQ(q: string | null) {
  return (q ?? "").trim();
}
function safeArr<T>(x: any): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}
function toScore(x: any): number {
  const n = typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" ? Number(x) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

const FOLLOW_BONUS = 2.5; // ✅ 逆質問：ここを確定させたい（仮）

export async function GET(req: Request) {
  const supabase = await createClient();

  const url = new URL(req.url);
  const q = normQ(url.searchParams.get("q"));
  const followOnly = url.searchParams.get("followOnly") === "1";
  const limitUsers = Number(url.searchParams.get("limitUsers") ?? "8") || 8;
  const limitPosts = Number(url.searchParams.get("limitPosts") ?? "18") || 18;

  // me
  const { data: authData } = await supabase.auth.getUser();
  const meId = authData.user?.id ?? null;

  // following ids (accepted only)
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
  const followingSet = new Set(followingIds);

  // =======================
  // USERS: qが空なら出さない
  // =======================
  let users: any[] = [];
  if (q) {
    const { data: uData, error: uErr } = await supabase.rpc("search_users", {
      q,
      limit_n: limitUsers,
    });

    const usersRaw = !uErr && Array.isArray(uData) ? (uData as any[]) : [];
    users = followOnly && followingIds.length > 0
      ? usersRaw.filter((u: any) => followingSet.has(u?.id))
      : usersRaw;
  }

  // =======================
  // POSTS
  // =======================
  // ✅ profiles join を FK 名で明示（fk_posts_user）
  const baseSelect = `
    id,
    user_id,
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
    profiles:profiles!fk_posts_user (
      id,
      username,
      display_name,
      avatar_url,
      is_public
    )
  `;

  // 1) queryが空なら "discover相当" を返す
  // 2) queryがあるなら 検索結果（place_name/address/content）だけ返す
  // 3) followOnly=1 の場合は followingIds に絞る

  const fetchLimit = Math.max(limitPosts, 30); // 後段で並べ替えるので少し多め

  let postQ = supabase
    .from("posts")
    .select(baseSelect)
    .limit(fetchLimit);

  // ✅ publicだけ（searchのデフォルト）
  // followOnly ON なら public条件は外して「フォロー中」を優先（公開/非公開はあなたの運用次第だが、こうするのが自然）
  if (!followOnly) {
    // profiles.is_public = true の人の投稿のみ
    // （JOIN済みなので絞れる）
    const pq: any = postQ;
    postQ = pq.eq("profiles.is_public", true);
  }

  if (followOnly) {
    if (followingIds.length > 0) postQ = postQ.in("user_id", followingIds);
    else postQ = postQ.eq("user_id", "00000000-0000-0000-0000-000000000000"); // empty
  }

  if (q) {
    // search mode
    const pq: any = postQ;
    postQ = pq.or(
      [
        `place_name.ilike.%${q}%`,
        `place_address.ilike.%${q}%`,
        `content.ilike.%${q}%`,
      ].join(",")
    );
  } else {
    // discover mode: 最近の投稿を母集団にする
    postQ = postQ.order("created_at", { ascending: false });
    if (meId) postQ = postQ.neq("user_id", meId);
  }

  const { data: postsData } = await postQ;
  const raw = safeArr<any>(postsData);

  // ✅ finalScore = recommend_score + followBonus で降順
  const posts = raw
    .map((p) => {
      const isFollowing = followingSet.has(p?.user_id);
      const rec = toScore(p?.recommend_score);
      const finalScore = rec + (isFollowing ? FOLLOW_BONUS : 0);
      return { ...p, isFollowing, finalScore };
    })
    .sort((a, b) => {
      const d = (b.finalScore ?? 0) - (a.finalScore ?? 0);
      if (d !== 0) return d;
      // タイブレーク：visited_on → created_at
      const va = a.visited_on ?? "";
      const vb = b.visited_on ?? "";
      if (va !== vb) return va < vb ? 1 : -1;
      const ca = a.created_at ?? "";
      const cb = b.created_at ?? "";
      if (ca !== cb) return ca < cb ? 1 : -1;
      return String(a.id) < String(b.id) ? 1 : -1;
    })
    .slice(0, limitPosts);

  return NextResponse.json({
    q,
    followOnly,
    users,
    posts,
    // optional debug
    // followingCount: followingIds.length,
  });
}
