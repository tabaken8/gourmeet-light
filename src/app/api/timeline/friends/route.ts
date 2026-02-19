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

// --------------------
// types (client互換の最小セット)
// --------------------
type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
};

type PostRow = {
  id: string;
  content: string | null;
  user_id: string;
  created_at: string;

  image_urls: string[] | null;
  image_variants: any[] | null;
  image_assets?: any[] | null;

  cover_square_url?: string | null;
  cover_full_url?: string | null;
  cover_pin_url?: string | null;

  place_name: string | null;
  place_address: string | null;
  place_id: string | null;
  place_genre?: string | null;

  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;

  profile: ProfileLite | null;

  likeCount?: number;
  likedByMe?: boolean;
  initialLikers?: any[];

  // 注入
  injected?: boolean;
  inject_reason?: string | null;
  inject_follow_mode?: "follow" | "followback" | null;
  inject_target_user_id?: string | null;
};

type SuggestUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  mode?: "follow" | "followback";
  subtitle?: string | null;
};

type TimelineMeta = {
  suggestOnce?: boolean;
  suggestAtIndex?: number;
  suggestion?: {
    title: string;
    subtitle?: string | null;
    users: SuggestUser[];
  } | null;
};

// --------------------
// diversity (window=4 => recent users size=3)
// --------------------
function diversifyWindow(
  candidates: PostRow[],
  limit: number,
  opts?: { window?: number; maxExtraFetchCycles?: number }
) {
  const window = opts?.window ?? 4;
  const recentMax = Math.max(0, window - 1);

  const out: PostRow[] = [];
  const recent: string[] = [];
  const usedPost = new Set<string>();

  const take = (p: PostRow) => {
    out.push(p);
    usedPost.add(p.id);
    recent.push(p.user_id);
    while (recent.length > recentMax) recent.shift();
  };

  // candidates から「最近3人と被らない最初の1件」を取る
  while (out.length < limit && candidates.length > 0) {
    let idx = -1;
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      if (!p?.id || usedPost.has(p.id)) continue;
      if (!p.user_id) continue;
      if (recent.includes(p.user_id)) continue;
      idx = i;
      break;
    }

    if (idx >= 0) {
      const [p] = candidates.splice(idx, 1);
      take(p);
      continue;
    }

    // 見つからない: 代替は「ここでは取らない」(呼び出し側が候補を増やす)
    break;
  }

  return { out, recent, usedPost, rest: candidates };
}

// --------------------
// minimal helpers
// --------------------
function uniqById(posts: PostRow[]) {
  const out: PostRow[] = [];
  const seen = new Set<string>();
  for (const p of posts) {
    if (!p?.id) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

function pickDistinctUserIdsFromPosts(posts: PostRow[], k: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of posts) {
    const uid = p.user_id;
    if (!uid) continue;
    if (seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
    if (out.length >= k) break;
  }
  return out;
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);
  const cursor = toIsoOrNull(searchParams.get("cursor"));
  const seed = searchParams.get("seed") ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id ?? null;

  // --------------------
  // followCount を取得（ログインしている時だけ）
  // --------------------
  let followeeIds: string[] = [];
  if (meId) {
    const { data: follows } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", meId)
      .eq("status", "accepted");
    followeeIds = (follows ?? []).map((r: any) => r.followee_id).filter(Boolean);
  }
  const followCount = followeeIds.length;

  // --------------------
  // candidates を作る
  // - cold start: public posts
  // - followあり: base(rpc) + inject(public good posts)
  // --------------------
  const BUFFER = Math.max(120, limit * 12); // 候補バッファ
  const EXTRA_CYCLES = 2;

  // 共通: public post のSELECT（discover と揃える）
  const selectPublic = `
    id, content, user_id, created_at,
    image_urls, image_variants, image_assets,
    cover_square_url, cover_full_url, cover_pin_url,
    place_name, place_address, place_id,
    recommend_score, price_yen, price_range,
    profiles!inner ( id, display_name, avatar_url, is_public )
  `;

  // RPC行→PostRow
  const toPostRowFromRpc = (r: any): PostRow => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    content: r.content ?? null,

    place_id: r.place_id ?? null,
    place_name: r.place_name ?? null,
    place_address: r.place_address ?? null,

    image_urls: (r.image_urls ?? null) as any,
    image_variants: (r.image_variants ?? null) as any,
    image_assets: null,

    cover_square_url: null,
    cover_full_url: null,
    cover_pin_url: null,

    recommend_score: r.recommend_score ?? null,
    price_yen: r.price_yen ?? null,
    price_range: r.price_range ?? null,

    profile: {
      id: r.user_id,
      display_name: r.author_display_name ?? null,
      avatar_url: r.author_avatar_url ?? null,
      is_public: r.author_is_public ?? true,
    },

    likeCount: r.like_count ?? 0,
    likedByMe: r.liked_by_me ?? false,
    initialLikers: r.initial_likers ?? [],
  });

  // DB行→PostRow（public query）
  const toPostRowFromPublic = (r: any): PostRow => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    content: r.content ?? null,

    image_urls: r.image_urls ?? null,
    image_variants: r.image_variants ?? null,
    image_assets: r.image_assets ?? null,

    cover_square_url: r.cover_square_url ?? null,
    cover_full_url: r.cover_full_url ?? null,
    cover_pin_url: r.cover_pin_url ?? null,

    place_id: r.place_id ?? null,
    place_name: r.place_name ?? null,
    place_address: r.place_address ?? null,

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

    // 高速化優先：likeまわりは0初期でOK（UI側で後から取るならそれで）
    likeCount: r.likeCount ?? 0,
    likedByMe: false,
    initialLikers: [],
  });

  // fetch public posts (cursor対応)
  const fetchPublicPosts = async (args: {
    limit: number;
    cursor: string | null;
    excludeUserIds?: string[];
    minRecommend?: number | null;
  }) => {
    let q = supabase
      .from("posts")
      .select(selectPublic)
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false })
      .limit(args.limit);

    if (args.cursor) q = q.lt("created_at", args.cursor);
    if (args.excludeUserIds?.length) {
      // not in (...) は少し癖があるので、まず自分だけはneqで落とし、残りは文字列inで落とす
      const ids = args.excludeUserIds.filter(Boolean);
      if (ids.length === 1) q = q.neq("user_id", ids[0]);
      if (ids.length >= 2) q = q.not("user_id", "in", `(${ids.map((x) => `"${x}"`).join(",")})`);
    }
    if (typeof args.minRecommend === "number") q = q.gte("recommend_score", args.minRecommend);

    const { data, error } = await q;
    if (error) return { rows: [] as any[], error: error.message };
    return { rows: (data ?? []) as any[], error: null as string | null };
  };

  // --------------------
  // build candidates + diversify
  // --------------------
  let meta: TimelineMeta | null = null;

  // cold start mode（未ログイン OR フォロー0）
  const coldStart = !meId || followCount === 0;

  // まず候補
  let candidates: PostRow[] = [];
  let nextCursor: string | null = null;

  // 候補の初期cursor（追加フェッチ用）
  let extraCursor: string | null = cursor;

  // 追加候補のフェッチ（不足したら使う）
  const appendMoreCandidates = async (cycle: number) => {
    // 代わり優先: (1) public posts all (2) recommend>=9 (3) 更に古い
    const exclude = meId ? [meId] : [];
    const base1 = await fetchPublicPosts({
      limit: BUFFER,
      cursor: extraCursor,
      excludeUserIds: exclude,
      minRecommend: null,
    });
    const rows1 = base1.rows.map(toPostRowFromPublic);

    // 追加の質担保候補（recommend>=9）
    const base2 = await fetchPublicPosts({
      limit: Math.min(120, BUFFER),
      cursor: extraCursor,
      excludeUserIds: exclude,
      minRecommend: 9,
    });
    const rows2 = base2.rows.map((p) => {
      const r = toPostRowFromPublic(p as any);
      return r;
    });

    const merged = uniqById([...rows1, ...rows2]);
    candidates.push(...merged);

    // 次の追加フェッチのために cursor を進める
    const last = merged.length ? merged[merged.length - 1].created_at : null;
    if (last) extraCursor = last;

    // nextCursor は「返した最後のcreated_at」を後で決めるので、ここでは触らない
    return;
  };

  if (coldStart) {
    // 未ログイン or フォロー0: public posts
    await appendMoreCandidates(0);

    // 4枚制約で選ぶ（足りなければ追加フェッチ）
    let picked: PostRow[] = [];
    for (let cycle = 0; cycle <= EXTRA_CYCLES; cycle++) {
      const { out } = diversifyWindow(candidates, limit, { window: 4 });
      picked = out;

      if (picked.length >= limit) break;
      await appendMoreCandidates(cycle + 1);
    }

    // meta（SuggestFollowCard）: 常に出す（投稿が0でも出せる）
    // user候補は picked から distinct に抜く
    const suggestUserIds = pickDistinctUserIdsFromPosts(picked.length ? picked : candidates, 8);
    if (suggestUserIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", suggestUserIds.slice(0, 8));
      const users: SuggestUser[] = (profs ?? []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        mode: "follow",
        subtitle: "おすすめ",
      }));
      meta = {
        suggestOnce: true,
        suggestAtIndex: 1,
        suggestion: {
          title: "気になる人をフォローしてみましょう",
          subtitle: "まずはおすすめのユーザーから",
          users,
        },
      };
    }

    // 足りないなら「代わり枠」：suggest card で埋める（投稿はこれ以上無理なら無理）
    const posts = picked;

    nextCursor = posts.length ? posts[posts.length - 1].created_at : (extraCursor ?? cursor ?? null);
    return NextResponse.json({ posts, nextCursor, meta }, { status: 200 });
  }

  // --------------------
  // followあり: base(rpc) + inject(public good posts)
  // --------------------
  // base: rpc（自分+フォロー）
  const { data: baseData } = await supabase.rpc("timeline_friends_v1", {
    p_limit: Math.min(80, limit * 6),
    p_cursor: cursor,
  });

  const baseRows = ((baseData ?? []) as any[]).map(toPostRowFromRpc);

  // inject candidates: public good posts (recommend>=9) excluding visible ids
  const visibleIds = Array.from(new Set([meId!, ...followeeIds]));
  const injectFetch = await fetchPublicPosts({
    limit: Math.max(120, limit * 10),
    cursor,
    excludeUserIds: visibleIds,
    minRecommend: 9,
  });
  const injectRows = injectFetch.rows.map(toPostRowFromPublic);

  // inject のラベル付け（軽量）
  const injectDecorated: PostRow[] = injectRows.map((p) => ({
    ...p,
    injected: true,
    inject_reason: "おすすめの投稿",
    inject_follow_mode: "follow",
    inject_target_user_id: p.user_id,
  }));

  // meta（フォロー0/1で強めに出す。ここは followCount>=1 だけど <=1 の時に出す）
  if (followCount <= 1) {
    const suggestUserIds = pickDistinctUserIdsFromPosts(injectDecorated, 8);
    if (suggestUserIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", suggestUserIds.slice(0, 8));
      const users: SuggestUser[] = (profs ?? []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        mode: "follow",
        subtitle: "おすすめ",
      }));
      meta = {
        suggestOnce: true,
        suggestAtIndex: 1,
        suggestion: {
          title: "この人たちも良さそう",
          subtitle: "つながりが広がりそうなユーザー",
          users,
        },
      };
    }
  }

  // 混ぜる（時系列厳密不要なので、base優先 + injectを適度に散らす）
  // まず candidates に入れる順序：新しい順ベースにしたいので base + inject を混ぜる
  // inject比率は 25% くらいで十分（でも diversity が最優先なので後段で効く）
  const mixed: PostRow[] = [];
  const injectEvery = 3 + ((seed.length + (cursor?.length ?? 0)) % 3); // 3..5
  let bi = 0, ii = 0;

  while (mixed.length < Math.max(BUFFER, limit * 10) && (bi < baseRows.length || ii < injectDecorated.length)) {
    // base 1つ
    if (bi < baseRows.length) mixed.push(baseRows[bi++]);
    // inject を 3〜5に1回
    if (mixed.length % injectEvery === 0 && ii < injectDecorated.length) mixed.push(injectDecorated[ii++]);
    // 余ってるならinjectも少し
    if (ii < injectDecorated.length && mixed.length % 7 === 0) mixed.push(injectDecorated[ii++]);
  }

  candidates = uniqById(mixed);

  // 4枚制約で pick（不足したら inject を追加で足す / 古い public を足す）
  let picked: PostRow[] = [];
  extraCursor = cursor;

  for (let cycle = 0; cycle <= EXTRA_CYCLES; cycle++) {
    const { out } = diversifyWindow(candidates, limit, { window: 4 });
    picked = out;
    if (picked.length >= limit) break;

    // 追加候補：古い public を掘る（recommend>=9も混ぜる）
    // ※visibleIds除外のまま
    const more1 = await fetchPublicPosts({
      limit: BUFFER,
      cursor: extraCursor,
      excludeUserIds: visibleIds,
      minRecommend: null,
    });
    const more2 = await fetchPublicPosts({
      limit: Math.min(120, BUFFER),
      cursor: extraCursor,
      excludeUserIds: visibleIds,
      minRecommend: 9,
    });

    const more = uniqById([
      ...more1.rows.map(toPostRowFromPublic),
      ...more2.rows.map((r: any) => ({
        ...toPostRowFromPublic(r),
        injected: true,
        inject_reason: "おすすめの投稿",
        inject_follow_mode: "follow",
        inject_target_user_id: (r as any).user_id,
      })),
    ]);

    candidates.push(...more);

    const last = more.length ? more[more.length - 1].created_at : null;
    if (last) extraCursor = last;
  }

  nextCursor = picked.length ? picked[picked.length - 1].created_at : (extraCursor ?? cursor ?? null);

  return NextResponse.json({ posts: picked, nextCursor, meta }, { status: 200 });
}
