// src/components/search/SearchPostList.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { MapPin, Lock } from "lucide-react";

import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions, { LikerLite } from "@/components/PostActions";
import { timelineImageUrl } from "@/lib/imageUrl";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import TranslateButton from "@/components/TranslateButton";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";

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

  place_lat?: number | null;
  place_lng?: number | null;

  profile: ProfileLite | null;

  likeCount?: number;
  likedByMe?: boolean;
  initialLikers?: LikerLite[];
};

function formatRelativeTime(iso: any): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return String(iso);
  const now = Date.now();
  const diffMs = now - dt.getTime();
  if (diffMs < 0) return "\u305F\u3063\u305F\u4ECA";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "\u305F\u3063\u305F\u4ECA";
  if (diffMin < 60) return `${diffMin}\u5206\u524D`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}\u6642\u9593\u524D`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}\u65E5\u524D`;
  if (diffD < 30) return `${Math.floor(diffD / 7)}\u9031\u9593\u524D`;
  if (diffD < 365) return `${Math.floor(diffD / 30)}\u30F6\u6708\u524D`;
  return `${Math.floor(diffD / 365)}\u5E74\u524D`;
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
    return `\u00A5${formatYen(Math.max(0, Math.floor(p.price_yen)))}`;
  }
  if (p.price_range) {
    switch (p.price_range) {
      case "~999":
        return "\u301C\u00A5999";
      case "1000-1999":
        return "\u00A51,000\u301C\u00A51,999";
      case "2000-2999":
        return "\u00A52,000\u301C\u00A52,999";
      case "3000-3999":
        return "\u00A53,000\u301C\u00A53,999";
      case "4000-4999":
        return "\u00A54,000\u301C\u00A54,999";
      case "5000-6999":
        return "\u00A55,000\u301C\u00A56,999";
      case "7000-9999":
        return "\u00A57,000\u301C\u00A59,999";
      case "10000+":
        return "\u00A510,000\u301C";
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
    out.push(timelineImageUrl(u));
  }
  return out;
}

// ceilで統一（APIと同じ見え方）
function metersToWalkMin(m: number | null | undefined): number | null {
  if (typeof m !== "number" || !Number.isFinite(m) || m < 0) return null;
  return Math.max(1, Math.ceil(m / 80));
}

export default function SearchPostList({
  posts,
  meId,
  mode = "auto",
  searchedStationName = null,
  revealImages = false,
  showRanks = false,
}: {
  posts: PostRow[];
  meId: string | null;
  mode?: SearchMode;
  searchedStationName?: string | null;
  revealImages?: boolean;
  showRanks?: boolean;
}) {
  const normalized = useMemo(() => {
    return posts.map((p: any) => {
      const rawProf =
        (p?.profile && typeof p.profile === "object" && !Array.isArray(p.profile) ? p.profile : null) ||
        (p?.user && typeof p.user === "object" && !Array.isArray(p.user) ? p.user : null) ||
        (p?.profiles && typeof p.profiles === "object" && !Array.isArray(p.profiles) ? p.profiles : null);

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
        likeCount: p.likeCount ?? 0,
        likedByMe: p.likedByMe ?? false,
        initialLikers: p.initialLikers ?? [],

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
        const display = prof?.display_name ?? "\u30E6\u30FC\u30B6\u30FC";
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

        const searchDistM = p.search_station_distance_m ?? null;
        const searchMinFromPayload =
          typeof p.search_station_minutes === "number" && Number.isFinite(p.search_station_minutes)
            ? Math.max(1, Math.round(p.search_station_minutes))
            : null;
        const searchMin = searchMinFromPayload ?? metersToWalkMin(searchDistM);

        const nearestName = p.nearest_station_name ?? null;
        const nearestDistM = p.nearest_station_distance_m ?? null;
        const nearestMin = metersToWalkMin(nearestDistM);

        const isStationMode = mode === "station";

        const selectedStationName =
          (typeof searchedStationName === "string" && searchedStationName.trim()) ||
          (typeof p.search_station_name === "string" && p.search_station_name.trim()) ||
          "\u99C5";

        const showSearchStation = isStationMode && searchMin !== null;
        const showNearestStation = !!nearestName && nearestMin !== null;

        // Build location line: area + station info
        const locationParts: string[] = [];
        if (areaLabel) locationParts.push(areaLabel);
        if (showSearchStation) {
          locationParts.push(`${selectedStationName} \u5F92\u6B69${searchMin}\u5206`);
        }
        if (showNearestStation) {
          locationParts.push(`${nearestName} \u5F92\u6B69${nearestMin}\u5206`);
        }
        const locationLine = locationParts.join(" \u00B7 ");

        // Rank badge
        const rank = idx + 1;
        const rankLabel = showRanks ? `${rank}\u4F4D` : null;
        const rankStyle =
          rank === 1
            ? "bg-orange-500 text-white"
            : rank <= 3
            ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300"
            : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-gray-400";

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
                  <div className="relative block w-full aspect-square overflow-hidden bg-slate-100 dark:bg-[#1e2026]">
                    {rankLabel && (
                      <div
                        className={`absolute top-3 left-3 z-10 rounded-full px-2 py-0.5 text-[11px] font-bold ${rankStyle}`}
                      >
                        {rankLabel}
                      </div>
                    )}
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

                {/* Rank badge when no image */}
                {timelineImageUrls.length === 0 && rankLabel && (
                  <div className="px-3 pt-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${rankStyle}`}
                    >
                      {rankLabel}
                    </span>
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
                        <p className="whitespace-pre-wrap text-[12px] leading-snug text-slate-800 dark:text-gray-200">
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
