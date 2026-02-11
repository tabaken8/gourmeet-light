// app/api/timeline/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlacePhotoRefs } from "@/lib/google/getPlacePhotoRefs";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

type PlacePhotos = { refs: string[]; attributionsHtml: string };

async function buildPlacePhotoMap(placeIds: string[], perPlace = 6) {
  const uniq = Array.from(new Set(placeIds)).filter(Boolean);
  const limited = uniq.slice(0, 10);

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

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createSupabaseAdmin(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function scoreForDiscover(params: {
  created_at: string;
  k_hop: number | null;
  recommend_score?: number | null;
  postId: string;
}) {
  const now = Date.now();

  const hop = params.k_hop;
  const hopScore = typeof hop === "number" && hop >= 2 ? 1 / (hop - 1) : 0.15;

  const t = Date.parse(params.created_at);
  const ageHours = Number.isFinite(t) ? (now - t) / 36e5 : 1e6;
  const recencyScore = Math.exp(-Math.max(0, ageHours) / 72);

  const recommend =
    typeof params.recommend_score === "number"
      ? Math.min(1, Math.max(0, params.recommend_score / 10))
      : 0.4;

  const jitter = ((hashString(params.postId) % 1000) / 1000) * 0.02;

  return 0.62 * hopScore + 0.28 * recencyScore + 0.10 * recommend + jitter;
}

function reorderNoSameUserConsecutive(input: any[]) {
  const pool = [...input];
  const out: any[] = [];
  let lastUser: string | null = null;

  while (pool.length > 0) {
    let pickIndex = -1;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i]?.user_id !== lastUser) {
        pickIndex = i;
        break;
      }
    }
    if (pickIndex === -1) pickIndex = 0;

    const [picked] = pool.splice(pickIndex, 1);
    out.push(picked);
    lastUser = picked?.user_id ?? null;
  }

  return out;
}

type SuggestKind = "follow_back" | "friend_follows";

function decideInjectEvery(seedKey: string) {
  // 3〜5投稿に1つ（決定的に）
  const r = hashString(seedKey) % 3; // 0,1,2
  return 3 + r; // 3..5
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const admin = getAdminClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "friends" ? "friends" : "discover";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 30);
  const cursor = url.searchParams.get("cursor"); // created_at cursor

  if (tab === "friends" && !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ✅ places を join してジャンルを返す（AlbumBrowser と揃える）
  // posts.place_id = places.place_id 前提
  const placesSelect = "place_id, name, address, primary_genre, area_label_ja, search_text";

  const postSelect =
    "id, content, user_id, created_at," +
    " image_urls, image_variants, image_assets," +
    " cover_square_url, cover_full_url, cover_pin_url," +
    " place_name, place_address, place_id," +
    " recommend_score, price_yen, price_range," +
    ` places:places (${placesSelect})`;

  // ---------------- discover（未ログインOK） ----------------
  if (tab === "discover") {
    let q = supabase
      .from("posts")
      .select(`${postSelect}, profiles!inner ( id, display_name, avatar_url, is_public )`)
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (user?.id) q = q.neq("user_id", user.id);
    if (cursor) q = q.lt("created_at", cursor);

    const { data: rows, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const raw = (rows ?? []) as any[];

    const postIds = raw.map((r) => r.id);
    let likeCountMap: Record<string, number> = {};
    let likedSet = new Set<string>();
    let likersMap: Record<string, any[]> = {};

    if (postIds.length) {
      const { data: likesAll } = await supabase
        .from("post_likes")
        .select("post_id, user_id, created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: false });

      likeCountMap = countByPostId(likesAll ?? []);

      // 先頭数名のlikers（投稿ごとに最大3）
      const byPost: Record<string, any[]> = {};
      for (const r of likesAll ?? []) {
        const pid = (r as any).post_id;
        if (!pid) continue;
        if (!byPost[pid]) byPost[pid] = [];
        if (byPost[pid].length < 3) byPost[pid].push(r);
      }
      likersMap = byPost;

      if (user) {
        const { data: myLikes } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds);
        likedSet = new Set((myLikes ?? []).map((r: any) => r.post_id));
      }
    }

    // likers profile
    const likerIds = Array.from(
      new Set(
        Object.values(likersMap)
          .flat()
          .map((r: any) => r.user_id)
          .filter(Boolean)
      )
    );
    const likerProfMap: Record<string, any> = {};
    if (likerIds.length) {
      const { data: lprofs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", likerIds);
      for (const p of lprofs ?? []) likerProfMap[(p as any).id] = p;
    }

    const placeIds = raw.map((r) => r.place_id).filter(Boolean);
    const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

    // k-hop（ログイン時のみ / admin必要）
    const authorIds = Array.from(new Set(raw.map((r) => r.user_id).filter(Boolean)));
    let hopMap: Record<string, number> = {};
    if (user?.id && admin) {
      // BFSは重いので、discoverは既存のまま（省略: computeKHopsToTargets を使うならここに戻してOK）
      // 現状はk_hop無しでOKでも動く
    }

    let posts = raw.map((r) => {
      const initialLikers = (likersMap[r.id] ?? [])
        .map((x: any) => likerProfMap[x.user_id])
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        }));

      return {
        id: r.id,
        content: r.content,
        user_id: r.user_id,
        created_at: r.created_at,

        image_urls: r.image_urls ?? null,
        image_variants: r.image_variants ?? null,
        image_assets: r.image_assets ?? null,

        cover_square_url: r.cover_square_url ?? null,
        cover_full_url: r.cover_full_url ?? null,
        cover_pin_url: r.cover_pin_url ?? null,

        place_name: r.place_name,
        place_address: r.place_address,
        place_id: r.place_id,
        places: r.places ?? null,

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

        likeCount: likeCountMap[r.id] ?? 0,
        likedByMe: user ? likedSet.has(r.id) : false,
        initialLikers,
      };
    });

    const scored = posts
      .map((p: any) => ({
        ...p,
        __score: scoreForDiscover({
          created_at: p.created_at,
          k_hop: null,
          recommend_score: p.recommend_score ?? null,
          postId: p.id,
        }),
      }))
      .sort((a: any, b: any) => (b.__score ?? 0) - (a.__score ?? 0));

    const reordered = reorderNoSameUserConsecutive(scored).map(({ __score, ...rest }: any) => rest);
    const nextCursor = raw.length ? raw[raw.length - 1].created_at : null;

    return json({ posts: reordered, nextCursor });
  }

  // ---------------- friends（ログイン必須 / “最新”タブの中身） ----------------
  // 1) 自分がフォローしてる人
  const { data: follows, error: fErr } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user!.id)
    .eq("status", "accepted");

  if (fErr) return json({ error: fErr.message }, 500);

  const followeeIds = (follows ?? []).map((x: any) => x.followee_id).filter(Boolean);
  const followingSet = new Set<string>(followeeIds);
  const visibleUserIds = Array.from(new Set([user!.id, ...followeeIds]));

  // 2) ベース投稿（自分＋フォロー中）
  let pq = supabase
    .from("posts")
    .select(postSelect)
    .in("user_id", visibleUserIds)
    .order("created_at", { ascending: false })
    .limit(limit * 2); // 混入で削るので多めに取る

  if (cursor) pq = pq.lt("created_at", cursor);

  const { data: postRows, error: pErr } = await pq;
  if (pErr) return json({ error: pErr.message }, 500);

  const base = (postRows ?? []) as any[];

  // 3) suggest対象ユーザーを作る（未フォローだけ）
  // (A) フォローバック候補：相手->自分 はaccepted、 自分->相手 はない
  const { data: incoming } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", user!.id)
    .eq("status", "accepted")
    .limit(200);

  const incomingIds = Array.from(
    new Set((incoming ?? []).map((r: any) => r.follower_id).filter(Boolean))
  ).filter((uid) => uid !== user!.id && !followingSet.has(uid));

  // (B) 友達がフォロー： friend -> target を拾う（target は未フォロー）
  let friendFollowTargets: { target: string; recommendedBy: string[] }[] = [];
  if (followeeIds.length) {
    const { data: ff } = await supabase
      .from("follows")
      .select("follower_id, followee_id")
      .in("follower_id", followeeIds.slice(0, 50))
      .eq("status", "accepted")
      .limit(600);

    const m = new Map<string, Set<string>>(); // target -> recommenders
    for (const r of ff ?? []) {
      const fid = (r as any).follower_id as string | null;
      const tid = (r as any).followee_id as string | null;
      if (!fid || !tid) continue;
      if (tid === user!.id) continue;
      if (followingSet.has(tid)) continue; // 既に自分がフォロー
      if (visibleUserIds.includes(tid)) continue; // 既にベースに含まれる
      if (!m.has(tid)) m.set(tid, new Set());
      m.get(tid)!.add(fid);
    }
    friendFollowTargets = Array.from(m.entries()).map(([target, set]) => ({
      target,
      recommendedBy: Array.from(set).slice(0, 2),
    }));
  }

  // suggestユーザーID（優先: フォローバック → 友達がフォロー）
  const suggestUserIds: string[] = [];
  const suggestMeta: Record<
    string,
    { kind: SuggestKind; recommendedByIds?: string[] }
  > = {};

  for (const uid of incomingIds.slice(0, 60)) {
    suggestUserIds.push(uid);
    suggestMeta[uid] = { kind: "follow_back" };
  }
  for (const x of friendFollowTargets.slice(0, 80)) {
    if (suggestMeta[x.target]) continue;
    suggestUserIds.push(x.target);
    suggestMeta[x.target] = { kind: "friend_follows", recommendedByIds: x.recommendedBy };
  }

  // 4) suggest投稿（新着順、ただしベースと同じcursor制約）
  let suggestPosts: any[] = [];
  if (suggestUserIds.length) {
    let sq = supabase
      .from("posts")
      .select(postSelect)
      .in("user_id", suggestUserIds.slice(0, 120))
      .order("created_at", { ascending: false })
      .limit(Math.max(6, Math.ceil(limit / 2)));

    if (cursor) sq = sq.lt("created_at", cursor);

    const { data: srows } = await sq;
    suggestPosts = (srows ?? []) as any[];
  }

  // 5) profile取得（ベース＋suggest＋recommendedBy）
  const userIds = Array.from(
    new Set([
      ...base.map((p) => p.user_id),
      ...suggestPosts.map((p) => p.user_id),
      ...Object.values(suggestMeta)
        .flatMap((m) => m.recommendedByIds ?? []),
    ].filter(Boolean))
  );

  const { data: profs, error: prErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_public")
    .in("id", userIds);

  if (prErr) return json({ error: prErr.message }, 500);

  const profMap: Record<string, any> = {};
  for (const p of profs ?? []) profMap[(p as any).id] = p;

  // 6) Place写真（ベース＋suggest分）
  const placeIds = [...base, ...suggestPosts].map((p) => p.place_id).filter(Boolean);
  const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

  // 7) Like集計（ベース＋suggest）
  const allPostIds = Array.from(new Set([...base, ...suggestPosts].map((p) => p.id)));
  let likeCountMap: Record<string, number> = {};
  let likedSet = new Set<string>();
  let likersMap: Record<string, any[]> = {};

  if (allPostIds.length) {
    const { data: likesAll } = await supabase
      .from("post_likes")
      .select("post_id, user_id, created_at")
      .in("post_id", allPostIds)
      .order("created_at", { ascending: false });

    likeCountMap = countByPostId(likesAll ?? []);

    const byPost: Record<string, any[]> = {};
    for (const r of likesAll ?? []) {
      const pid = (r as any).post_id;
      if (!pid) continue;
      if (!byPost[pid]) byPost[pid] = [];
      if (byPost[pid].length < 3) byPost[pid].push(r);
    }
    likersMap = byPost;

    const { data: myLikes } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", user!.id)
      .in("post_id", allPostIds);

    likedSet = new Set((myLikes ?? []).map((r: any) => r.post_id));
  }

  // likers profile
  const likerIds = Array.from(
    new Set(
      Object.values(likersMap)
        .flat()
        .map((r: any) => r.user_id)
        .filter(Boolean)
    )
  );
  const likerProfMap: Record<string, any> = {};
  if (likerIds.length) {
    const { data: lprofs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", likerIds);
    for (const p of lprofs ?? []) likerProfMap[(p as any).id] = p;
  }

  // 8) ポスト整形（ベース/サジェスト共通）
  function decorate(p: any) {
    const initialLikers = (likersMap[p.id] ?? [])
      .map((x: any) => likerProfMap[x.user_id])
      .filter(Boolean)
      .map((pp: any) => ({
        id: pp.id,
        display_name: pp.display_name,
        avatar_url: pp.avatar_url,
      }));

    const author = profMap[p.user_id] ?? null;
    const meta = suggestMeta[p.user_id] ?? null;

    const recommendedBy =
      meta?.kind === "friend_follows"
        ? (meta.recommendedByIds ?? [])
            .map((id) => profMap[id])
            .filter(Boolean)
            .map((x: any) => ({
              id: x.id,
              display_name: x.display_name,
              avatar_url: x.avatar_url,
              is_public: x.is_public ?? true,
            }))
        : [];

    return {
      ...p,
      profile: author
        ? {
            id: author.id,
            display_name: author.display_name,
            avatar_url: author.avatar_url,
            is_public: author.is_public ?? true,
          }
        : null,
      placePhotos: p.place_id ? placePhotoMap[p.place_id] ?? null : null,
      likeCount: likeCountMap[p.id] ?? 0,
      likedByMe: likedSet.has(p.id),
      initialLikers,
      // ✅ 追加：混入投稿かどうか
      suggest_kind: meta?.kind ?? null, // "follow_back" | "friend_follows" | null
      recommended_by: recommendedBy, // friend_follows の時だけ
    };
  }

  const baseDecorated = base.map(decorate);
  const suggestDecorated = suggestPosts.map(decorate);

  // 9) 混ぜる（3〜5に1つ、ただしsuggestが無いときは混ぜない）
  const injectEvery = decideInjectEvery(`${user!.id}:${cursor ?? "first"}`);
  const out: any[] = [];
  const usedPost = new Set<string>();
  const suggestQueue = suggestDecorated
    .filter((p) => !visibleUserIds.includes(p.user_id)) // 念のため
    .slice(0, 30);

  let i = 0;
  for (const p of baseDecorated) {
    if (out.length >= limit) break;

    // inject
    if (suggestQueue.length > 0 && i > 0 && i % injectEvery === 0 && out.length < limit) {
      const s = suggestQueue.shift()!;
      if (!usedPost.has(s.id)) {
        out.push(s);
        usedPost.add(s.id);
      }
    }

    if (!usedPost.has(p.id)) {
      out.push(p);
      usedPost.add(p.id);
      i++;
    }
  }

  // 足りなければsuggestで埋める（ベースが少ない時）
  while (out.length < limit && suggestQueue.length > 0) {
    const s = suggestQueue.shift()!;
    if (usedPost.has(s.id)) continue;
    out.push(s);
    usedPost.add(s.id);
  }

  const nextCursor = out.length ? out[out.length - 1].created_at : null;
  return json({ posts: out, nextCursor });
}
