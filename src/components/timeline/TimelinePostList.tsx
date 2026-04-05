// src/components/timeline/TimelinePostList.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { MapPin, Lock } from "lucide-react";

import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions, { LikerLite } from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import TranslateButton from "@/components/TranslateButton";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";
import { Navigation } from "lucide-react";

type ImageVariant = { thumb?: string | null; full?: string | null; [k: string]: any };
type ImageAsset = { pin?: string | null; square?: string | null; full?: string | null; [k: string]: any };

export type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  username?: string | null;
};

export type SearchMode = "geo" | "station" | "auto";

export type PostRow = {
  id: string;
  content: string | null;

  user_id: string;
  created_at: any;

  image_urls: string[] | null;
  image_variants: ImageVariant[] | null;

  image_assets?: ImageAsset[] | null;
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

  // station search UI fields (search results)
  search_station_distance_m?: number | null;
  search_station_minutes?: number | null;
  search_station_name?: string | null;

  // place intrinsic nearest station fields
  nearest_station_name?: string | null;
  nearest_station_distance_m?: number | null;

  profile: ProfileLite | null;

  likeCount?: number;
  likedByMe?: boolean;
  initialLikers?: LikerLite[];
};

function formatJST(iso: any) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return String(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

function formatRelativeTime(iso: any): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return String(iso);
  const now = Date.now();
  const diffMs = now - dt.getTime();
  if (diffMs < 0) return "たった今";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}時間前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}日前`;
  if (diffD < 30) return `${Math.floor(diffD / 7)}週間前`;
  if (diffD < 365) return `${Math.floor(diffD / 30)}ヶ月前`;
  return `${Math.floor(diffD / 365)}年前`;
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
      case "10000+":
        return "¥10,000〜";
      default:
        return p.price_range;
    }
  }
  return null;
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

function getTimelineSquareUrls(p: PostRow): string[] {
  const cover = p.cover_square_url ? [p.cover_square_url] : [];

  const assets = Array.isArray(p.image_assets) ? p.image_assets : [];
  const squaresFromAssets = assets.map((a) => a?.square ?? null).filter((x): x is string => !!x);

  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const thumbsFromVariants = variants.map((v) => v?.thumb ?? null).filter((x): x is string => !!x);

  const base = [...cover, ...squaresFromAssets, ...thumbsFromVariants];
  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  const all = base.length > 0 ? base : legacy;

  const keyOf = (u: string) => {
    try {
      const x = new URL(u);
      return `${x.origin}${x.pathname}`;
    } catch {
      return u.split("?")[0].split("#")[0];
    }
  };

  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of all) {
    if (!u) continue;
    const k = keyOf(u);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

// ✅ ceilで統一（APIと同じ見え方）
function metersToWalkMin(m: number | null | undefined): number | null {
  if (typeof m !== "number" || !Number.isFinite(m) || m < 0) return null;
  return Math.max(1, Math.ceil(m / 80));
}

export default function TimelinePostList({
  posts,
  meId,
  mode = "auto",
  searchedStationName = null,
  revealImages = false,
}: {
  posts: PostRow[];
  meId: string | null;
  mode?: SearchMode;
  searchedStationName?: string | null;
  revealImages?: boolean;
}) {

  const normalized = useMemo(() => {
    return posts.map((p: any) => {
      // ✅ 互換：profile / user / profiles のどれでも拾う
      const rawProf =
        (p?.profile && typeof p.profile === "object" && !Array.isArray(p.profile) ? p.profile : null) ||
        (p?.user && typeof p.user === "object" && !Array.isArray(p.user) ? p.user : null) ||
        (p?.profiles && typeof p.profiles === "object" && !Array.isArray(p.profiles) ? p.profiles : null);

      // ✅ ProfileLite へ正規化（欠けても最低限表示できるように）
      const userId = String(p?.user_id ?? p?.userId ?? rawProf?.id ?? "");

      const prof: ProfileLite | null =
        userId && (rawProf || p?.display_name || p?.avatar_url || p?.is_public !== undefined)
          ? {
              id: userId,
              display_name: (rawProf?.display_name ?? p?.display_name ?? null) as string | null,
              avatar_url: (rawProf?.avatar_url ?? p?.avatar_url ?? null) as string | null,
              is_public:
                typeof (rawProf?.is_public ?? p?.is_public) === "boolean"
                  ? Boolean(rawProf?.is_public ?? p?.is_public)
                  : true,
              username: (rawProf?.username ?? p?.username ?? null) as string | null,
            }
          : null;

      return {
        ...p,
        id: String(p?.id ?? p?.post_id ?? ""),
        user_id: userId,
        profile: prof,

        place_genre: p.place_genre ?? null,
        likeCount: (p.likeCount ?? p.like_count ?? 0) as number,
        likedByMe: (p.likedByMe ?? p.liked_by_me ?? false) as boolean,
        initialLikers: (p.initialLikers ?? p.initial_likers ?? []) as LikerLite[],

        search_station_name: (p.search_station_name ?? null) as string | null,
        nearest_station_name: (p.nearest_station_name ?? null) as string | null,
        nearest_station_distance_m:
          typeof p.nearest_station_distance_m === "number" ? p.nearest_station_distance_m : null,
      } as PostRow;
    });
  }, [posts]);


  return (
    <div className="flex flex-col items-stretch">
      {normalized.map((p, idx) => {
        const key = p.id ? `${p.id}` : `row-${idx}`;

        const prof = p.profile;
        const display = prof?.display_name ?? "ユーザー";
        const avatar = prof?.avatar_url ?? null;
        const isPublic = prof?.is_public ?? true;
        const initial = (display || "U").slice(0, 1).toUpperCase();

        const areaLabel = extractPrefCity(p.place_address);
        const timelineImageUrls = getTimelineSquareUrls(p);

        const score =
          typeof p.recommend_score === "number" && p.recommend_score >= 0 && p.recommend_score <= 10
            ? p.recommend_score
            : null;

        const priceLabel = formatPrice(p);

        const nearestName = p.nearest_station_name ?? null;
        const nearestDistM = p.nearest_station_distance_m ?? null;
        const nearestMin = metersToWalkMin(nearestDistM);

        const showNearestStation = !!nearestName && nearestMin !== null;

        // location line: area + nearest station
        const locationParts: string[] = [];
        if (areaLabel) locationParts.push(areaLabel);
        if (showNearestStation) {
          locationParts.push(`${nearestName} ${"\u5F92\u6B69"}${nearestMin}${"\u5206"}`);
        }
        const locationLine = locationParts.join(" \u00B7 ");

        // Google Maps link
        const mapsUrl = p.place_id
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_name ?? "place")}&query_place_id=${encodeURIComponent(p.place_id)}`
          : p.place_address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_address)}`
          : null;

        return (
          <article key={key} className="gm-feed-divider">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
              <div className="md:border-r md:border-black/[.05] dark:md:border-white/[.08]">
                {/* Header */}
                <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Link
                      href={p.profile?.username ? `/u/${p.profile.username}` : p.user_id ? `/u/${p.user_id}` : "#"}
                      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-orange-100 dark:bg-orange-900/30 text-[10px] font-semibold text-orange-700 dark:text-orange-400"
                    >
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        initial
                      )}
                    </Link>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <Link
                          href={p.profile?.username ? `/u/${p.profile.username}` : p.user_id ? `/u/${p.user_id}` : "#"}
                          className="truncate text-[13px] font-semibold text-slate-900 dark:text-gray-100 hover:underline"
                        >
                          {display}
                        </Link>
                        {!isPublic && <Lock size={12} className="shrink-0 text-slate-400 dark:text-gray-500" />}
                        <span className="text-[11px] text-slate-400 dark:text-gray-500">{"\u00B7"}</span>
                        <span className="text-[11px] text-slate-400 dark:text-gray-500">{formatRelativeTime(p.created_at)}</span>
                      </div>
                      {locationLine && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-gray-400 truncate">
                          <MapPin size={11} className="shrink-0 opacity-60" />
                          <span className="truncate">{locationLine}</span>
                          {mapsUrl && (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 text-slate-400 dark:text-gray-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors"
                              aria-label="Google Mapsで開く"
                              title="Google Mapsで開く"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Navigation size={10} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <PostMoreMenu postId={p.id} isMine={meId === p.user_id} />
                  </div>
                </div>

                {/* Media */}
                {timelineImageUrls.length > 0 && (
                  <div className="block w-[calc(100%+1.5rem)] -mx-3 md:w-full md:mx-0 aspect-square overflow-hidden bg-slate-100 dark:bg-[#1e2026]">
                    <PostImageCarousel
                      postId={p.id}
                      imageUrls={timelineImageUrls}
                      syncUrl={false}
                      eager={false}
                      preloadNeighbors={true}
                      fit="cover"
                      aspect="square"
                      reveal={revealImages}
                      revealStyle="wipe"
                      revealDurationMs={1100}
                      revealDelayMs={120}
                      revealOncePerImage={true}
                      revealOnlyWhenActive={true}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between px-3 pt-1.5 pb-0">
                  <PostActions
                    postId={p.id}
                    postUserId={p.user_id}
                    initialLiked={p.likedByMe ?? false}
                    initialLikeCount={p.likeCount ?? 0}
                    initialLikers={p.initialLikers ?? []}
                    meId={meId}
                    initialWanted={false}
                    initialBookmarked={false}
                    initialWantCount={0}
                    initialBookmarkCount={0}
                  />
                  <PostCollectionButton postId={p.id} />
                </div>

                {/* Meta line: score + price */}
                {(score !== null || priceLabel) && (
                  <div className="flex items-center gap-1.5 px-3 pt-0.5 text-[11px]">
                    {score !== null && (
                      <span className="font-medium text-slate-500 dark:text-gray-400">{"\u304A\u3059\u3059\u3081"} {score}/10</span>
                    )}
                    {score !== null && priceLabel && <span className="text-slate-300 dark:text-gray-600">{"\u00B7"}</span>}
                    {priceLabel && <span className="text-slate-400 dark:text-gray-500">{priceLabel}</span>}
                  </div>
                )}

                {/* Body */}
                <div className="px-3 pt-0.5 pb-1.5">
                  {p.content && (
                    <>
                      <TranslateButton text={p.content}>
                        <p className="whitespace-pre-wrap text-[13px] leading-snug text-slate-800 dark:text-gray-200">
                          <Link href={`/posts/${p.id}`} className="hover:underline">
                            {p.content}
                          </Link>
                        </p>
                      </TranslateButton>
                    </>
                  )}
                </div>

                {/* Comments */}
                <div className="px-3 pb-2">
                  <PostComments postId={p.id} postUserId={p.user_id} meId={meId} previewCount={2} />
                </div>
              </div>

              {/* Right panel (PC) */}
              <aside className="hidden md:block p-4">
                {p.place_id ? (
                  <PlacePhotoGallery placeId={p.place_id} placeName={p.place_name} per={8} maxThumbs={8} />
                ) : (
                  <div className="text-xs text-slate-400 dark:text-gray-500">{"\u5199\u771F\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F"}</div>
                )}
              </aside>
            </div>
          </article>
        );
      })}
    </div>
  );
}
