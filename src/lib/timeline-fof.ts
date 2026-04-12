// src/lib/timeline-fof.ts
// "良い not-following" 投稿をタイムラインに混ぜるユーティリティ
// - k-hop=2: フォローしてる人がフォローしてる人（具体名表示）
// - followers: 自分のことをフォローしてる人（自分がフォロー返ししてない人）

import type { SupabaseClient } from "@supabase/supabase-js";

export type GoodNotFollowingInfo = {
  followeeIds: string[];
  fofUserIds: string[];
  followerUserIds: string[];
  /** userId -> 理由ラベル（例: "Rikuさんがフォロー中", "あなたのことをフォロー中"） */
  reasonMap: Map<string, string>;
};

/**
 * "良い not-following" ユーザーを収集:
 * 1) k-hop=2: フォローしてる人がフォローしてる人（具体的に誰がフォローしてるか表示）
 * 2) followers: 自分をフォローしてるがフォロー返ししてない人
 */
export async function getGoodNotFollowingUsers(
  supabase: SupabaseClient,
  meId: string
): Promise<GoodNotFollowingInfo> {
  // k=1: 自分がフォローしている人 + 自分をフォローしている人
  const [{ data: k1 }, { data: myFollowers }] = await Promise.all([
    supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", meId)
      .eq("status", "accepted"),
    supabase
      .from("follows")
      .select("follower_id")
      .eq("followee_id", meId)
      .eq("status", "accepted"),
  ]);

  const followeeIds = (k1 ?? [])
    .map((r: any) => r.followee_id)
    .filter(Boolean) as string[];

  const followeeSet = new Set<string>([meId, ...followeeIds]);
  const reasonMap = new Map<string, string>();

  // --- followers: 自分をフォローしてるけどフォロバしてない人 ---
  const followerUserIds: string[] = [];
  for (const r of myFollowers ?? []) {
    const uid = r.follower_id;
    if (uid && !followeeSet.has(uid)) {
      followerUserIds.push(uid);
      reasonMap.set(uid, "あなたのことをフォロー中");
    }
  }

  // --- k-hop=2: 誰がフォローしてるかを追跡 ---
  let fofUserIds: string[] = [];
  if (followeeIds.length > 0) {
    // follower_id（自分のフォロイー）→ followee_id（fofユーザー）の関係を取得
    const { data: k2 } = await supabase
      .from("follows")
      .select("follower_id, followee_id")
      .in("follower_id", followeeIds)
      .eq("status", "accepted");

    // fofUserId -> フォローしてるフォロイーのIDを記録
    const fofToFollowee = new Map<string, string>();
    const allExclude = new Set<string>([...followeeSet, ...followerUserIds]);

    for (const r of k2 ?? []) {
      const fofUid = r.followee_id;
      const viaUid = r.follower_id;
      if (fofUid && viaUid && !allExclude.has(fofUid) && !fofToFollowee.has(fofUid)) {
        fofToFollowee.set(fofUid, viaUid);
      }
    }

    fofUserIds = Array.from(fofToFollowee.keys());

    // フォロイーのdisplay_nameを取得して理由ラベルを作成
    if (fofUserIds.length > 0) {
      const viaUserIds = Array.from(new Set(fofToFollowee.values()));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", viaUserIds);

      const nameMap = new Map<string, string>();
      for (const p of profiles ?? []) {
        if (p.id && p.display_name) {
          nameMap.set(p.id, p.display_name);
        }
      }

      for (const [fofUid, viaUid] of fofToFollowee) {
        const viaName = nameMap.get(viaUid);
        reasonMap.set(
          fofUid,
          viaName ? `${viaName}さんがフォロー中` : "フォロー中の人がフォロー中"
        );
      }
    }
  }

  return { followeeIds, fofUserIds, followerUserIds, reasonMap };
}

const POST_SELECT =
  "id,user_id,created_at,visited_on,time_of_day,content,place_id,place_name,place_address,image_urls,image_variants,image_assets,cover_square_url,cover_full_url,cover_pin_url,recommend_score,price_yen,price_range,profiles!inner(id,display_name,avatar_url,is_public)";

/**
 * "良い not-following" ユーザーの投稿をランダムに取得
 * リフレッシュごとに異なる投稿を返す
 */
export async function fetchGoodNotFollowingPosts(
  supabase: SupabaseClient,
  info: GoodNotFollowingInfo,
  meId: string,
  limit: number,
  cursor: string | null
): Promise<any[]> {
  const allUserIds = [...info.followerUserIds, ...info.fofUserIds];
  if (allUserIds.length === 0) return [];

  // 多めに取ってシャッフル
  const fetchSize = Math.min(limit * 4, 80);

  let q = supabase
    .from("posts")
    .select(POST_SELECT)
    .in("user_id", allUserIds)
    .eq("profiles.is_public", true)
    .order("created_at", { ascending: false })
    .limit(fetchSize);

  if (cursor) {
    q = q.lt("created_at", cursor);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  // シャッフルしてランダムに選ぶ（リフレッシュごとに違う結果）
  const shuffled = shuffleArray(data);
  const selected = shuffled.slice(0, limit);

  // いいね情報を取得
  const postIds = selected.map((p: any) => p.id);
  const likesMap = new Map<string, { count: number; likedByMe: boolean }>();

  if (postIds.length > 0) {
    const { data: likes } = await supabase
      .from("post_likes")
      .select("post_id, user_id")
      .in("post_id", postIds);

    for (const like of likes ?? []) {
      const existing = likesMap.get(like.post_id) ?? {
        count: 0,
        likedByMe: false,
      };
      existing.count++;
      if (like.user_id === meId) existing.likedByMe = true;
      likesMap.set(like.post_id, existing);
    }
  }

  return selected.map((r: any) => {
    const { profiles, ...rest } = r;
    const likeInfo = likesMap.get(r.id);
    const reason = info.reasonMap.get(r.user_id) ?? "おすすめ";
    return {
      ...rest,
      profile: profiles ?? null,
      likeCount: likeInfo?.count ?? 0,
      likedByMe: likeInfo?.likedByMe ?? false,
      initialLikers: [],
      notFollowingReason: reason,
    };
  });
}

/**
 * フレンド投稿と "良い not-following" 投稿をインターリーブ
 * - フレンド投稿を優先しつつ、約4投稿ごとに1つ挿入
 * - フレンド投稿が少ないときは not-following で補填（ただし過半数にはしない）
 */
export function interleavePosts(
  friendsPosts: any[],
  nfPosts: any[],
  totalLimit: number
): any[] {
  if (nfPosts.length === 0) return friendsPosts.slice(0, totalLimit);
  if (friendsPosts.length === 0) return nfPosts.slice(0, totalLimit);

  const result: any[] = [];
  let fi = 0;
  let ni = 0;

  // 約4:1の比率でインターリーブ（フレンド4つごとにnf1つ）
  const INTERVAL = 4;

  while (result.length < totalLimit && (fi < friendsPosts.length || ni < nfPosts.length)) {
    let added = 0;
    while (added < INTERVAL && fi < friendsPosts.length && result.length < totalLimit) {
      result.push(friendsPosts[fi++]);
      added++;
    }

    if (ni < nfPosts.length && result.length < totalLimit) {
      result.push(nfPosts[ni++]);
    }

    if (fi >= friendsPosts.length) {
      const maxNf = Math.ceil(totalLimit / 2);
      const currentNf = result.filter((p: any) => p.notFollowingReason).length;
      while (ni < nfPosts.length && result.length < totalLimit && currentNf + (ni - currentNf) < maxNf) {
        result.push(nfPosts[ni++]);
      }
      break;
    }
  }

  return result;
}

/** Fisher-Yates シャッフル */
function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
