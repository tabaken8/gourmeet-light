// src/app/api/timeline/friends/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function toInt(x: string | null, d: number) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : d;
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function toIsoOrNull(x: string | null) {
  if (!x) return null;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SuggestKind = "follow_back" | "friend_follows" | "global";

// ✅ 直近window件に同一userが出ないように並べ替え（時系列は崩れてOK）
function enforceNoRepeatWithin(posts: any[], window = 3) {
  const out: any[] = [];
  const pool = posts.slice();

  while (pool.length) {
    const recent = new Set(out.slice(-window).map((p) => p?.user_id).filter(Boolean));
    let idx = pool.findIndex((p) => !recent.has(p?.user_id));

    if (idx === -1) idx = 0; // どうしても無理なら諦めて先頭を出す（「なければしょうがない」）

    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function uniqById(posts: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const p of posts) {
    const id = String(p?.id ?? "");
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(p);
  }
  return out;
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);
  const cursor = toIsoOrNull(searchParams.get("cursor"));

  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id ?? null;

  // -------------------------
  // 未ログイン：friendsも代替で見せる（あなたの方針 3）
  // -------------------------
  // → public投稿から出す。followボタンは meId=null なので出ない。
  if (!meId) {
    let q = supabase
      .from("posts")
      .select("id,user_id,created_at,visited_on,content,place_id,place_name,place_address,image_urls,image_variants,image_assets,cover_square_url,cover_full_url,cover_pin_url,recommend_score,price_yen,price_range, profiles!inner(id,display_name,avatar_url,is_public)")
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false })
      .limit(Math.max(80, limit * 6));

    if (cursor) q = q.lt("created_at", cursor);

    const { data, error } = await q;
    if (error) return NextResponse.json({ posts: [], nextCursor: null, meta: null }, { status: 200 });

    const raw = (data ?? []).map((r: any) => ({
      ...r,
      profile: r.profiles ?? null,
      viewer_following_author: false,
    }));

    const arranged = enforceNoRepeatWithin(raw, 3).slice(0, limit);
    const nextCursor = arranged.length ? arranged[arranged.length - 1].created_at : null;

    return NextResponse.json({ posts: arranged, nextCursor, meta: null });
  }

  // -------------------------
  // ログイン：自分の followees
  // -------------------------
  const { data: follows, error: fErr } = await supabase
    .from("follows")
    .select("followee_id,status")
    .eq("follower_id", meId)
    .eq("status", "accepted");

  if (fErr) return NextResponse.json({ posts: [], nextCursor: null, meta: null }, { status: 200 });

  const followeeIds = (follows ?? []).map((r: any) => r.followee_id).filter(Boolean);
  const followingSet = new Set<string>(followeeIds);
  const visibleUserIds = Array.from(new Set([meId, ...followeeIds]));

  // -------------------------
  // ✅ meta（おすすめユーザー）を作る：旧ロジックの軽量版
  // -------------------------
  // A: フォローバック候補（相手->自分 accepted、自分->相手なし）
  const { data: incoming } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", meId)
    .eq("status", "accepted")
    .limit(500);

  const incomingIds = Array.from(new Set((incoming ?? []).map((r: any) => r.follower_id).filter(Boolean)))
    .filter((uid) => uid !== meId && !followingSet.has(uid));

  // B: 友達がフォロー（friend->target）
  let friendFollowTargets: { target: string; recommendedBy: string[] }[] = [];
  if (followeeIds.length) {
    const { data: ff } = await supabase
      .from("follows")
      .select("follower_id, followee_id")
      .in("follower_id", followeeIds.slice(0, 80))
      .eq("status", "accepted")
      .limit(1500);

    const m = new Map<string, Set<string>>();
    for (const r of ff ?? []) {
      const fid = (r as any).follower_id as string | null;
      const tid = (r as any).followee_id as string | null;
      if (!fid || !tid) continue;
      if (tid === meId) continue;
      if (followingSet.has(tid)) continue;
      if (visibleUserIds.includes(tid)) continue;
      if (!m.has(tid)) m.set(tid, new Set());
      m.get(tid)!.add(fid);
    }
    friendFollowTargets = Array.from(m.entries()).map(([target, set]) => ({
      target,
      recommendedBy: Array.from(set).slice(0, 2),
    }));
  }

  const kindByUser: Record<string, SuggestKind> = {};
  for (const uid of incomingIds) kindByUser[uid] = "follow_back";
  for (const x of friendFollowTargets) if (!kindByUser[x.target]) kindByUser[x.target] = "friend_follows";

  // metaに出すユーザーを最大8人
  const suggestUserIds: string[] = [];
  for (const uid of incomingIds.slice(0, 6)) suggestUserIds.push(uid);
  for (const x of friendFollowTargets.slice(0, 20)) {
    if (suggestUserIds.length >= 8) break;
    if (!suggestUserIds.includes(x.target)) suggestUserIds.push(x.target);
  }

  // 足りなければ public投稿の作者から補完
  if (suggestUserIds.length < 6) {
    const { data: extraAuthors } = await supabase
      .from("posts")
      .select("user_id, profiles!inner(id,display_name,avatar_url,is_public)")
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false })
      .limit(200);

    for (const r of extraAuthors ?? []) {
      const uid = (r as any).user_id as string | null;
      if (!uid) continue;
      if (uid === meId) continue;
      if (followingSet.has(uid)) continue;
      if (suggestUserIds.includes(uid)) continue;
      suggestUserIds.push(uid);
      if (suggestUserIds.length >= 8) break;
    }
  }

  let meta: any = null;
  if ((followeeIds.length <= 1) && suggestUserIds.length) {
    const { data: sProfs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", suggestUserIds.slice(0, 8));

    const sMap: Record<string, any> = {};
    for (const p of sProfs ?? []) sMap[(p as any).id] = p;

    const users = suggestUserIds
      .slice(0, 8)
      .map((id) => sMap[id])
      .filter(Boolean)
      .map((p: any) => {
        const kind = kindByUser[p.id] ?? "global";
        return {
          id: p.id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          mode: kind === "follow_back" ? "followback" : "follow",
          subtitle:
            kind === "follow_back"
              ? "あなたをフォロー中"
              : kind === "friend_follows"
              ? "友達がフォロー"
              : "おすすめ",
        };
      });

    meta = {
      suggestOnce: true,
      suggestAtIndex: 1,
      suggestion: {
        title: followeeIds.length === 0 ? "気になる人をフォローしてみましょう" : "この人たちも良さそう",
        subtitle: followeeIds.length === 0 ? "おすすめのユーザーを表示しています" : "つながりから提案",
        users,
      },
    };
  }

  // -------------------------
  // ✅ friends投稿本体
  // - followeeが0なら public投稿で代替（あなたの要望）
  // - followeeがあるなら rpc + 必要なら inject候補も混ぜる
  // -------------------------

  // (1) ベース（自分 + followees）: RPC
  let baseRows: any[] = [];
  if (followeeIds.length) {
    const { data, error } = await supabase.rpc("timeline_friends_v1", {
      p_limit: Math.max(40, limit * 4),
      p_cursor: cursor,
    });
    if (!error) baseRows = (data ?? []) as any[];
  }

  // RPCの行→Post形式へ（あなたの既存routeと互換）
  const basePosts = baseRows.map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    visited_on: r.visited_on ?? null,
    content: r.content ?? null,

    place_id: r.place_id ?? null,
    place_name: r.place_name ?? null,
    place_address: r.place_address ?? null,

    image_urls: r.image_urls ?? null,
    image_variants: r.image_variants ?? null,
    image_assets: r.image_assets ?? null,
    cover_square_url: r.cover_square_url ?? null,
    cover_full_url: r.cover_full_url ?? null,
    cover_pin_url: r.cover_pin_url ?? null,

    recommend_score: r.recommend_score ?? null,
    price_yen: r.price_yen ?? null,
    price_range: r.price_range ?? null,

    profile: {
      id: r.user_id,
      display_name: r.author_display_name ?? null,
      avatar_url: r.author_avatar_url ?? null,
      is_public: r.author_is_public ?? true,
    },

    viewer_following_author: followingSet.has(r.user_id),
  }));

  // (2) followeeが0なら public投稿で代替
  let fallbackPosts: any[] = [];
  if (followeeIds.length === 0) {
    let q = supabase
      .from("posts")
      .select("id,user_id,created_at,visited_on,content,place_id,place_name,place_address,image_urls,image_variants,image_assets,cover_square_url,cover_full_url,cover_pin_url,recommend_score,price_yen,price_range, profiles!inner(id,display_name,avatar_url,is_public)")
      .eq("profiles.is_public", true)
      .neq("user_id", meId)
      .order("created_at", { ascending: false })
      .limit(Math.max(120, limit * 8));

    if (cursor) q = q.lt("created_at", cursor);

    const { data, error } = await q;
    if (!error) {
      fallbackPosts = (data ?? []).map((r: any) => ({
        ...r,
        profile: r.profiles ?? null,
        viewer_following_author: false,
      }));
    }
  }

  // (3) inject候補（public & recommend>=9）を少量混ぜたいならここで
  // いったん「フォロー0の代替」では “投稿は全部publicでOK” なので injectは省略しても成立。
  // （必要なら次で旧scoreCandidate方式を完全移植する）

  const merged = followeeIds.length ? basePosts : fallbackPosts;

  // ✅ 1) 重複排除 2) n+3制約 3) limitに切る
  const uniq = uniqById(merged);
  const arranged = enforceNoRepeatWithin(uniq, 3).slice(0, limit);

  const nextCursorOut = arranged.length ? arranged[arranged.length - 1].created_at : null;

  return NextResponse.json({ posts: arranged, nextCursor: nextCursorOut, meta });
}
