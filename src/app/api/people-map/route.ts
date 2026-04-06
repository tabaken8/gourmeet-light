// src/app/api/people-map/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PersonMapItem = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  post_count: number;
  avg_score: number;
  centroid_lat: number;
  centroid_lng: number;
  /** All post locations (outliers removed) with place info */
  post_latlngs: { lat: number; lng: number; place_name: string; image_url: string | null; recommend_score: number | null }[];
  /** Bounding box of post_latlngs for fitBounds */
  bounds: { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } } | null;
  /** Top 2 posts by recommend_score for card display */
  top_posts: {
    place_name: string;
    image_url: string | null;
    recommend_score: number | null;
    created_at: string;
  }[];
  top_genre: string | null;
  area_name: string | null;
  is_following: boolean;
  /** For not-following: why they appear (e.g. "しょうご, りーさぬ がフォロー中") */
  mutual_context: string | null;
};

export type PeopleMapResponse = {
  people: PersonMapItem[];
  /** Current user's specialty centroid for initial map view (null → default to Tokyo) */
  my_centroid: { lat: number; lng: number } | null;
};

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Guest: return public users ──
  if (!user) {
    return handleGuestPeopleMap(supabase);
  }

  // ──────────────────────────────────────────────
  // 1. Get my followee IDs + my own posts (for centroid)
  // ──────────────────────────────────────────────
  const [followsRes, myPostsRes] = await Promise.all([
    supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .eq("status", "accepted"),
    supabase
      .from("posts")
      .select("place_id")
      .eq("user_id", user.id)
      .limit(500),
  ]);

  if (followsRes.error) return NextResponse.json({ error: followsRes.error.message }, { status: 500 });

  const followeeIds = (followsRes.data ?? []).map((f: any) => f.followee_id);
  const followeeSet = new Set(followeeIds);

  // ──────────────────────────────────────────────
  // 2. Compute my centroid from my own posts
  // ──────────────────────────────────────────────
  const myPlaceIds = [...new Set((myPostsRes.data ?? []).map((p: any) => p.place_id).filter(Boolean))];
  let myCentroid: { lat: number; lng: number } | null = null;

  if (myPlaceIds.length > 0) {
    const myLats: number[] = [];
    const myLngs: number[] = [];
    for (let i = 0; i < myPlaceIds.length; i += 200) {
      const chunk = myPlaceIds.slice(i, i + 200);
      const { data: places } = await supabase
        .from("places")
        .select("place_id, lat, lng")
        .in("place_id", chunk);
      if (places) {
        for (const p of places) {
          if (p.lat != null && p.lng != null) {
            myLats.push(p.lat);
            myLngs.push(p.lng);
          }
        }
      }
    }
    if (myLats.length > 0) {
      myCentroid = computeDensestClusterCenter(myLats, myLngs);
    }
  }

  // ──────────────────────────────────────────────
  // 3. Get 2-hop users (followees' followees I don't follow)
  // ──────────────────────────────────────────────
  let twoHopFollows: { follower_id: string; followee_id: string }[] = [];
  if (followeeIds.length > 0) {
    // Batch followee IDs
    for (let i = 0; i < followeeIds.length; i += 100) {
      const chunk = followeeIds.slice(i, i + 100);
      const { data } = await supabase
        .from("follows")
        .select("follower_id, followee_id")
        .in("follower_id", chunk)
        .eq("status", "accepted");
      if (data) twoHopFollows.push(...data);
    }
  }

  // Count how many of my followees follow each 2-hop user
  const twoHopCounts = new Map<string, { count: number; via: string[] }>();
  const followeeProfileCache = new Map<string, string>(); // userId → display_name

  for (const f of twoHopFollows) {
    if (f.followee_id === user.id) continue; // skip self
    if (followeeSet.has(f.followee_id)) continue; // already following
    const entry = twoHopCounts.get(f.followee_id) ?? { count: 0, via: [] };
    entry.count += 1;
    entry.via.push(f.follower_id);
    twoHopCounts.set(f.followee_id, entry);
  }

  // Take top 20 2-hop candidates (by mutual count)
  const twoHopCandidates = [...twoHopCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([uid, info]) => ({ userId: uid, mutualCount: info.count, viaIds: info.via.slice(0, 3) }));

  const twoHopIds = twoHopCandidates.map((c) => c.userId);

  // ──────────────────────────────────────────────
  // 4. Fetch all user data in parallel
  // ──────────────────────────────────────────────
  const allUserIds = [...new Set([...followeeIds, ...twoHopIds])];
  if (allUserIds.length === 0) {
    // No followees and no 2-hop candidates → show public users (same as guest)
    const guestRes = await handleGuestPeopleMap(supabase);
    const guestData = await guestRes.json();
    // Inject the user's own centroid
    return NextResponse.json({ ...guestData, my_centroid: myCentroid } satisfies PeopleMapResponse);
  }

  const [profilesRes, postsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, username")
      .in("id", allUserIds),
    supabase
      .from("posts")
      .select(`
        id, user_id, recommend_score, created_at,
        place_name, place_id, content, image_urls,
        image_assets, image_variants, cover_square_url
      `)
      .in("user_id", allUserIds)
      .order("created_at", { ascending: false })
      .limit(3000),
  ]);

  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  if (postsRes.error) return NextResponse.json({ error: postsRes.error.message }, { status: 500 });

  const profiles = profilesRes.data ?? [];
  const posts = postsRes.data ?? [];

  // ──────────────────────────────────────────────
  // 5. Resolve place coordinates
  // ──────────────────────────────────────────────
  const placeIds = [...new Set(posts.map((p: any) => p.place_id).filter(Boolean))];
  const placeMap = new Map<string, { lat: number; lng: number; genre: string | null; area: string | null }>();

  for (let i = 0; i < placeIds.length; i += 200) {
    const chunk = placeIds.slice(i, i + 200);
    const { data: places } = await supabase
      .from("places")
      .select("place_id, lat, lng, primary_genre, area_label_ja")
      .in("place_id", chunk);
    if (places) {
      for (const p of places) {
        if (p.lat != null && p.lng != null) {
          placeMap.set(p.place_id, {
            lat: p.lat,
            lng: p.lng,
            genre: p.primary_genre ?? null,
            area: p.area_label_ja ?? null,
          });
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // 6. Group posts by user → compute aggregates
  // ──────────────────────────────────────────────
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

  type PostEntry = {
    lat: number;
    lng: number;
    place_name: string;
    recommend_score: number | null;
    image_url: string | null;
    created_at: string;
  };
  type UserGroup = {
    scores: number[];
    lats: number[];
    lngs: number[];
    genres: string[];
    areas: string[];
    allPosts: PostEntry[];
  };
  const userGroups = new Map<string, UserGroup>();

  for (const post of posts) {
    const place = post.place_id ? placeMap.get(post.place_id) : null;
    if (!place) continue;

    let group = userGroups.get(post.user_id);
    if (!group) {
      group = { scores: [], lats: [], lngs: [], genres: [], areas: [], allPosts: [] };
      userGroups.set(post.user_id, group);
    }

    group.lats.push(place.lat);
    group.lngs.push(place.lng);
    if (typeof post.recommend_score === "number") group.scores.push(post.recommend_score);
    if (place.genre) group.genres.push(place.genre);
    if (place.area) group.areas.push(place.area);

    const imageUrl = post.cover_square_url
      ?? post.image_assets?.[0]?.square
      ?? post.image_variants?.[0]?.thumb
      ?? (Array.isArray(post.image_urls) ? post.image_urls[0] : null);

    group.allPosts.push({
      lat: place.lat,
      lng: place.lng,
      place_name: post.place_name ?? "お店",
      recommend_score: post.recommend_score,
      image_url: imageUrl,
      created_at: post.created_at,
    });
  }

  // ──────────────────────────────────────────────
  // 7. Build PersonMapItems for both groups
  // ──────────────────────────────────────────────

  // Build mutual context strings for 2-hop users
  // Need display names for the "via" followees
  for (const prof of profiles) {
    if (prof.display_name) followeeProfileCache.set(prof.id, prof.display_name);
  }

  function buildItem(userId: string, isFollowing: boolean, mutualContext: string | null): PersonMapItem | null {
    const group = userGroups.get(userId);
    const profile = profileMap.get(userId);
    if (!profile || !group || group.lats.length === 0) return null;

    const centroid = computeDensestClusterCenter(group.lats, group.lngs);
    const avgScore = group.scores.length > 0
      ? Math.round((group.scores.reduce((a, b) => a + b, 0) / group.scores.length) * 10) / 10
      : 0;

    // Build post locations and remove outliers
    const filtered = removeOutliers(group.lats, group.lngs);
    // Build enriched post_latlngs by matching back to allPosts
    const filteredSet = new Set(filtered.lats.map((lat, i) => `${lat},${filtered.lngs[i]}`));
    const seenPlaces = new Set<string>();
    const postLatlngs: PersonMapItem["post_latlngs"] = [];
    for (const p of group.allPosts) {
      const key = `${p.lat},${p.lng}`;
      if (filteredSet.has(key) && !seenPlaces.has(key)) {
        seenPlaces.add(key);
        postLatlngs.push({ lat: p.lat, lng: p.lng, place_name: p.place_name, image_url: p.image_url, recommend_score: p.recommend_score });
      }
    }

    let bounds: PersonMapItem["bounds"] = null;
    if (postLatlngs.length > 0) {
      let swLat = Infinity, swLng = Infinity, neLat = -Infinity, neLng = -Infinity;
      for (const p of postLatlngs) {
        if (p.lat < swLat) swLat = p.lat;
        if (p.lng < swLng) swLng = p.lng;
        if (p.lat > neLat) neLat = p.lat;
        if (p.lng > neLng) neLng = p.lng;
      }
      bounds = { sw: { lat: swLat, lng: swLng }, ne: { lat: neLat, lng: neLng } };
    }

    // Pick top 2 posts by recommend_score (deduplicated by place)
    const topPosts = pickTopPosts(group.allPosts);

    return {
      user_id: userId,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      username: profile.username,
      post_count: group.lats.length,
      avg_score: avgScore,
      centroid_lat: centroid.lat,
      centroid_lng: centroid.lng,
      post_latlngs: postLatlngs,
      bounds,
      top_posts: topPosts,
      top_genre: mode(group.genres),
      area_name: mode(group.areas),
      is_following: isFollowing,
      mutual_context: mutualContext,
    };
  }

  // ── Following users ──
  const followingItems: PersonMapItem[] = [];
  for (const uid of followeeIds) {
    const item = buildItem(uid, true, null);
    if (item) followingItems.push(item);
  }

  // Rank following: common followers × geographic proximity to me
  followingItems.sort((a, b) => {
    // Primary: geographic proximity to me (if I have a centroid)
    if (myCentroid) {
      const distA = haversineKm(myCentroid.lat, myCentroid.lng, a.centroid_lat, a.centroid_lng);
      const distB = haversineKm(myCentroid.lat, myCentroid.lng, b.centroid_lat, b.centroid_lng);
      // Within 50km = "close", prefer those
      const closeA = distA < 50 ? 1 : 0;
      const closeB = distB < 50 ? 1 : 0;
      if (closeA !== closeB) return closeB - closeA;
    }
    // Secondary: post_count (activity)
    return b.post_count - a.post_count;
  });

  // ── Not-following (2-hop) users ──
  const notFollowingItems: PersonMapItem[] = [];
  for (const cand of twoHopCandidates) {
    const viaNames = cand.viaIds
      .map((id) => followeeProfileCache.get(id))
      .filter(Boolean)
      .slice(0, 2);
    const contextStr = viaNames.length > 0
      ? `${viaNames.join(", ")} がフォロー中`
      : null;

    const item = buildItem(cand.userId, false, contextStr);
    if (item) {
      // Attach mutualCount for sorting
      (item as any)._mutualCount = cand.mutualCount;
      notFollowingItems.push(item);
    }
  }

  // Rank not-following: k-hop mutual count → activity → geographic proximity
  notFollowingItems.sort((a, b) => {
    const mutA = (a as any)._mutualCount ?? 0;
    const mutB = (b as any)._mutualCount ?? 0;
    if (mutA !== mutB) return mutB - mutA;

    // Geographic proximity to me
    if (myCentroid) {
      const distA = haversineKm(myCentroid.lat, myCentroid.lng, a.centroid_lat, a.centroid_lng);
      const distB = haversineKm(myCentroid.lat, myCentroid.lng, b.centroid_lat, b.centroid_lng);
      if (Math.abs(distA - distB) > 30) return distA - distB;
    }

    return b.post_count - a.post_count;
  });

  // Clean up temp field
  for (const item of notFollowingItems) delete (item as any)._mutualCount;

  // ──────────────────────────────────────────────
  // 8. Interleave: 3 following, 1 not-following, 4 following, 1 not-following, ...
  // ──────────────────────────────────────────────
  const people: PersonMapItem[] = [];
  let fi = 0; // following index
  let ni = 0; // not-following index
  let batchSizes = [3, 4]; // alternating
  let batchIdx = 0;

  while (fi < followingItems.length || ni < notFollowingItems.length) {
    // Add a batch of following
    const batchSize = batchSizes[batchIdx % batchSizes.length];
    for (let k = 0; k < batchSize && fi < followingItems.length; k++) {
      people.push(followingItems[fi++]);
    }

    // Add 1 not-following
    if (ni < notFollowingItems.length) {
      people.push(notFollowingItems[ni++]);
    }

    batchIdx++;
  }

  return NextResponse.json({ people, my_centroid: myCentroid } satisfies PeopleMapResponse);
}

// ── Guest handler: show public users with posts ──

async function handleGuestPeopleMap(supabase: any) {
  // Fetch public profiles with recent activity
  const { data: publicProfiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, username, is_public")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(30);

  if (profErr || !publicProfiles || publicProfiles.length === 0) {
    return NextResponse.json({ people: [], my_centroid: null } satisfies PeopleMapResponse);
  }

  const allUserIds = publicProfiles.map((p: any) => p.id);

  // Fetch posts for these users
  const { data: posts, error: postsErr } = await supabase
    .from("posts")
    .select(`
      id, user_id, recommend_score, created_at,
      place_name, place_id, content, image_urls,
      image_assets, image_variants, cover_square_url
    `)
    .in("user_id", allUserIds)
    .order("created_at", { ascending: false })
    .limit(3000);

  if (postsErr || !posts || posts.length === 0) {
    return NextResponse.json({ people: [], my_centroid: null } satisfies PeopleMapResponse);
  }

  // Resolve place coordinates
  const placeIds = [...new Set(posts.map((p: any) => p.place_id).filter(Boolean))];
  const placeMap = new Map<string, { lat: number; lng: number; genre: string | null; area: string | null }>();

  for (let i = 0; i < placeIds.length; i += 200) {
    const chunk = placeIds.slice(i, i + 200);
    const { data: places } = await supabase
      .from("places")
      .select("place_id, lat, lng, primary_genre, area_label_ja")
      .in("place_id", chunk);
    if (places) {
      for (const p of places) {
        if (p.lat != null && p.lng != null) {
          placeMap.set(p.place_id, { lat: p.lat, lng: p.lng, genre: p.primary_genre ?? null, area: p.area_label_ja ?? null });
        }
      }
    }
  }

  // Group posts by user
  const profileMap = new Map(publicProfiles.map((p: any) => [p.id, p]));

  type PostEntry = { lat: number; lng: number; place_name: string; recommend_score: number | null; image_url: string | null; created_at: string };
  type UserGroup = { scores: number[]; lats: number[]; lngs: number[]; genres: string[]; areas: string[]; allPosts: PostEntry[] };
  const userGroups = new Map<string, UserGroup>();

  for (const post of posts) {
    const place = post.place_id ? placeMap.get(post.place_id) : null;
    if (!place) continue;

    let group = userGroups.get(post.user_id);
    if (!group) {
      group = { scores: [], lats: [], lngs: [], genres: [], areas: [], allPosts: [] };
      userGroups.set(post.user_id, group);
    }

    group.lats.push(place.lat);
    group.lngs.push(place.lng);
    if (typeof post.recommend_score === "number") group.scores.push(post.recommend_score);
    if (place.genre) group.genres.push(place.genre);
    if (place.area) group.areas.push(place.area);

    const imageUrl = post.cover_square_url
      ?? post.image_assets?.[0]?.square
      ?? post.image_variants?.[0]?.thumb
      ?? (Array.isArray(post.image_urls) ? post.image_urls[0] : null);

    group.allPosts.push({
      lat: place.lat, lng: place.lng,
      place_name: post.place_name ?? "お店",
      recommend_score: post.recommend_score,
      image_url: imageUrl,
      created_at: post.created_at,
    });
  }

  // Build PersonMapItems
  const people: PersonMapItem[] = [];
  for (const userId of allUserIds) {
    const group = userGroups.get(userId);
    const profile = profileMap.get(userId) as any;
    if (!profile || !group || group.lats.length === 0) continue;

    const centroid = computeDensestClusterCenter(group.lats, group.lngs);
    const avgScore = group.scores.length > 0
      ? Math.round((group.scores.reduce((a, b) => a + b, 0) / group.scores.length) * 10) / 10
      : 0;

    const filtered = removeOutliers(group.lats, group.lngs);
    const filteredSet = new Set(filtered.lats.map((lat, i) => `${lat},${filtered.lngs[i]}`));
    const seenPlaces = new Set<string>();
    const postLatlngs: PersonMapItem["post_latlngs"] = [];
    for (const p of group.allPosts) {
      const key = `${p.lat},${p.lng}`;
      if (filteredSet.has(key) && !seenPlaces.has(key)) {
        seenPlaces.add(key);
        postLatlngs.push({ lat: p.lat, lng: p.lng, place_name: p.place_name, image_url: p.image_url, recommend_score: p.recommend_score });
      }
    }

    let bounds: PersonMapItem["bounds"] = null;
    if (postLatlngs.length > 0) {
      let swLat = Infinity, swLng = Infinity, neLat = -Infinity, neLng = -Infinity;
      for (const p of postLatlngs) {
        if (p.lat < swLat) swLat = p.lat;
        if (p.lng < swLng) swLng = p.lng;
        if (p.lat > neLat) neLat = p.lat;
        if (p.lng > neLng) neLng = p.lng;
      }
      bounds = { sw: { lat: swLat, lng: swLng }, ne: { lat: neLat, lng: neLng } };
    }

    const topPosts = pickTopPosts(group.allPosts);

    people.push({
      user_id: userId,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      username: profile.username,
      post_count: group.lats.length,
      avg_score: avgScore,
      centroid_lat: centroid.lat,
      centroid_lng: centroid.lng,
      post_latlngs: postLatlngs,
      bounds,
      top_posts: topPosts,
      top_genre: mode(group.genres),
      area_name: mode(group.areas),
      is_following: false,
      mutual_context: null,
    });
  }

  // Sort by post count (most active first)
  people.sort((a, b) => b.post_count - a.post_count);

  return NextResponse.json({ people, my_centroid: null } satisfies PeopleMapResponse);
}

// ── Utilities ──

function computeDensestClusterCenter(lats: number[], lngs: number[]): { lat: number; lng: number } {
  if (lats.length === 1) return { lat: lats[0], lng: lngs[0] };

  const CELL = 0.005; // ~500m
  const cells = new Map<string, { sumLat: number; sumLng: number; count: number }>();

  for (let i = 0; i < lats.length; i++) {
    const key = `${Math.floor(lats[i] / CELL)},${Math.floor(lngs[i] / CELL)}`;
    const cell = cells.get(key) ?? { sumLat: 0, sumLng: 0, count: 0 };
    cell.sumLat += lats[i];
    cell.sumLng += lngs[i];
    cell.count += 1;
    cells.set(key, cell);
  }

  let best = { sumLat: 0, sumLng: 0, count: 0 };
  for (const cell of cells.values()) {
    if (cell.count > best.count) best = cell;
  }

  return {
    lat: best.sumLat / best.count,
    lng: best.sumLng / best.count,
  };
}

function mode(arr: string[]): string | null {
  if (arr.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) { best = k; bestCount = c; }
  }
  return best || null;
}

/**
 * Remove geographic outliers using IQR on distances from centroid.
 * Keeps points within Q3 + 1.5 * IQR of the centroid distance.
 * For small sets (≤3), returns all points.
 */
function removeOutliers(lats: number[], lngs: number[]): { lats: number[]; lngs: number[] } {
  if (lats.length <= 3) return { lats: [...lats], lngs: [...lngs] };

  const centroid = {
    lat: lats.reduce((a, b) => a + b, 0) / lats.length,
    lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
  };

  const distances = lats.map((lat, i) => haversineKm(centroid.lat, centroid.lng, lat, lngs[i]));
  const sorted = [...distances].sort((a, b) => a - b);

  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const upperFence = q3 + 1.5 * iqr;
  // Minimum fence of 30km so we don't over-filter users with spread-out but real activity
  const fence = Math.max(upperFence, 30);

  const filteredLats: number[] = [];
  const filteredLngs: number[] = [];
  for (let i = 0; i < lats.length; i++) {
    if (distances[i] <= fence) {
      filteredLats.push(lats[i]);
      filteredLngs.push(lngs[i]);
    }
  }

  // If too much was filtered, return all
  if (filteredLats.length < lats.length * 0.5) return { lats: [...lats], lngs: [...lngs] };
  return { lats: filteredLats, lngs: filteredLngs };
}

/**
 * Pick the top 2 posts by recommend_score.
 * Deduplicates by place (same lat/lng), keeping the highest-scored version.
 */
function pickTopPosts(
  allPosts: { lat: number; lng: number; place_name: string; image_url: string | null; recommend_score: number | null; created_at: string }[],
): PersonMapItem["top_posts"] {
  // Deduplicate by place, keeping highest score
  const byPlace = new Map<string, typeof allPosts[number]>();
  for (const p of allPosts) {
    const key = `${p.lat},${p.lng}`;
    const existing = byPlace.get(key);
    if (!existing || (p.recommend_score ?? 0) > (existing.recommend_score ?? 0)) {
      byPlace.set(key, p);
    }
  }

  const sorted = [...byPlace.values()].sort(
    (a, b) => (b.recommend_score ?? 0) - (a.recommend_score ?? 0),
  );

  return sorted.slice(0, 2).map((p) => ({
    place_name: p.place_name,
    image_url: p.image_url,
    recommend_score: p.recommend_score,
    created_at: p.created_at,
  }));
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
