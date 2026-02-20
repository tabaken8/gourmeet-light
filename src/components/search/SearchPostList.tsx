// src/components/timeline/SearchPostList.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Lock, ChevronDown, ChevronUp, TrainFront } from "lucide-react";

import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions, { LikerLite } from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import PostComments from "@/components/PostComments";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";

type ImageVariant = { thumb?: string | null; full?: string | null; [k: string]: any };
type ImageAsset = { pin?: string | null; square?: string | null; full?: string | null; [k: string]: any };

export type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
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

function GoogleMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.7 1.2 9.1 3.5l6.8-6.8C35.3 2.7 29.9 0 24 0 14.8 0 6.7 5.1 2.4 12.6l7.9 6.1C12.4 12.1 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.2-3.2-.5-4.7H24v9h12.3c-.5 2.7-2.1 5-4.5 6.5v5.4h7.3c4.3-4 6.8-9.9 6.8-16.2z"
      />
      <path
        fill="#FBBC04"
        d="M10.3 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6v-5.4H2.4c-1.6 3.2-2.4 6.9-2.4 10.9s.9 7.7 2.4 10.9l7.9-6.2z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.3-5.4c-2 1.4-4.6 2.3-7.9 2.3-6.2 0-11.6-3.6-14-8.8l-7.9 6.2C6.7 42.9 14.8 48 24 48z"
      />
    </svg>
  );
}

// ✅ ceilで統一（APIと同じ見え方）
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
}: {
  posts: PostRow[];
  meId: string | null;
  mode?: SearchMode;
  searchedStationName?: string | null;
  revealImages?: boolean;
}) {
  const [openPhotos, setOpenPhotos] = useState<Record<string, boolean>>({});

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
    <div className="flex flex-col items-stretch gap-6">
      {normalized.map((p, idx) => {
        const key = p.id ? `${p.id}` : `row-${idx}`;

        const prof = p.profile;
        const display = prof?.display_name ?? "ユーザー";
        const avatar = prof?.avatar_url ?? null;
        const isPublic = prof?.is_public ?? true;
        const initial = (display || "U").slice(0, 1).toUpperCase();

        const mapUrl = p.place_id
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              p.place_name ?? "place"
            )}&query_place_id=${encodeURIComponent(p.place_id)}`
          : p.place_address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_address)}`
          : null;

        const areaLabel = extractPrefCity(p.place_address);
        const timelineImageUrls = getTimelineSquareUrls(p);

        const hasPlace = !!p.place_id;
        const isPhotosOpen = !!openPhotos[p.id];

        const togglePhotos = () => {
          if (!hasPlace) return;
          setOpenPhotos((prev) => ({ ...prev, [p.id]: !prev[p.id] }));
        };

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

        // ✅ 駅名を壊れにくく：検索確定駅名 > postのsearch_station_name > "駅"
        const selectedStationName =
          (typeof searchedStationName === "string" && searchedStationName.trim()) ||
          (typeof p.search_station_name === "string" && p.search_station_name.trim()) ||
          "駅";

        // ✅ 駅名が欠けても徒歩分は表示（駅名は上でフォールバック）
        const showSearchStation = isStationMode && searchMin !== null;
        const showNearestStation = !!nearestName && nearestMin !== null;

        const showStationChip =
          (isStationMode && (showSearchStation || showNearestStation)) || (!isStationMode && showNearestStation);

        return (
          <article key={key} className="gm-card gm-press overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
              <div className="md:border-r md:border-black/[.05]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link
                      href={p.user_id ? `/u/${p.user_id}` : "#"}
                      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700"
                    >
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
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
                          href={p.user_id ? `/u/${p.user_id}` : "#"}
                          className="truncate text-sm font-semibold text-slate-900 hover:underline"
                        >
                          {display}
                        </Link>
                        {!isPublic && <Lock size={14} className="shrink-0 text-slate-500" />}
                      </div>
                      <div className="text-[12px] text-slate-500">検索結果</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <PostMoreMenu postId={p.id} isMine={meId === p.user_id} />
                  </div>
                </div>

                {/* Strip */}
                <div className="px-4 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.place_name ? (
                      <div className="gm-chip inline-flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-800">
                        <MapPin size={16} className="opacity-70" />
                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[360px] truncate hover:underline"
                            title={p.place_address ?? undefined}
                          >
                            <span className="font-semibold">{p.place_name}</span>
                            {areaLabel ? <span className="ml-2 text-slate-500">{areaLabel}</span> : null}
                          </a>
                        ) : (
                          <span className="max-w-[360px] truncate" title={p.place_address ?? undefined}>
                            <span className="font-semibold">{p.place_name}</span>
                            {areaLabel ? <span className="ml-2 text-slate-500">({areaLabel})</span> : null}
                          </span>
                        )}
                      </div>
                    ) : null}

                    {(p.place_genre || null) ? (
                      <span className="gm-chip inline-flex items-center px-3 py-1.5 text-[12px] text-slate-700">
                        {p.place_genre}
                      </span>
                    ) : null}

                    {showStationChip ? (
                      <span className="gm-chip inline-flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700">
                        <TrainFront size={16} className="opacity-70" />
                        <span className="truncate">
                          {showSearchStation ? (
                            <>
                              <span className="font-semibold">{selectedStationName}</span>
                              <span className="ml-1 text-slate-500">から徒歩</span>
                              <span className="ml-1 font-semibold">{searchMin}</span>
                              <span className="text-slate-500">分</span>
                            </>
                          ) : null}

                          {isStationMode && showSearchStation && showNearestStation ? (
                            <span className="mx-2 text-slate-400">/</span>
                          ) : null}

                          {showNearestStation ? (
                            <>
                              <span className="text-slate-500">最寄</span>
                              <span className="ml-1 font-semibold">{nearestName}</span>
                              <span className="ml-1 text-slate-500">徒歩</span>
                              <span className="ml-1 font-semibold">{nearestMin}</span>
                              <span className="text-slate-500">分</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    ) : null}

                    {score !== null ? (
                      <span className="gm-chip inline-flex items-center px-3 py-1.5 text-[12px] text-orange-800">
                        おすすめ <span className="ml-1 font-semibold">{score}/10</span>
                      </span>
                    ) : null}

                    {priceLabel ? (
                      <span className="gm-chip inline-flex items-center px-3 py-1.5 text-[12px] text-slate-700">
                        {priceLabel}
                      </span>
                    ) : null}

                    <span className="flex-1" />

                    <Link
                      href={`/posts/${p.id}`}
                      className="gm-chip inline-flex items-center px-3 py-1.5 text-[12px] font-semibold text-orange-700 hover:underline"
                    >
                      詳細
                    </Link>

                    <span className="gm-chip inline-flex items-center px-3 py-1.5 text-[12px] text-slate-500">
                      {formatJST(p.created_at)}
                    </span>

                    {hasPlace && (
                      <button
                        type="button"
                        onClick={togglePhotos}
                        aria-label={isPhotosOpen ? "Googleの写真を閉じる" : "Googleの写真を表示"}
                        className="md:hidden gm-chip gm-press inline-flex h-8 items-center gap-2 px-3 text-[12px] font-semibold text-slate-700"
                      >
                        <GoogleMark className="h-5 w-5" />
                        <span className="leading-none">写真</span>
                        {isPhotosOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Media */}
                {timelineImageUrls.length > 0 && (
                  <div className="block w-full aspect-square overflow-hidden bg-slate-100">
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

                {/* Body */}
                <div className="space-y-2 px-4 py-4">
                  {p.content && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{p.content}</p>}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-4 pb-3 pt-0">
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

                {/* Comments */}
                <div className="px-4 pb-5">
                  <PostComments postId={p.id} postUserId={p.user_id} meId={meId} previewCount={2} />
                </div>
              </div>

              {/* Right panel (PC) */}
              <aside className="hidden md:block p-4">
                {p.place_id ? (
                  <PlacePhotoGallery placeId={p.place_id} placeName={p.place_name} per={8} maxThumbs={8} />
                ) : (
                  <div className="text-xs text-slate-400">写真を取得できませんでした</div>
                )}
              </aside>
            </div>

            {/* Mobile expand photos */}
            {p.place_id && isPhotosOpen ? (
              <div className="md:hidden pb-5 px-4">
                <PlacePhotoGallery placeId={p.place_id} placeName={p.place_name} per={3} maxThumbs={3} />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
