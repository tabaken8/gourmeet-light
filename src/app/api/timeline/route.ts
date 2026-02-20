// // app/api/timeline/route.ts
// import { NextResponse } from "next/server";
// import { createClient } from "@/lib/supabase/server";
// import { getPlacePhotoRefs } from "@/lib/google/getPlacePhotoRefs";
// import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

// function json(data: any, status = 200) {
//   return NextResponse.json(data, { status });
// }

// type PlacePhotos = { refs: string[]; attributionsHtml: string };

// async function buildPlacePhotoMap(placeIds: string[], perPlace = 6) {
//   const uniq = Array.from(new Set(placeIds)).filter(Boolean);
//   const limited = uniq.slice(0, 10);

//   const map: Record<string, PlacePhotos> = {};
//   await Promise.all(
//     limited.map(async (pid) => {
//       try {
//         map[pid] = await getPlacePhotoRefs(pid, perPlace);
//       } catch (e) {
//         console.error("[getPlacePhotoRefs failed]", pid, e);
//         map[pid] = { refs: [], attributionsHtml: "" };
//       }
//     })
//   );
//   return map;
// }

// function countByPostId(rows: any[]) {
//   return rows.reduce((m: Record<string, number>, r: any) => {
//     m[r.post_id] = (m[r.post_id] ?? 0) + 1;
//     return m;
//   }, {});
// }

// function getAdminClient() {
//   const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
//   const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
//   if (!url || !serviceKey) return null;

//   return createSupabaseAdmin(url, serviceKey, {
//     auth: { persistSession: false, autoRefreshToken: false },
//   });
// }

// function hashString(s: string): number {
//   let h = 2166136261;
//   for (let i = 0; i < s.length; i++) {
//     h ^= s.charCodeAt(i);
//     h = Math.imul(h, 16777619);
//   }
//   return h >>> 0;
// }

// function rand01(seed: string) {
//   // seed → 0..1
//   return (hashString(seed) % 10_000) / 10_000;
// }

// function decideInjectEvery(seedKey: string) {
//   // 3〜5投稿に1つ（seedで決定）
//   const r = hashString(seedKey) % 3; // 0,1,2
//   return 3 + r; // 3..5
// }

// type SuggestKind = "follow_back" | "friend_follows" | "global";

// function scoreCandidate(params: {
//   seed: string;
//   postId: string;
//   created_at: string;
//   recommend_score: number | null;
//   likeCount: number;
//   kind: SuggestKind;
// }) {
//   const now = Date.now();
//   const t = Date.parse(params.created_at);
//   const ageHours = Number.isFinite(t) ? (now - t) / 36e5 : 1e6;

//   // 新しいほど高い（72hくらいで減衰）
//   const recency = Math.exp(-Math.max(0, ageHours) / 72);

//   // recommend_score は >=9 前提、9→0.9, 10→1.0 に正規化
//   const rec = params.recommend_score == null ? 0.9 : Math.min(1, Math.max(0, params.recommend_score / 10));

//   // like >=1 前提。likeが多いほどほんの少し上げる（暴れないようにログ）
//   const likeBoost = Math.min(0.15, Math.log1p(Math.max(0, params.likeCount)) * 0.05);

//   // A/Bを強く優先（ただし「全体候補」も混ざる）
//   const kindBoost =
//     params.kind === "follow_back" ? 0.45 :
//     params.kind === "friend_follows" ? 0.30 :
//     0.05;

//   // リロードごとに変わる揺らぎ（seed依存）
//   const jitter = rand01(`${params.seed}:j:${params.postId}`) * 0.04;

//   // 重み（適当に強いが壊れないバランス）
//   return 0.52 * recency + 0.28 * rec + 0.20 * kindBoost + likeBoost + jitter;
// }

// export async function GET(req: Request) {
//   const supabase = await createClient();
//   const admin = getAdminClient();

//   const { data: auth } = await supabase.auth.getUser();
//   const user = auth.user;

//   const url = new URL(req.url);
//   const tab = url.searchParams.get("tab") === "friends" ? "friends" : "discover";
//   const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 30);
//   const cursor = url.searchParams.get("cursor"); // created_at cursor

//   // ✅ リロードごとに変わる seed（クライアントが渡せばそれを採用）
//   const reqSeed = url.searchParams.get("seed") ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

//   if (tab === "friends" && !user) {
//     return json({ error: "Unauthorized" }, 401);
//   }

//   // ✅ places を join してジャンルを返す（AlbumBrowser と揃える）
//   const placesSelect = "place_id, name, address, primary_genre, area_label_ja, search_text";

//   const postSelect =
//     "id, content, user_id, created_at," +
//     " image_urls, image_variants, image_assets," +
//     " cover_square_url, cover_full_url, cover_pin_url," +
//     " place_name, place_address, place_id," +
//     " recommend_score, price_yen, price_range," +
//     ` places:places (${placesSelect})`;

//   // ---------------- discover（未ログインOK） ----------------
//   if (tab === "discover") {
//     let q = supabase
//       .from("posts")
//       .select(`${postSelect}, profiles!inner ( id, display_name, avatar_url, is_public )`)
//       .eq("profiles.is_public", true)
//       .order("created_at", { ascending: false })
//       .limit(limit);

//     if (user?.id) q = q.neq("user_id", user.id);
//     if (cursor) q = q.lt("created_at", cursor);

//     const { data: rows, error } = await q;
//     if (error) return json({ error: error.message }, 500);

//     const raw = (rows ?? []) as any[];

//     const postIds = raw.map((r) => r.id);
//     let likeCountMap: Record<string, number> = {};
//     let likedSet = new Set<string>();
//     let likersMap: Record<string, any[]> = {};

//     if (postIds.length) {
//       const { data: likesAll } = await supabase
//         .from("post_likes")
//         .select("post_id, user_id, created_at")
//         .in("post_id", postIds)
//         .order("created_at", { ascending: false });

//       likeCountMap = countByPostId(likesAll ?? []);

//       const byPost: Record<string, any[]> = {};
//       for (const r of likesAll ?? []) {
//         const pid = (r as any).post_id;
//         if (!pid) continue;
//         if (!byPost[pid]) byPost[pid] = [];
//         if (byPost[pid].length < 3) byPost[pid].push(r);
//       }
//       likersMap = byPost;

//       if (user) {
//         const { data: myLikes } = await supabase
//           .from("post_likes")
//           .select("post_id")
//           .eq("user_id", user.id)
//           .in("post_id", postIds);
//         likedSet = new Set((myLikes ?? []).map((r: any) => r.post_id));
//       }
//     }

//     const likerIds = Array.from(
//       new Set(
//         Object.values(likersMap)
//           .flat()
//           .map((r: any) => r.user_id)
//           .filter(Boolean)
//       )
//     );
//     const likerProfMap: Record<string, any> = {};
//     if (likerIds.length) {
//       const { data: lprofs } = await supabase
//         .from("profiles")
//         .select("id, display_name, avatar_url")
//         .in("id", likerIds);
//       for (const p of lprofs ?? []) likerProfMap[(p as any).id] = p;
//     }

//     const placeIds = raw.map((r) => r.place_id).filter(Boolean);
//     const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

//     const posts = raw.map((r) => {
//       const initialLikers = (likersMap[r.id] ?? [])
//         .map((x: any) => likerProfMap[x.user_id])
//         .filter(Boolean)
//         .map((p: any) => ({
//           id: p.id,
//           display_name: p.display_name,
//           avatar_url: p.avatar_url,
//         }));

//       return {
//         id: r.id,
//         content: r.content,
//         user_id: r.user_id,
//         created_at: r.created_at,

//         image_urls: r.image_urls ?? null,
//         image_variants: r.image_variants ?? null,
//         image_assets: r.image_assets ?? null,

//         cover_square_url: r.cover_square_url ?? null,
//         cover_full_url: r.cover_full_url ?? null,
//         cover_pin_url: r.cover_pin_url ?? null,

//         place_name: r.place_name,
//         place_address: r.place_address,
//         place_id: r.place_id,
//         places: r.places ?? null,

//         recommend_score: r.recommend_score ?? null,
//         price_yen: r.price_yen ?? null,
//         price_range: r.price_range ?? null,

//         profile: r.profiles
//           ? {
//               id: r.profiles.id,
//               display_name: r.profiles.display_name,
//               avatar_url: r.profiles.avatar_url,
//               is_public: r.profiles.is_public,
//             }
//           : null,

//         placePhotos: r.place_id ? placePhotoMap[r.place_id] ?? null : null,

//         likeCount: likeCountMap[r.id] ?? 0,
//         likedByMe: user ? likedSet.has(r.id) : false,
//         initialLikers,
//       };
//     });

//     const nextCursor = raw.length ? raw[raw.length - 1].created_at : null;
//     return json({ posts, nextCursor });
//   }

//   // ---------------- friends（ログイン必須 / “最新”タブの中身） ----------------

//   // 1) 自分がフォローしてる人
//   const { data: follows, error: fErr } = await supabase
//     .from("follows")
//     .select("followee_id")
//     .eq("follower_id", user!.id)
//     .eq("status", "accepted");

//   if (fErr) return json({ error: fErr.message }, 500);

//   const followeeIds = (follows ?? []).map((x: any) => x.followee_id).filter(Boolean);
//   const followingSet = new Set<string>(followeeIds);
//   const visibleUserIds = Array.from(new Set([user!.id, ...followeeIds]));

//   // 2) ベース投稿（自分＋フォロー中）
//   let pq = supabase
//     .from("posts")
//     .select(postSelect)
//     .in("user_id", visibleUserIds)
//     .order("created_at", { ascending: false })
//     .limit(limit * 3); // 混入/フィルタのため多め

//   if (cursor) pq = pq.lt("created_at", cursor);

//   const { data: postRows, error: pErr } = await pq;
//   if (pErr) return json({ error: pErr.message }, 500);

//   const baseRaw = (postRows ?? []) as any[];

//   // ---------------- 未フォロー候補ユーザー(A/B) ----------------
//   // (A) フォローバック候補：相手->自分 はaccepted、 自分->相手 はない
//   const { data: incoming } = await supabase
//     .from("follows")
//     .select("follower_id")
//     .eq("followee_id", user!.id)
//     .eq("status", "accepted")
//     .limit(500);

//   const incomingIds = Array.from(
//     new Set((incoming ?? []).map((r: any) => r.follower_id).filter(Boolean))
//   ).filter((uid) => uid !== user!.id && !followingSet.has(uid));

//   // (B) 友達がフォロー： friend -> target（target は未フォロー）
//   let friendFollowTargets: { target: string; recommendedBy: string[] }[] = [];
//   if (followeeIds.length) {
//     const { data: ff } = await supabase
//       .from("follows")
//       .select("follower_id, followee_id")
//       .in("follower_id", followeeIds.slice(0, 80))
//       .eq("status", "accepted")
//       .limit(1500);

//     const m = new Map<string, Set<string>>(); // target -> recommenders
//     for (const r of ff ?? []) {
//       const fid = (r as any).follower_id as string | null;
//       const tid = (r as any).followee_id as string | null;
//       if (!fid || !tid) continue;
//       if (tid === user!.id) continue;
//       if (followingSet.has(tid)) continue; // 既に自分がフォロー
//       if (visibleUserIds.includes(tid)) continue; // ベースに含まれる
//       if (!m.has(tid)) m.set(tid, new Set());
//       m.get(tid)!.add(fid);
//     }
//     friendFollowTargets = Array.from(m.entries()).map(([target, set]) => ({
//       target,
//       recommendedBy: Array.from(set).slice(0, 2),
//     }));
//   }

//   const kindByUser: Record<string, SuggestKind> = {};
//   const recommendedByMap: Record<string, string[]> = {};

//   for (const uid of incomingIds) kindByUser[uid] = "follow_back";
//   for (const x of friendFollowTargets) {
//     if (!kindByUser[x.target]) kindByUser[x.target] = "friend_follows";
//     recommendedByMap[x.target] = x.recommendedBy;
//   }

//   // ---------------- 全未フォロー投稿を候補に（public only） ----------------
//   // 条件：recommend_score >= 9（like>=1は後で集計してフィルタ）
//   let cq = supabase
//     .from("posts")
//     .select(`${postSelect}, profiles!inner ( id, display_name, avatar_url, is_public )`)
//     .eq("profiles.is_public", true)
//     .not("user_id", "in", `(${visibleUserIds.map((x) => `"${x}"`).join(",")})`)
//     .gte("recommend_score", 9)
//     .order("created_at", { ascending: false })
//     .limit(Math.max(80, limit * 8));

//   if (cursor) cq = cq.lt("created_at", cursor);

//   const { data: candRows, error: cErr } = await cq;
//   if (cErr) return json({ error: cErr.message }, 500);

//   const candRaw = (candRows ?? []) as any[];

//   // ---------------- Like集計（ベース＋候補） ----------------
//   const allPostIds = Array.from(new Set([...baseRaw, ...candRaw].map((p) => p.id).filter(Boolean)));

//   let likeCountMap: Record<string, number> = {};
//   let likedSet = new Set<string>();
//   let likersMap: Record<string, any[]> = {};

//   if (allPostIds.length) {
//     const { data: likesAll } = await supabase
//       .from("post_likes")
//       .select("post_id, user_id, created_at")
//       .in("post_id", allPostIds)
//       .order("created_at", { ascending: false });

//     likeCountMap = countByPostId(likesAll ?? []);

//     const byPost: Record<string, any[]> = {};
//     for (const r of likesAll ?? []) {
//       const pid = (r as any).post_id;
//       if (!pid) continue;
//       if (!byPost[pid]) byPost[pid] = [];
//       if (byPost[pid].length < 3) byPost[pid].push(r);
//     }
//     likersMap = byPost;

//     const { data: myLikes } = await supabase
//       .from("post_likes")
//       .select("post_id")
//       .eq("user_id", user!.id)
//       .in("post_id", allPostIds);

//     likedSet = new Set((myLikes ?? []).map((r: any) => r.post_id));
//   }

//   // likers profile
//   const likerIds = Array.from(
//     new Set(
//       Object.values(likersMap)
//         .flat()
//         .map((r: any) => r.user_id)
//         .filter(Boolean)
//     )
//   );
//   const likerProfMap: Record<string, any> = {};
//   if (likerIds.length) {
//     const { data: lprofs } = await supabase
//       .from("profiles")
//       .select("id, display_name, avatar_url")
//       .in("id", likerIds);
//     for (const p of lprofs ?? []) likerProfMap[(p as any).id] = p;
//   }

//   // profiles（ベース＋候補＋recommendedBy）
//   const userIds = Array.from(
//     new Set(
//       [
//         ...baseRaw.map((p) => p.user_id),
//         ...candRaw.map((p) => p.user_id),
//         ...Object.values(recommendedByMap).flat(),
//       ].filter(Boolean)
//     )
//   );

//   const { data: profs, error: prErr } = await supabase
//     .from("profiles")
//     .select("id, display_name, avatar_url, is_public")
//     .in("id", userIds);

//   if (prErr) return json({ error: prErr.message }, 500);

//   const profMap: Record<string, any> = {};
//   for (const p of profs ?? []) profMap[(p as any).id] = p;

//   // Place写真（ベース＋候補）
//   const placeIds = [...baseRaw, ...candRaw].map((p) => p.place_id).filter(Boolean);
//   const placePhotoMap = await buildPlacePhotoMap(placeIds, 6);

//   // decorate（共通）
//   function decorate(p: any) {
//     const initialLikers = (likersMap[p.id] ?? [])
//       .map((x: any) => likerProfMap[x.user_id])
//       .filter(Boolean)
//       .map((pp: any) => ({
//         id: pp.id,
//         display_name: pp.display_name,
//         avatar_url: pp.avatar_url,
//       }));

//     const author = profMap[p.user_id] ?? p.profiles ?? null;

//     return {
//       id: p.id,
//       content: p.content,
//       user_id: p.user_id,
//       created_at: p.created_at,

//       image_urls: p.image_urls ?? null,
//       image_variants: p.image_variants ?? null,
//       image_assets: p.image_assets ?? null,

//       cover_square_url: p.cover_square_url ?? null,
//       cover_full_url: p.cover_full_url ?? null,
//       cover_pin_url: p.cover_pin_url ?? null,

//       place_name: p.place_name,
//       place_address: p.place_address,
//       place_id: p.place_id,
//       places: p.places ?? null,

//       recommend_score: p.recommend_score ?? null,
//       price_yen: p.price_yen ?? null,
//       price_range: p.price_range ?? null,

//       profile: author
//         ? {
//             id: author.id,
//             display_name: author.display_name,
//             avatar_url: author.avatar_url,
//             is_public: author.is_public ?? true,
//           }
//         : null,

//       placePhotos: p.place_id ? placePhotoMap[p.place_id] ?? null : null,

//       likeCount: likeCountMap[p.id] ?? 0,
//       likedByMe: likedSet.has(p.id),
//       initialLikers,
//     };
//   }

//   const baseDecorated = baseRaw.map(decorate);

//   // ✅ 候補投稿を “like>=1” でフィルタし、A/B を優先スコア化してキュー化
//   const candDecorated = candRaw.map(decorate);

//   const suggestCandidates = candDecorated
//     .filter((p: any) => {
//       // 未フォローのみ（念のため）
//       if (!p?.user_id) return false;
//       if (visibleUserIds.includes(p.user_id)) return false;
//       if (followingSet.has(p.user_id)) return false;
//       // 条件：recommend>=9 & like>=1
//       const rec = typeof p.recommend_score === "number" ? p.recommend_score : null;
//       if (rec == null || rec < 9) return false;
//       if ((p.likeCount ?? 0) < 1) return false;
//       // public作者だけ（念のため）
//       if (p.profile && p.profile.is_public === false) return false;
//       return true;
//     })
//     .map((p: any) => {
//       const kind: SuggestKind =
//         kindByUser[p.user_id] ?? "global";
//       const score = scoreCandidate({
//         seed: reqSeed,
//         postId: p.id,
//         created_at: p.created_at,
//         recommend_score: p.recommend_score ?? null,
//         likeCount: p.likeCount ?? 0,
//         kind,
//       });
//       return { p, kind, score };
//     })
//     .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

//   // “リロードごとにランダム”：上位を軽くシャッフル（seed依存）
//   const topK = suggestCandidates.slice(0, 60);
//   topK.sort((a, b) => rand01(`${reqSeed}:shuffle:${a.p.id}`) - rand01(`${reqSeed}:shuffle:${b.p.id}`));

//   const suggestQueue = topK.slice(0, 30).map(({ p, kind }) => {
//     const inject_reason =
//       kind === "follow_back"
//         ? "あなたをフォローしています"
//         : kind === "friend_follows"
//         ? "友達がフォロー"
//         : "おすすめの投稿";

//     const inject_follow_mode =
//       kind === "follow_back" ? "followback" : "follow";

//     return {
//       ...p,
//       injected: true,
//       inject_reason,
//       inject_follow_mode,
//       inject_target_user_id: p.user_id,
//     };
//   });

//   // ✅ 0/1フォローのときは「2枚目にサジェストUI」
//   // meta は TimelineFeed が reset の時にだけ採用する実装なのでOK
//   let meta: any = null;
//   const followCount = followeeIds.length;

//   if (followCount <= 1) {
//     // サジェストに出すユーザー：A/B優先（なければ上位候補の作者）
//     const suggestUserIds: string[] = [];

//     // A優先
//     for (const uid of incomingIds.slice(0, 6)) suggestUserIds.push(uid);

//     // B次点
//     for (const x of friendFollowTargets.slice(0, 10)) {
//       if (suggestUserIds.length >= 8) break;
//       if (!suggestUserIds.includes(x.target)) suggestUserIds.push(x.target);
//     }

//     // それでも足りなければ、候補投稿の作者から補完
//     for (const x of suggestCandidates.slice(0, 30)) {
//       if (suggestUserIds.length >= 8) break;
//       const uid = x.p.user_id;
//       if (!uid) continue;
//       if (suggestUserIds.includes(uid)) continue;
//       if (followingSet.has(uid)) continue;
//       suggestUserIds.push(uid);
//     }

//     const { data: sProfs } = await supabase
//       .from("profiles")
//       .select("id, display_name, avatar_url")
//       .in("id", suggestUserIds.slice(0, 8));

//     const sMap: Record<string, any> = {};
//     for (const p of sProfs ?? []) sMap[(p as any).id] = p;

//     const users = suggestUserIds
//       .slice(0, 8)
//       .map((id) => sMap[id])
//       .filter(Boolean)
//       .map((p: any) => {
//         const kind = kindByUser[p.id] ?? "global";
//         return {
//           id: p.id,
//           display_name: p.display_name,
//           avatar_url: p.avatar_url,
//           // ✅ TimelineFeed 側の注入ボタン仕様に合わせた情報（SuggestFollowCardが使う前提）
//           mode: kind === "follow_back" ? "followback" : "follow",
//           subtitle:
//             kind === "follow_back"
//               ? "あなたをフォロー中"
//               : kind === "friend_follows"
//               ? "友達がフォロー"
//               : "おすすめ",
//         };
//       });

//     meta = {
//       suggestOnce: true,
//       suggestAtIndex: 1, // 2枚目（0-based）
//       suggestion: {
//         title: followCount === 0 ? "気になる人をフォローしてみましょう" : "この人たちも良さそう",
//         subtitle: followCount === 0 ? "おすすめのユーザーを表示しています" : "フォロー中の人のつながりから提案",
//         users,
//       },
//     };
//   }

//   // ------------- 混ぜる（上に未フォロー30%） -------------
//   const injectEvery = decideInjectEvery(`${user!.id}:${cursor ?? "first"}:${reqSeed}`);

//   const out: any[] = [];
//   const usedPost = new Set<string>();

//   // ✅ 30%で一番上に未フォローを入れる（入れられる時だけ）
//   const topInjectChance = 0.30;
//   const canTopInject = suggestQueue.length > 0;
//   const doTopInject = canTopInject && rand01(`${reqSeed}:topInject`) < topInjectChance;

//   if (doTopInject && out.length < limit) {
//     const s = suggestQueue.shift()!;
//     if (!usedPost.has(s.id)) {
//       out.push(s);
//       usedPost.add(s.id);
//     }
//   }

//   // ベースを詰めつつ、3〜5に1回 inject
//   let i = 0;
//   for (const p of baseDecorated) {
//     if (out.length >= limit) break;

//     // inject（2つ目以降も混ぜる）
//     if (suggestQueue.length > 0 && i > 0 && i % injectEvery === 0 && out.length < limit) {
//       const s = suggestQueue.shift()!;
//       if (!usedPost.has(s.id)) {
//         out.push(s);
//         usedPost.add(s.id);
//       }
//     }

//     if (!usedPost.has(p.id)) {
//       out.push(p);
//       usedPost.add(p.id);
//       i++;
//     }
//   }

//   // 足りないなら inject で埋める（ベースが少ない時）
//   while (out.length < limit && suggestQueue.length > 0) {
//     const s = suggestQueue.shift()!;
//     if (usedPost.has(s.id)) continue;
//     out.push(s);
//     usedPost.add(s.id);
//   }

//   // ✅ 1ページ内のキー重複が出るのを防ぐ（念のため最後にユニーク化）
//   const uniqOut: any[] = [];
//   const seen = new Set<string>();
//   for (const p of out) {
//     if (!p?.id) continue;
//     if (seen.has(p.id)) continue;
//     seen.add(p.id);
//     uniqOut.push(p);
//   }

//   const nextCursor = uniqOut.length ? uniqOut[uniqOut.length - 1].created_at : null;
//   return json({ posts: uniqOut, nextCursor, meta });
// }
