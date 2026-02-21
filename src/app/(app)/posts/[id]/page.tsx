import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

import PostImageCarousel from "@/components/PostImageCarousel";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostActions, { LikerLite } from "@/components/PostActions";
import GenreVoteInline from "@/components/GenreVoteInline";
import FollowButton from "@/components/FollowButton";
import { MapPin } from "lucide-react";

import PostCommentsBlock from "./parts/PostCommentsBlock";
import PlacePhotosBlock from "./parts/PlacePhotosBlock";
import MoreDiscoverBlock from "./parts/MoreDiscoverBlock";

import DetailRequestModal from "./parts/DetailRequestModal";
import UserOtherPostsStrip, { type MiniPost } from "./parts/UserOtherPostsStrip";

import { TAG_CATEGORIES, type TagCategory, findTagById, tagCategoryLabel } from "@/lib/postTags";

export const dynamic = "force-dynamic";

type ImageVariant = { thumb?: string | null; full?: string | null; [k: string]: any };

type PlaceLite = {
  place_id: string | null;
  name: string | null;
  address?: string | null;
  primary_genre: string | null;
  area_label_ja?: string | null;
};

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_public?: boolean | null;
};

type PostRow = {
  id: string;
  content: string | null;
  user_id: string;
  created_at: string;

  visited_on?: string | null;
  time_of_day?: string | null;

  image_urls: string[] | null;
  image_variants?: ImageVariant[] | null;

  place_name: string | null;
  place_address: string | null;
  place_id: string | null;

  recommend_score?: number | null;
  price_yen?: number | null;
  price_range?: string | null;

  tag_ids?: string[] | null;

  profiles: ProfileLite | null;
  places?: PlaceLite | null;
};

function formatJST(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatVisitedYYYYMMDD(isoOrDate: string) {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) {
    const m = isoOrDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}/${m[2]}/${m[3]}` : isoOrDate;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}/${mo}/${da}`;
}

function formatYen(n: number) {
  try {
    return new Intl.NumberFormat("ja-JP").format(n);
  } catch {
    return String(n);
  }
}

function formatPrice(p: PostRow): string | null {
  if (typeof p.price_yen === "number" && Number.isFinite(p.price_yen)) {
    return `¥${formatYen(Math.max(0, Math.floor(p.price_yen)))}`;
  }
  if (p.price_range) {
    switch (p.price_range) {
      case "~999":
        return "〜¥999";
      case "1000-1999":
        return "¥1,000〜¥1,999";
      case "2000-2999":
        return "¥2,000〜¥2,999";
      case "3000-3999":
        return "¥3,000〜¥3,999";
      case "4000-4999":
        return "¥4,000〜¥4,999";
      case "5000-6999":
        return "¥5,000〜¥6,999";
      case "7000-9999":
        return "¥7,000〜¥9,999";
      case "10000-14999":
        return "¥10,000〜¥14,999";
      case "15000-19999":
        return "¥15,000〜¥19,999";
      case "20000-24999":
        return "¥20,000〜¥24,999";
      case "25000-29999":
        return "¥25,000〜¥29,999";
      case "30000-49999":
        return "¥30,000〜¥49,999";
      case "50000+":
        return "¥50,000〜";
      default:
        return p.price_range;
    }
  }
  return null;
}

function getAllImageUrls(p: PostRow): string[] {
  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const fromVariants = variants
    .map((v) => (v?.full ?? v?.thumb ?? null))
    .filter((x): x is string => !!x);
  if (fromVariants.length > 0) return fromVariants;

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy.filter((x): x is string => !!x);
}

function extractPrefCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const s = address
    .replace(/^日本[、,\s]*/u, "")
    .replace(/〒\s*\d{3}-?\d{4}\s*/u, "")
    .trim();
  const m = s.match(/(東京都|北海道|大阪府|京都府|.{2,3}県)([^0-9\s,、]{1,20}?(市|区|町|村))/u);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

function timeOfDayLabel(v: string | null | undefined) {
  if (v === "day") return "昼";
  if (v === "night") return "夜";
  return null;
}

function buildDetailsRows(tagIds: string[] | null | undefined) {
  const ids = Array.isArray(tagIds) ? tagIds : [];
  const byCat = new Map<Exclude<TagCategory, "all">, string[]>();

  for (const id of ids) {
    const t = findTagById(id);
    if (!t) continue;
    const arr = byCat.get(t.category) ?? [];
    arr.push(t.label);
    byCat.set(t.category, arr);
  }

  const cats = TAG_CATEGORIES.map((x) => x.id).filter((x): x is Exclude<TagCategory, "all"> => x !== "all");

  const rows = cats
    .map((cat) => {
      const labels = byCat.get(cat) ?? [];
      const uniq = Array.from(new Set(labels));
      return {
        cat,
        title: tagCategoryLabel(cat),
        value: uniq.join(" ・ "),
        has: uniq.length > 0,
      };
    })
    .filter((r) => r.has);

  return { rows };
}

function clampScore(n: any): number | null {
  const v = typeof n === "number" ? n : n === null || n === undefined ? null : Number(n);
  if (v === null) return null;
  if (!Number.isFinite(v)) return null;
  const clamped = Math.min(10, Math.max(0, v));
  return Math.round(clamped * 10) / 10;
}

function toMiniPost(p: any): MiniPost {
  return {
    id: String(p.id),
    place_id: p.place_id ?? null,
    created_at: p.created_at ?? null,
    visited_on: p.visited_on ?? null,
    recommend_score: p.recommend_score ?? null,
    image_urls: p.image_urls ?? null,
    image_variants: p.image_variants ?? null,
    places: p.places ?? null,
    place_name: p.place_name ?? null,
    place_address: p.place_address ?? null,
  };
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { img_index?: string };
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let safeIndex = 0;
  if (searchParams?.img_index) {
    const n = Number(searchParams.img_index);
    if (Number.isFinite(n) && n > 0) safeIndex = n - 1;
  }

  const { data, error: postErr } = await supabase
    .from("posts")
    .select(
      `
      id,
      content,
      user_id,
      created_at,
      visited_on,
      time_of_day,
      image_urls,
      image_variants,
      place_name,
      place_address,
      place_id,
      recommend_score,
      price_yen,
      price_range,
      tag_ids,
      profiles (
        id,
        display_name,
        avatar_url,
        is_public
      ),
      places (
        place_id,
        name,
        address,
        primary_genre,
        area_label_ja
      )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (postErr) return notFound();
  const post = data as PostRow | null;
  if (!post) return notFound();

  const isMine = !!(user?.id && user.id === post.user_id);

  // ---- likes ----
  const likeCountPromise = supabase
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", post.id);

  const likedPromise = user
    ? supabase
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", post.id)
        .eq("user_id", user.id)
    : Promise.resolve({ count: 0 } as any);

  const recentLikersPromise = supabase
    .from("post_likes")
    .select("user_id, created_at")
    .eq("post_id", post.id)
    .order("created_at", { ascending: false })
    .limit(3);

  // ---- follow ----
  const myFollowPromise =
    user && !isMine
      ? supabase
          .from("follows")
          .select("status")
          .eq("follower_id", user.id)
          .eq("followee_id", post.user_id)
          .in("status", ["accepted", "pending"])
          .maybeSingle()
      : Promise.resolve({ data: null } as any);

  const incomingFollowPromise =
    user && !isMine
      ? supabase
          .from("follows")
          .select("status")
          .eq("follower_id", post.user_id)
          .eq("followee_id", user.id)
          .eq("status", "accepted")
          .maybeSingle()
      : Promise.resolve({ data: null } as any);

  const [
    { count: likeCount = 0 },
    { count: likedCount = 0 },
    { data: recentLikes },
    { data: myFollowEdge },
    { data: incomingEdge },
  ] = await Promise.all([likeCountPromise, likedPromise, recentLikersPromise, myFollowPromise, incomingFollowPromise]);

  const initiallyLiked = (likedCount ?? 0) > 0;

  const likerIds = Array.from(new Set((recentLikes ?? []).map((r: any) => r.user_id).filter(Boolean)));
  let initialLikers: LikerLite[] = [];
  if (likerIds.length) {
    const { data: likerProfs } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", likerIds);
    const map: Record<string, any> = {};
    for (const p of likerProfs ?? []) map[(p as any).id] = p;
    initialLikers = likerIds
      .map((id) => map[id])
      .filter(Boolean)
      .map((p: any) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }));
  }

  const myStatus = (myFollowEdge as any)?.status as ("accepted" | "pending" | undefined);
  const iFollow = myStatus === "accepted";
  const requested = myStatus === "pending";
  const showFollowButton = !!(user?.id && !isMine && !iFollow && !requested);

  const isFollowedByThem = !!incomingEdge;
  const followCtaLabel = isFollowedByThem ? "フォローバックする" : "フォローする";

  const prof = post.profiles;
  const display = prof?.display_name ?? "ユーザー";
  const avatar = prof?.avatar_url ?? null;
  const isPublic = prof?.is_public ?? true;
  const initial = (display || "U").slice(0, 1).toUpperCase();

  const score = clampScore(post.recommend_score);
  const visitedLabel = post.visited_on ? formatVisitedYYYYMMDD(post.visited_on) : null;
  const tod = timeOfDayLabel(post.time_of_day);

  const priceLabel = formatPrice(post);
  const areaLabel = extractPrefCity(post.place_address);

  const mapUrl = post.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.place_name ?? "place")}&query_place_id=${encodeURIComponent(
        post.place_id
      )}`
    : post.place_address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.place_address)}`
      : null;

  const imageUrls = getAllImageUrls(post);
  const summaryLine = (post.content ?? "").trim().split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? null;

  const { rows: detailRows } = buildDetailsRows(post.tag_ids);
  const hasDetails = detailRows.length > 0;

  // =========================
  // この人の他の投稿（同ジャンル / 同店（他人もOK） / 最近）
  // =========================
  const currentGenre = (post.places?.primary_genre ?? "").trim() || null;

  const baseSelect = `
    id,
    user_id,
    created_at,
    visited_on,
    recommend_score,
    image_urls,
    image_variants,
    place_id,
    place_name,
    place_address,
    places!inner (
      place_id,
      name,
      address,
      primary_genre,
      area_label_ja
    )
  `;

  // ✅ 最近：この人の最近
  const recentByUserPromise = supabase
    .from("posts")
    .select(baseSelect)
    .eq("user_id", post.user_id)
    .neq("id", post.id)
    .order("created_at", { ascending: false })
    .limit(12);

  // ✅ 同じ店：他人もOK（ただし “この投稿” は除外）
  const samePlaceAnyPromise =
    post.place_id
      ? supabase
          .from("posts")
          .select(baseSelect)
          .eq("place_id", post.place_id)
          .neq("id", post.id)
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] } as any);

  // ✅ 同じジャンル：この人の同ジャンル（フィルタを効かせるため places!inner）
  const sameGenreByUserPromise =
    currentGenre
      ? supabase
          .from("posts")
          .select(baseSelect)
          .eq("user_id", post.user_id)
          .eq("places.primary_genre", currentGenre)
          .neq("id", post.id)
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] } as any);

  const [{ data: recentByUser }, { data: samePlaceAny }, { data: sameGenreByUser }] = await Promise.all([
    recentByUserPromise,
    samePlaceAnyPromise,
    sameGenreByUserPromise,
  ]);

  const miniRecent = (recentByUser ?? []).map(toMiniPost);
  const miniSamePlace = (samePlaceAny ?? []).map(toMiniPost);
  const miniSameGenre = (sameGenreByUser ?? []).map(toMiniPost);

  return (
    <main className="mx-auto max-w-5xl px-3 md:px-6 py-6 md:py-10">
      <article className="gm-card overflow-hidden">
        {/* 店ヘッダー */}
        <section className="border-b border-black/[.06] px-4 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-extrabold text-slate-900">{post.place_name ?? "店名不明"}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-600">
                {areaLabel ? <span className="font-semibold">{areaLabel}</span> : null}
                {post.place_address ? <span className="truncate max-w-[520px]">{post.place_address}</span> : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <MapPin size={14} />
                    地図
                  </a>
                ) : null}

                {priceLabel ? (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">
                    価格: {priceLabel}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {showFollowButton ? (
                <FollowButton
                  targetUserId={post.user_id}
                  initiallyFollowing={false}
                  initiallyRequested={false}
                  label={followCtaLabel}
                />
              ) : null}
              <PostMoreMenu postId={post.id} isMine={isMine} />
            </div>
          </div>
        </section>

        {/* 投稿サマリー */}
        <section className="border-b border-black/[.06] px-4 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              href={`/u/${post.user_id}`}
              className="gm-press flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700 ring-1 ring-black/[.06]"
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <Link href={`/u/${post.user_id}`} className="truncate text-sm font-semibold text-slate-900 hover:underline">
                  {display}
                </Link>
                {!isPublic ? <span className="text-[11px] text-slate-400">🔒</span> : null}
              </div>

              <div className="mt-0.5 text-[11px] text-slate-500">{formatJST(post.created_at)}</div>

              {summaryLine ? (
                <div className="mt-2 text-[12px] font-semibold text-slate-800 line-clamp-2">{summaryLine}</div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                {visitedLabel ? (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">
                    来店日: {visitedLabel}
                  </span>
                ) : null}
                {tod ? (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">
                    時間帯: {tod}
                  </span>
                ) : null}
                {score !== null ? (
                  <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 font-semibold text-orange-800">
                    おすすめ: <span className="ml-1 font-extrabold">{score.toFixed(1)}</span>/10
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* 写真 */}
        {imageUrls.length > 0 ? (
          <div className="-mx-3 md:mx-0 border-b border-black/[.06]">
            <div className="block w-full aspect-square overflow-hidden bg-slate-100">
              <PostImageCarousel
                postId={post.id}
                imageUrls={imageUrls}
                initialIndex={safeIndex}
                syncUrl={false}
                eager={false as any}
                preloadNeighbors={true as any}
                fit={"cover" as any}
                aspect={"square" as any}
              />
            </div>
          </div>
        ) : null}

        {/* 本文 */}
        {post.content ? (
          <section className="px-4 py-4 border-b border-black/[.06]">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{post.content}</p>
          </section>
        ) : null}

        {/* Details */}
        <section className="px-4 py-4 border-b border-black/[.06]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-slate-900">Details</h2>
            <DetailRequestModal postId={post.id} placeName={post.place_name} placeId={post.place_id} />
          </div>

          {hasDetails ? (
            <div className="mt-3">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="divide-y divide-slate-200">
                  {detailRows.map((r) => (
                    <div key={r.cat} className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2">
                      <div className="text-[12px] font-semibold text-slate-600">{r.title}</div>
                      <div className="text-[12px] font-semibold text-slate-800">{r.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">※ これは「この投稿の体験メモ」です（店舗の公式情報ではありません）</div>
            </div>
          ) : (
            <div className="mt-2 text-[12px] text-slate-500">まだDetailsがありません。</div>
          )}
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-black/[.06]">
          <PostActions
            postId={post.id}
            postUserId={post.user_id}
            initialLiked={initiallyLiked}
            initialLikeCount={likeCount ?? 0}
            initialLikers={initialLikers}
            meId={user?.id ?? null}
            initialWanted={false}
            initialBookmarked={false}
            initialWantCount={0}
            initialBookmarkCount={0}
          />

          {post.place_id ? (
            <div className="flex justify-end">
              <div className="inline-block w-auto max-w-full">
                <Suspense fallback={<div className="text-xs text-slate-500">ジャンルを読み込み中...</div>}>
                  <GenreVoteInline placeId={post.place_id} />
                </Suspense>
              </div>
            </div>
          ) : null}
        </div>

        {/* Comments */}
        <div id="comments" className="px-4 py-4 border-b border-black/[.06]">
          <Suspense fallback={<div className="text-xs text-slate-500">コメントを読み込み中...</div>}>
            <PostCommentsBlock postId={post.id} postUserId={post.user_id} meId={user?.id ?? null} />
          </Suspense>
        </div>

        {/* Place Photos */}
        {post.place_id ? (
          <div className="px-4 py-4 border-b border-black/[.06]">
            <Suspense fallback={<div className="text-xs text-slate-500">お店の写真を読み込み中...</div>}>
              <PlacePhotosBlock placeId={post.place_id} placeName={post.place_name} mapUrl={mapUrl} />
            </Suspense>
          </div>
        ) : null}
      </article>

      {/* この人の他の投稿（初期=同じジャンル） */}
      <div className="mt-8">
        <UserOtherPostsStrip
          title={`${display} の他の投稿`}
          currentPostId={post.id}
          initialTab="genre"
          genreLabel={currentGenre}
          placeId={post.place_id}
          recent={miniRecent}
          samePlace={miniSamePlace}
          sameGenre={miniSameGenre}
        />
      </div>

      {/* more discover */}
      <div className="mt-8">
        <Suspense fallback={<div className="text-xs text-slate-500">おすすめを計算中...</div>}>
          <MoreDiscoverBlock currentPostId={post.id} meId={user?.id ?? null} />
        </Suspense>
      </div>
    </main>
  );
}