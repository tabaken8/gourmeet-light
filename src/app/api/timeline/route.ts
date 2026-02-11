// app/api/timeline/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlacePhotoRefs } from "@/lib/google/getPlacePhotoRefs";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

type PlacePhotos = { refs: string[]; attributionsHtml: string };

type LikerLite = { id: string; display_name: string | null; avatar_url: string | null };
type ProfileLite = { id: string; display_name: string | null; avatar_url: string | null; is_public: boolean | null };

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

function groupByPostId<T extends { post_id: string }>(rows: T[]) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(r.post_id) ?? [];
    arr.push(r);
    m.set(r.post_id, arr);
  }
  return m;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createSupabaseAdmin(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function computeKHopsToTargets(args: {
  admin: ReturnType<typeof getAdminClient>;
  startUserId: string;
  targetIds: string[];
  maxK?: number;
}) {
  const { admin, startUserId, targetIds, maxK = 4 } = args;

  const hopMap: Record<string, number> = {};
  const targetSet = new Set(targetIds.filter(Boolean));

  if (!admin || !startUserId || targetSet.size === 0) return hopMap;

  const visited = new Set<string>([startUserId]);
  let frontier = new Set<string>([startUserId]);

  for (let k = 1; k <= maxK; k++) {
    const fromIds = Array.from(frontier);
    if (fromIds.length === 0) break;

    const { data, error } = await admin
      .from("follows")
      .select("followee_id")
      .in("follower_id", fromIds)
      .eq("status", "accepted");

    if (error) {
      console.error("[computeKHopsToTargets] follows query failed:", error.message);
      break;
    }

    const next = new Set<string>();
    for (const r of data ?? []) {
      const v = (r as any)?.followee_id as string | null;
      if (!v) continue;
      if (visited.has(v)) continue;

      visited.add(v);
      next.add(v);

      if (targetSet.has(v) && hopMap[v] == null) {
        hopMap[v] = k;
      }
    }

    if (Object.keys(hopMap).length >= targetSet.size) break;
    frontier = next;
  }

  return hopMap;
}

// ---- discover scoring helpers ----
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

// ------------------------------
// likers helper (max3)
// ------------------------------
async function buildInitialLikersMap(supabase: any, postIds: string[]) {
  const likerMap = new Map<string, LikerLite[]>();
  if (!postIds.length) return likerMap;

  // created_at が無い場合でも動くように一応 order しておく
  const { data: likeRows, error: lerr } = await supabase
    .from("post_likes")
    .select("post_id, user_id, created_at")
    .in("post_id", postIds)
    .order("created_at", { ascending: false });

  if (lerr) {
    console.error("[buildInitialLikersMap] post_likes error:", lerr.message);
    return likerMap;
  }

  const byPost = groupByPostId((likeRows ?? []) as any[]);
  const allUserIds = Array.from(new Set((likeRows ?? []).map((r: any) => r.user_id).filter(Boolean)));

  if (!allUserIds.length) return likerMap;

  const { data: likerProfiles, error: perr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", allUserIds);

  if (perr) {
    console.error("[buildInitialLikersMap] profiles error:", perr.message);
    return likerMap;
  }

  const pmap: Record<string, any> = {};
  for (const p of likerProfiles ?? []) pmap[p.id] = p;

  for (const pid of postIds) {
    const arr = (byPost.get(pid) ?? []).slice(0, 3);
    const lites: LikerLite[] = arr
      .map((r: any) => pmap[r.user_id])
      .filter(Boolean)
      .map((p: any) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }));
    likerMap.set(pid, lites);
  }

  return likerMap;
}

// ------------------------------
// friends injection plan (3~5)
// ------------------------------
function pickInjectEvery(userId: string, cursor: string | null) {
  const seed = `${userId}::${cursor ?? "first"}`;
  const v = hashString(seed) % 3; // 0..2
  return 3 + v; // 3..5
}

function interleaveInjected<T>(base: T[], injected: T[], every: number, idOf: (x: T) => string) {
  const out: T[] = [];
  const used = new Set<string>();

  let injIdx = 0;
  for (let i = 0; i < base.length; i++) {
    const b = base[i];
    const bid = idOf(b);
    if (!used.has(bid)) {
      out.push(b);
      used.add(bid);
    }

    const shouldInsert = (i + 1) % every === 0;
    if (shouldInsert && injIdx < injected.length) {
      // 次の未使用を探す
      while (injIdx < injected.length && used.has(idOf(injected[injIdx]))) injIdx++;
      if (injIdx < injected.length) {
        out.push(injected[injIdx]);
        used.add(idOf(injected[injIdx]));
        injIdx++;
      }
    }
  }

  // 余りも少しだけ入れてよい（ただし増えすぎ防止：最大+3）
  let extra = 0;
  while (injIdx < injected.length && extra < 3) {
    const x = injected[injIdx++];
    const xid = idOf(x);
    if (used.has(xid)) continue;
    out.push(x);
    used.add(xid);
    extra++;
  }

  return out;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const admin = getAdminClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "friends" ? "friends" : "discover";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 30);
  const cursor = url.searchParams.get("cursor");

  if (tab === "friends" && !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ✅ 画像カラムを全部返す
  const postSelect =
    "id, content, user_id, created_at," +
    " image_urls, image_variants, image_assets," +
    " cover_square_url, cover_full_url, cover_pin_url," +
    " place_name, place_address, place_id," +
    " recommend_score, price_yen, price_range";

  // ---------------- discover（未ログインOK） ----------------
  if (tab === "discover") {
    let q = supabase
      .from("posts")
      // places を join（ジャンル用）
      .select(`${postSelect}, profiles!inner ( id, display_name, avatar_url, is_public ), places:places ( primary_genre )`)
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (user?.id) q = q.neq("user_id", user.id);
    if (cursor) q = q.lt("created_at", cursor);

    const { data: rows, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const raw = (rows ?? []) as any[];

    // Like集計
    const postIds = raw.map((r) => r.id);
    let likeCountMap: Record<string, number> = {};
    let likedSet = new Set<string>();

    if (postIds.length) {
      const { data: likesAll } = await supabase.from("post_likes").select("post_id").in("post_id", postIds);
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

    // ✅ initialLikers（最大3）
    const initialLikersMap = await buildInitialLikersMap(supabase, postIds);

    // Place写真
    const placeIds = raw.map((r) => r.place_id).filter(Boolean);
    const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

    // k-hop（ログイン時のみ）
    const authorIds = Array.from(new Set(raw.map((r) => r.user_id).filter(Boolean)));
    let hopMap: Record<string, number> = {};
    if (user?.id && admin) {
      hopMap = await computeKHopsToTargets({ admin, startUserId: user.id, targetIds: authorIds, maxK: 6 });
    }

    let posts = raw.map((r) => {
      const k_hop = user?.id ? (hopMap[r.user_id] ?? null) : null;
      const is_following = user?.id ? k_hop === 1 : false;

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
        place_genre: r?.places?.primary_genre ?? null,

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
        initialLikers: initialLikersMap.get(r.id) ?? [],

        k_hop,
        is_following,

        // friends注入じゃない
        injected: false,
        injected_reason: null,
        recommended_by: null,
        is_following_author_by_me: user?.id ? is_following : false,
      };
    });

    // k=1除外（discover）
    if (user?.id) posts = posts.filter((p: any) => p.k_hop !== 1);

    const scored = posts
      .map((p: any) => ({
        ...p,
        __score: scoreForDiscover({
          created_at: p.created_at,
          k_hop: p.k_hop ?? null,
          recommend_score: p.recommend_score ?? null,
          postId: p.id,
        }),
      }))
      .sort((a: any, b: any) => (b.__score ?? 0) - (a.__score ?? 0));

    const reordered = reorderNoSameUserConsecutive(scored).map(({ __score, ...rest }: any) => rest);
    const nextCursor = raw.length ? raw[raw.length - 1].created_at : null;

    return json({ posts: reordered, nextCursor });
  }

  // ---------------- friends（ログイン必須） ----------------
  const { data: follows, error: fErr } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user!.id)
    .eq("status", "accepted");

  if (fErr) return json({ error: fErr.message }, 500);

  const followeeIds = (follows ?? []).map((x: any) => x.followee_id).filter(Boolean);
  const visibleUserIds = Array.from(new Set([user!.id, ...followeeIds]));

  if (visibleUserIds.length === 0) {
    return json({ posts: [], nextCursor: null });
  }

  // base posts（自分+フォロー）
  let pq = supabase
    .from("posts")
    .select(`${postSelect}, places:places ( primary_genre )`)
    .in("user_id", visibleUserIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) pq = pq.lt("created_at", cursor);

  const { data: postRows, error: pErr } = await pq;
  if (pErr) return json({ error: pErr.message }, 500);

  const base = (postRows ?? []) as any[];

  // ---------------- friends injection: 友達の友達（未フォロー） ----------------
  const injectEvery = pickInjectEvery(user!.id, cursor);
  const wantInject = Math.max(0, Math.floor(base.length / injectEvery)); // 例: 10件なら 2〜3件くらい
  let injectedPostsRaw: any[] = [];
  let recommendedByMap: Record<string, ProfileLite | null> = {};

  if (wantInject > 0 && followeeIds.length > 0) {
    // followee がフォローしてる先（候補作者）を拾う
    // ※ここは重くなりやすいので upper bound をかける
    const { data: fofEdges } = await supabase
      .from("follows")
      .select("follower_id, followee_id")
      .in("follower_id", followeeIds.slice(0, 200))
      .eq("status", "accepted")
      .limit(2000);

    const edges = (fofEdges ?? []) as any[];

    // candidate authors（自分と既フォローは除外）
    const candidateAuthorIds = Array.from(
      new Set(
        edges
          .map((e: any) => e.followee_id)
          .filter((id: any) => !!id && !visibleUserIds.includes(id))
      )
    ).slice(0, 300);

    if (candidateAuthorIds.length > 0) {
      let iq = supabase
        .from("posts")
        .select(`${postSelect}, places:places ( primary_genre )`)
        .in("user_id", candidateAuthorIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(20, wantInject * 5)); // 余裕持って取る

      if (cursor) iq = iq.lt("created_at", cursor);

      const { data: injRows, error: injErr } = await iq;
      if (injErr) {
        console.error("[friends injection] posts query failed:", injErr.message);
      } else {
        injectedPostsRaw = (injRows ?? []) as any[];

        // どの友達がその作者をフォローしてるか：一人だけ選ぶ
        const authorToRecommender: Record<string, string> = {};
        for (const e of edges) {
          const recommender = e?.follower_id as string | null;
          const author = e?.followee_id as string | null;
          if (!recommender || !author) continue;
          if (authorToRecommender[author]) continue;
          authorToRecommender[author] = recommender;
        }

        // recommender profiles
        const recommenderIds = Array.from(new Set(Object.values(authorToRecommender))).slice(0, 200);

        if (recommenderIds.length) {
          const { data: recProfs } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, is_public")
            .in("id", recommenderIds);

          const recMap: Record<string, any> = {};
          for (const p of recProfs ?? []) recMap[p.id] = p;

          for (const authorId of Object.keys(authorToRecommender)) {
            const recId = authorToRecommender[authorId];
            const rp = recMap[recId];
            recommendedByMap[authorId] = rp
              ? {
                  id: rp.id,
                  display_name: rp.display_name,
                  avatar_url: rp.avatar_url,
                  is_public: rp.is_public,
                }
              : null;
          }
        }
      }
    }
  }

  // ---------------- profiles（base + injected） ----------------
  const allRows = [...base, ...injectedPostsRaw];
  const userIds = Array.from(new Set(allRows.map((p) => p.user_id).filter(Boolean)));

  const { data: profs, error: prErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_public")
    .in("id", userIds);

  if (prErr) return json({ error: prErr.message }, 500);

  const profMap: Record<string, any> = {};
  for (const p of profs ?? []) profMap[p.id] = p;

  // ---------------- Place photos ----------------
  const placeIds = allRows.map((p) => p.place_id).filter(Boolean);
  const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

  // ---------------- Like集計（base + injected） ----------------
  const postIds = allRows.map((p) => p.id);
  let likeCountMap: Record<string, number> = {};
  let likedSet = new Set<string>();

  if (postIds.length) {
    const { data: likesAll } = await supabase.from("post_likes").select("post_id").in("post_id", postIds);
    likeCountMap = countByPostId(likesAll ?? []);

    const { data: myLikes } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", user!.id)
      .in("post_id", postIds);

    likedSet = new Set((myLikes ?? []).map((r: any) => r.post_id));
  }

  // ✅ initialLikers（最大3）
  const initialLikersMap = await buildInitialLikersMap(supabase, postIds);

  // ---------------- build base posts ----------------
  const basePosts = base.map((p) => ({
    ...p,
    place_genre: p?.places?.primary_genre ?? null,
    profile: profMap[p.user_id] ?? null,
    placePhotos: p.place_id ? placePhotoMap[p.place_id] ?? null : null,
    likeCount: likeCountMap[p.id] ?? 0,
    likedByMe: likedSet.has(p.id),
    initialLikers: initialLikersMap.get(p.id) ?? [],
    injected: false,
    injected_reason: null,
    recommended_by: null,
    is_following_author_by_me: true, // base はフォロー中 or 自分
  }));

  // ---------------- build injected posts ----------------
  const injectedPosts = injectedPostsRaw
    .filter((p) => !visibleUserIds.includes(p.user_id)) // 念のため
    .map((p) => {
      const authorProfile = profMap[p.user_id] ?? null;
      const recommendedBy = recommendedByMap[p.user_id] ?? null;

      return {
        ...p,
        place_genre: p?.places?.primary_genre ?? null,
        profile: authorProfile,
        placePhotos: p.place_id ? placePhotoMap[p.place_id] ?? null : null,
        likeCount: likeCountMap[p.id] ?? 0,
        likedByMe: likedSet.has(p.id),
        initialLikers: initialLikersMap.get(p.id) ?? [],
        injected: true,
        injected_reason: recommendedBy?.display_name
          ? `${recommendedBy.display_name}がフォロー`
          : "あなたの友達がフォロー",
        recommended_by: recommendedBy,
        is_following_author_by_me: false,
      };
    });

  // interleave
  const mixed = interleaveInjected(
    basePosts,
    injectedPosts.slice(0, Math.max(1, wantInject)), // 取りすぎ防止
    injectEvery,
    (x: any) => x.id
  );

  const nextCursor = base.length ? base[base.length - 1].created_at : null;
  return json({ posts: mixed, nextCursor });
}
