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

  // ✅ 画像カラムを全部返す（ここが欠けるとフロントが選べない）
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
      .select(`${postSelect}, profiles!inner ( id, display_name, avatar_url, is_public )`)
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

        k_hop,
        is_following,
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

  const followeeIds = (follows ?? []).map((x: any) => x.followee_id);
  const visibleUserIds = Array.from(new Set([user!.id, ...followeeIds]));

  if (visibleUserIds.length === 0) {
    return json({ posts: [], nextCursor: null });
  }

  let pq = supabase
    .from("posts")
    .select(postSelect)
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

  // Place写真
  const placeIds = base.map((p) => p.place_id).filter(Boolean);
  const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

  // Like集計
  const postIds = base.map((p) => p.id);
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

  const posts = base.map((p) => ({
    ...p,
    profile: profMap[p.user_id] ?? null,
    placePhotos: p.place_id ? placePhotoMap[p.place_id] ?? null : null,
    likeCount: likeCountMap[p.id] ?? 0,
    likedByMe: likedSet.has(p.id),
  }));

  const nextCursor = posts.length ? posts[posts.length - 1].created_at : null;
  return json({ posts, nextCursor });
}
