// src/components/search/SearchMap.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  OverlayViewF,
  OverlayView,
} from "@react-google-maps/api";
import { MapPin, Navigation, Search, Utensils, Loader2 } from "lucide-react";
import type { PostRow } from "./SearchPostList";

// ── types ──
export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type MapPost = PostRow & { place_lat: number; place_lng: number };

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

// ── main component ──
export default function SearchMap({
  posts,
  userLocation,
  onSearchThisArea,
  showSearchButton,
  onSelectPost,
  selectedPostId: externalSelectedId,
  loading: areaSearchLoading,
  onScopedSearch,
}: {
  posts: PostRow[];
  userLocation?: [number, number] | null;
  onSearchThisArea?: (bounds: MapBounds) => void;
  showSearchButton?: boolean;
  onSelectPost?: (post: MapPost | null) => void;
  selectedPostId?: string | null;
  loading?: boolean;
  /** Keyword search within current map bounds */
  onScopedSearch?: (keyword: string, bounds: MapBounds) => void;
}) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    id: "gourmeet-google-maps",
  });

  const [mapMoved, setMapMoved] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<MapBounds | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const moveCountRef = useRef(0);
  const settledBoundsRef = useRef<string>("");
  const mapRef = useRef<google.maps.Map | null>(null);
  const prevPostsKeyRef = useRef<string>("");

  // In-map scoped search keyword
  const [scopedQ, setScopedQ] = useState("");

  // Use external selectedPostId if provided, else internal
  const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;

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

  const center = useMemo(() => {
    if (userLocation) return { lat: userLocation[0], lng: userLocation[1] };
    return { lat: 35.681236, lng: 139.767125 };
  }, [userLocation]);

  // Fit bounds to markers when posts change (include userLocation so it stays visible)
  const fitToMarkers = useCallback((postsToFit: MapPost[]) => {
    if (!mapRef.current || postsToFit.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    postsToFit.forEach((p) => bounds.extend({ lat: p.place_lat, lng: p.place_lng }));
    if (userLocation) bounds.extend({ lat: userLocation[0], lng: userLocation[1] });
    mapRef.current.fitBounds(bounds, { top: 40, bottom: 60, left: 30, right: 30 });
    // Prevent excessive zoom-out: cap at zoom 16 minimum
    const listener = google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
      if (mapRef.current) {
        const z = mapRef.current.getZoom();
        if (z !== undefined && z > 17) mapRef.current.setZoom(17);
      }
    });
    moveCountRef.current = 0;
    settledBoundsRef.current = "";
    setMapMoved(false);
  }, [userLocation]);

  useEffect(() => {
    if (mappablePosts.length === 0) return;
    const key = mappablePosts.map((p) => p.id).sort().join(",");
    if (key === prevPostsKeyRef.current) return;
    prevPostsKeyRef.current = key;
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
    if (!currentBounds) return;
    // マップ内バーにキーワードがあればスコープ検索、なければエリア全体検索
    if (scopedQ.trim() && onScopedSearch) {
      onScopedSearch(scopedQ.trim(), currentBounds);
    } else if (onSearchThisArea) {
      onSearchThisArea(currentBounds);
    }
    setMapMoved(false);
    settledBoundsRef.current = `${currentBounds.north.toFixed(4)}_${currentBounds.south.toFixed(4)}_${currentBounds.east.toFixed(4)}_${currentBounds.west.toFixed(4)}`;
  }, [currentBounds, onSearchThisArea, onScopedSearch, scopedQ]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (mappablePosts.length > 0) {
      setTimeout(() => fitToMarkers(mappablePosts), 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToMarkers]);

  const handlePinClick = useCallback((post: MapPost) => {
    const newId = selectedId === post.id ? null : post.id;
    setInternalSelectedId(newId);
    if (onSelectPost) {
      onSelectPost(newId ? post : null);
    }
  }, [selectedId, onSelectPost]);

  const handleMapClick = useCallback(() => {
    setInternalSelectedId(null);
    if (onSelectPost) onSelectPost(null);
  }, [onSelectPost]);

  const handleScopedSearch = useCallback(() => {
    if (!scopedQ.trim() || !currentBounds || !onScopedSearch) return;
    onScopedSearch(scopedQ.trim(), currentBounds);
  }, [scopedQ, currentBounds, onScopedSearch]);

  // Show "このエリアで検索" always, unless zoomed out too wide (> ~1.5° lat span ≈ Kanto)
  const isTooWide = currentBounds
    ? Math.abs(currentBounds.north - currentBounds.south) > 1.5
    : false;
  const showBtn = showSearchButton && onSearchThisArea && !areaSearchLoading && !isTooWide;

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
        zoom={userLocation ? 15 : 13}
        options={MAP_OPTIONS}
        onLoad={onMapLoad}
        onIdle={handleBoundsChanged}
        onClick={handleMapClick}
      >
        {userLocation && (
          <OverlayViewF
            position={{ lat: userLocation[0], lng: userLocation[1] }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div
              style={{
                transform: "translate(-50%, -50%)",
                position: "relative",
                width: 18,
                height: 18,
                pointerEvents: "none",
              }}
            >
              {/* Pulse ring */}
              <div
                style={{
                  position: "absolute",
                  inset: -6,
                  borderRadius: "50%",
                  backgroundColor: "rgba(59,130,246,0.2)",
                  animation: "gm-pulse 2s ease-out infinite",
                }}
              />
              {/* Core dot */}
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  backgroundColor: "#3b82f6",
                  border: "3px solid #ffffff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                }}
              />
              <style>{`@keyframes gm-pulse{0%{transform:scale(1);opacity:1}100%{transform:scale(2.8);opacity:0}}`}</style>
            </div>
          </OverlayViewF>
        )}

        {mappablePosts.map((p) => (
          <OverlayViewF
            key={p.id}
            position={{ lat: p.place_lat, lng: p.place_lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <CustomPin
              selected={selectedId === p.id}
              onClick={() => handlePinClick(p)}
            />
          </OverlayViewF>
        ))}
      </GoogleMap>

      {/* "Search this area" / loading button */}
      {(showBtn || areaSearchLoading) && (
        <button
          type="button"
          onClick={areaSearchLoading ? undefined : handleSearchThisArea}
          disabled={areaSearchLoading}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-lg border border-slate-200 hover:bg-slate-50 active:scale-[0.97] transition disabled:opacity-70"
        >
          {areaSearchLoading ? (
            <>
              <Loader2 size={13} className="text-slate-500 animate-spin" />
              {"\u691C\u7D22\u4E2D\u2026"}
            </>
          ) : (
            <>
              <Navigation size={13} className="text-slate-500" />
              {"\u3053\u306E\u30A8\u30EA\u30A2\u3067\u691C\u7D22"}
            </>
          )}
        </button>
      )}

      {/* In-map scoped keyword search bar */}
      {onScopedSearch && currentBounds && !isTooWide && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={scopedQ}
              onChange={(e) => setScopedQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleScopedSearch(); }}
              placeholder={"\u3053\u306E\u30A8\u30EA\u30A2\u3067\u30E9\u30FC\u30E1\u30F3\u3001\u30AB\u30D5\u30A7\u2026"}
              className="w-full rounded-full border border-slate-200 bg-white/95 backdrop-blur py-2 pl-8 pr-3 text-[13px] outline-none shadow-lg placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
              inputMode="search"
              enterKeyHint="search"
            />
          </div>
          {/* Post count badge */}
          {mappablePosts.length > 0 && (
            <div className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur px-2.5 py-2 text-[11px] font-medium text-slate-600 shadow border border-slate-100">
              <MapPin size={11} />
              {mappablePosts.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
