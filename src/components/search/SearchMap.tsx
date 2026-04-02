// src/components/search/SearchMap.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  OverlayViewF,
  OverlayView,
  CircleF,
} from "@react-google-maps/api";
import { MapPin, Navigation, Utensils } from "lucide-react";
import type { PostRow } from "./SearchPostList";

// ── types ──
export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type MapPost = PostRow & { place_lat: number; place_lng: number };

// ── map options ──
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 3 /* RIGHT_TOP */ },
  gestureHandling: "greedy",
  clickableIcons: false,
  styles: [
    { featureType: "poi.business", stylers: [{ visibility: "off" }] },
    { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
    { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  ],
};

const MAP_CONTAINER: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 12,
};

// ── helpers ──
function getSquareImageUrl(p: PostRow): string | null {
  if (p.cover_square_url) return p.cover_square_url;
  if (p.image_assets?.[0]?.square) return p.image_assets[0].square;
  if (p.image_variants?.[0]?.thumb) return p.image_variants[0].thumb;
  return null;
}

function formatPrice(p: PostRow): string | null {
  if (typeof p.price_yen === "number" && Number.isFinite(p.price_yen)) {
    return `\u00A5${new Intl.NumberFormat("ja-JP").format(Math.max(0, Math.floor(p.price_yen)))}`;
  }
  if (p.price_range) {
    const m: Record<string, string> = {
      "~999": "\u301C\u00A5999",
      "1000-1999": "\u00A51,000\u301C\u00A51,999",
      "2000-2999": "\u00A52,000\u301C\u00A52,999",
      "3000-3999": "\u00A53,000\u301C\u00A53,999",
      "4000-4999": "\u00A54,000\u301C\u00A54,999",
      "5000-6999": "\u00A55,000\u301C\u00A56,999",
      "7000-9999": "\u00A57,000\u301C\u00A59,999",
      "10000+": "\u00A510,000\u301C",
    };
    return m[p.price_range] ?? p.price_range;
  }
  return null;
}

// ── Custom pin component ──
function CustomPin({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        transform: "translate(-50%, -100%)",
        cursor: "pointer",
        transition: "transform 0.15s ease",
        ...(selected ? { transform: "translate(-50%, -100%) scale(1.2)", zIndex: 100 } : {}),
      }}
    >
      {/* Pin body */}
      <div
        style={{
          width: 32,
          height: 40,
          position: "relative",
          filter: selected ? "drop-shadow(0 2px 6px rgba(234,88,12,0.4))" : "drop-shadow(0 1px 3px rgba(0,0,0,0.25))",
        }}
      >
        <svg width="32" height="40" viewBox="0 0 32 40" fill="none">
          <path
            d="M16 0C7.164 0 0 7.164 0 16c0 12 16 24 16 24s16-12 16-24C32 7.164 24.836 0 16 0z"
            fill={selected ? "#ea580c" : "#f97316"}
          />
          <circle cx="16" cy="15" r="9" fill="white" />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 7,
            left: 0,
            width: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Utensils size={13} color={selected ? "#ea580c" : "#f97316"} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

// ── Bottom card for selected post ──
function BottomCard({
  post,
  onClose,
}: {
  post: MapPost;
  onClose: () => void;
}) {
  const img = getSquareImageUrl(post);
  const prof = post.profile;
  const name = prof?.display_name ?? "\u30E6\u30FC\u30B6\u30FC";
  const avatar = prof?.avatar_url ?? null;
  const initial = (name || "U").slice(0, 1).toUpperCase();
  const score = typeof post.recommend_score === "number" ? post.recommend_score : null;
  const price = formatPrice(post);
  const genre = post.place_genre ?? null;
  const nearestStation = post.nearest_station_name ?? null;
  const nearestMin = typeof post.nearest_station_distance_m === "number"
    ? Math.max(1, Math.ceil(post.nearest_station_distance_m / 80))
    : null;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[1000] animate-in slide-in-from-bottom-4 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={`/posts/${post.id}`}
        className="block mx-2 mb-2 rounded-xl bg-white shadow-xl border border-slate-100 overflow-hidden no-underline"
        style={{ color: "inherit", textDecoration: "none" }}
      >
        <div className="flex gap-0">
          {/* Square image */}
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt=""
              className="w-[100px] h-[100px] object-cover shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-[100px] h-[100px] bg-slate-100 shrink-0 flex items-center justify-center">
              <Utensils size={20} className="text-slate-300" />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0 p-2.5 flex flex-col justify-between">
            <div>
              {/* Place name */}
              <div className="font-bold text-[14px] text-slate-900 leading-tight truncate">
                {post.place_name ?? "\u304A\u5E97"}
              </div>
              {/* Genre + station */}
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500 truncate">
                {genre && <span>{genre}</span>}
                {genre && nearestStation && <span className="text-slate-300">{"\u00B7"}</span>}
                {nearestStation && nearestMin && (
                  <span>{nearestStation} {"\u5F92\u6B69"}{nearestMin}{"\u5206"}</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-1.5">
              {/* Score + price */}
              <div className="flex items-center gap-2">
                {score !== null && (
                  <span
                    className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[12px] font-bold"
                    style={{
                      background: score >= 8 ? "#fff7ed" : "#f8fafc",
                      color: score >= 8 ? "#ea580c" : "#64748b",
                    }}
                  >
                    {score}{" / 10"}
                  </span>
                )}
                {price && (
                  <span className="text-[11px] text-slate-500">{price}</span>
                )}
              </div>

              {/* User avatar */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-slate-400 truncate max-w-[60px]">{name}</span>
                <div className="h-6 w-6 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center text-[9px] font-semibold text-orange-700 shrink-0">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="h-6 w-6 object-cover" loading="lazy" />
                  ) : (
                    initial
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </a>

      {/* Close tap area */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
        className="absolute top-1 right-3 w-6 h-6 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-slate-400 hover:text-slate-600 shadow-sm border border-slate-100"
        aria-label="close"
      >
        <span className="text-[14px] leading-none">{"\u00D7"}</span>
      </button>
    </div>
  );
}

// ── main component ──
export default function SearchMap({
  posts,
  userLocation,
  onSearchThisArea,
  showSearchButton,
}: {
  posts: PostRow[];
  userLocation?: [number, number] | null;
  onSearchThisArea?: (bounds: MapBounds) => void;
  showSearchButton?: boolean;
}) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    id: "gourmeet-google-maps",
  });

  const [mapMoved, setMapMoved] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<MapBounds | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const moveCountRef = useRef(0);
  const settledBoundsRef = useRef<string>("");
  const mapRef = useRef<google.maps.Map | null>(null);
  const prevPostsKeyRef = useRef<string>("");

  // filter to posts with valid coordinates
  const mappablePosts = useMemo(
    () =>
      posts.filter(
        (p): p is MapPost =>
          typeof (p as any).place_lat === "number" &&
          typeof (p as any).place_lng === "number" &&
          Number.isFinite((p as any).place_lat) &&
          Number.isFinite((p as any).place_lng)
      ),
    [posts]
  );

  const selectedPost = useMemo(
    () => mappablePosts.find((p) => p.id === selectedPostId) ?? null,
    [mappablePosts, selectedPostId]
  );

  const center = useMemo(() => {
    if (userLocation) return { lat: userLocation[0], lng: userLocation[1] };
    return { lat: 35.681236, lng: 139.767125 };
  }, [userLocation]);

  // Fit bounds to markers when posts change (including new search results)
  const fitToMarkers = useCallback((postsToFit: MapPost[]) => {
    if (!mapRef.current || postsToFit.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    postsToFit.forEach((p) => bounds.extend({ lat: p.place_lat, lng: p.place_lng }));
    mapRef.current.fitBounds(bounds, { top: 40, bottom: 60, left: 30, right: 30 });
    moveCountRef.current = 0;
    settledBoundsRef.current = "";
    setMapMoved(false);
    setSelectedPostId(null);
  }, []);

  useEffect(() => {
    if (mappablePosts.length === 0) return;
    const key = mappablePosts.map((p) => p.id).sort().join(",");
    if (key === prevPostsKeyRef.current) return;
    prevPostsKeyRef.current = key;
    // Small delay to ensure map is ready after initial render
    const t = setTimeout(() => fitToMarkers(mappablePosts), 100);
    return () => clearTimeout(t);
  }, [mappablePosts, fitToMarkers]);

  const handleBoundsChanged = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    if (!b) return;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    const bounds: MapBounds = {
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
    };
    setCurrentBounds(bounds);

    const key = `${bounds.north.toFixed(4)}_${bounds.south.toFixed(4)}_${bounds.east.toFixed(4)}_${bounds.west.toFixed(4)}`;
    moveCountRef.current += 1;
    if (moveCountRef.current <= 3) {
      settledBoundsRef.current = key;
    } else if (key !== settledBoundsRef.current) {
      setMapMoved(true);
    }
  }, []);

  const handleSearchThisArea = useCallback(() => {
    if (currentBounds && onSearchThisArea) {
      onSearchThisArea(currentBounds);
      setMapMoved(false);
      settledBoundsRef.current = `${currentBounds.north.toFixed(4)}_${currentBounds.south.toFixed(4)}_${currentBounds.east.toFixed(4)}_${currentBounds.west.toFixed(4)}`;
    }
  }, [currentBounds, onSearchThisArea]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    // Fit to markers that might already be loaded
    if (mappablePosts.length > 0) {
      setTimeout(() => fitToMarkers(mappablePosts), 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToMarkers]);

  const showBtn = showSearchButton && mapMoved && onSearchThisArea;

  if (!isLoaded) {
    return (
      <div className="relative w-full flex items-center justify-center bg-slate-100 rounded-xl" style={{ height: "40vh", minHeight: 240 }}>
        <div className="text-sm text-slate-400">{"\u5730\u56F3\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026"}</div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height: "40vh", minHeight: 240 }}>
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER}
        center={center}
        zoom={userLocation ? 14 : 13}
        options={MAP_OPTIONS}
        onLoad={onMapLoad}
        onIdle={handleBoundsChanged}
        onClick={() => setSelectedPostId(null)}
      >
        {/* User location blue dot */}
        {userLocation && (
          <CircleF
            center={{ lat: userLocation[0], lng: userLocation[1] }}
            radius={12}
            options={{
              fillColor: "#3b82f6",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3,
              clickable: false,
              zIndex: 999,
            }}
          />
        )}

        {/* Custom pin markers */}
        {mappablePosts.map((p) => (
          <OverlayViewF
            key={p.id}
            position={{ lat: p.place_lat, lng: p.place_lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <CustomPin
              selected={selectedPostId === p.id}
              onClick={() => setSelectedPostId(selectedPostId === p.id ? null : p.id)}
            />
          </OverlayViewF>
        ))}
      </GoogleMap>

      {/* "Search this area" floating button */}
      {showBtn && (
        <button
          type="button"
          onClick={handleSearchThisArea}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-lg border border-slate-200 hover:bg-slate-50 active:scale-[0.97] transition"
        >
          <Navigation size={13} className="text-slate-500" />
          {"\u3053\u306E\u30A8\u30EA\u30A2\u3067\u691C\u7D22"}
        </button>
      )}

      {/* Post count badge — move up when bottom card is open */}
      {mappablePosts.length > 0 && (
        <div
          className={[
            "absolute left-3 z-[1000] inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow border border-slate-100 transition-all duration-200",
            selectedPost ? "bottom-[116px]" : "bottom-3",
          ].join(" ")}
        >
          <MapPin size={11} />
          {mappablePosts.length}{"\u4EF6\u8868\u793A\u4E2D"}
          {mappablePosts.length < posts.length && (
            <span className="text-slate-400">
              {" / "}{posts.length}{"\u4EF6\u4E2D"}
            </span>
          )}
        </div>
      )}

      {/* Bottom card */}
      {selectedPost && (
        <BottomCard post={selectedPost} onClose={() => setSelectedPostId(null)} />
      )}
    </div>
  );
}
