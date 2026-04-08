// src/components/discover/PeopleMap.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  OverlayViewF,
  OverlayView,
} from "@react-google-maps/api";
import type { PersonMapItem } from "@/app/api/people-map/route";
import Link from "next/link";
import { useTheme } from "@/components/providers/ThemeProvider";

// ── shared map options (without styles — those are theme-dependent) ──
const BASE_MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 3 /* RIGHT_TOP */ },
  gestureHandling: "greedy",
  clickableIcons: false,
};

const LIGHT_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#64779e" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#023e58" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
  { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#3C7680" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#255763" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#b0d5ce" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#023e58" }] },
  { featureType: "transit", stylers: [{ color: "#146474" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "transit", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#132f47" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] },
];

const MAP_CONTAINER: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 12,
};

// ── Avatar Pin (overview mode) ──
function AvatarPin({
  person,
  onClick,
  onInteractionStart,
}: {
  person: PersonMapItem;
  onClick: () => void;
  onInteractionStart: () => void;
}) {
  const initial = (person.display_name || person.username || "U").slice(0, 1).toUpperCase();

  return (
    <div
      onPointerDown={onInteractionStart}
      onTouchStart={onInteractionStart}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        transform: "translate(-50%, -50%)",
        cursor: "pointer",
        transition: "transform 0.2s ease, filter 0.2s ease",
        zIndex: 1,
        /* invisible padding for larger touch target (44 + 20*2 = 84px) */
        padding: 20,
        margin: -20,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "3px solid white",
          overflow: "hidden",
          backgroundColor: "#fed7aa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.25))",
        }}
      >
        {person.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.avatar_url}
            alt={person.display_name || ""}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#c2410c",
            }}
          >
            {initial}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Post Pin (territory mode — avatar icon, tap to expand thumbnail card) ──
function PostPin({
  post,
  expanded,
  onTap,
  avatarUrl,
  displayName,
  onInteractionStart,
}: {
  post: PersonMapItem["post_latlngs"][number];
  expanded: boolean;
  onTap: () => void;
  avatarUrl: string | null;
  displayName: string | null;
  onInteractionStart: () => void;
}) {
  const initial = (displayName || "U").slice(0, 1).toUpperCase();

  return (
    <div
      onPointerDown={onInteractionStart}
      onTouchStart={onInteractionStart}
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      style={{
        /* avatar always centered on the lat/lng anchor */
        transform: "translate(-50%, -50%)",
        cursor: "pointer",
        zIndex: expanded ? 90 : 50,
        /* fixed size = avatar only; card floats above via absolute */
        width: 72,
        height: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* Expanded: thumbnail card floats above the avatar */}
      {expanded && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: -2,
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
          }}
        >
          {(() => {
            const cardContent = (
              <div className="flex items-center gap-2.5 rounded-xl border-2 border-orange-500 bg-white dark:bg-[#1e2026] px-2 py-1.5 max-w-[220px]">
                {post.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.image_url}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[13px] font-bold leading-tight text-slate-800 dark:text-gray-100">
                    {post.place_name}
                  </div>
                  {post.recommend_score != null && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-[12px] font-bold text-orange-600 dark:text-orange-400">
                      ★ {post.recommend_score.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            );

            return post.post_id ? (
              <Link
                href={`/posts/${post.post_id}`}
                onClick={(e) => e.stopPropagation()}
              >
                {cardContent}
              </Link>
            ) : (
              cardContent
            );
          })()}
          {/* Arrow pointing down to avatar */}
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderTop: "7px solid #f97316",
              margin: "0 auto",
            }}
          />
        </div>
      )}
      {/* Avatar icon (always centered, never moves) */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: expanded ? "3px solid #f97316" : "2.5px solid white",
          overflow: "hidden",
          backgroundColor: "#fed7aa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={displayName || ""}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#c2410c",
            }}
          >
            {initial}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ──
export default function PeopleMap({
  people,
  selectedUserId,
  onSelectPerson,
  initialCenter,
}: {
  people: PersonMapItem[];
  selectedUserId: string | null;
  onSelectPerson: (userId: string | null) => void;
  initialCenter?: { lat: number; lng: number } | null;
}) {
  const { resolved: theme } = useTheme();
  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({ ...BASE_MAP_OPTIONS, styles: theme === "dark" ? DARK_STYLES : LIGHT_STYLES }),
    [theme],
  );

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    id: "gourmeet-google-maps",
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const prevKeyRef = useRef<string>("");
  const [expandedPinIdx, setExpandedPinIdx] = useState<number | null>(null);
  // Guard: suppress map click that fires right after a pin tap (mobile touch)
  const pinTappedRef = useRef(false);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Update map styles when theme changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setOptions({ styles: theme === "dark" ? DARK_STYLES : LIGHT_STYLES });
    }
  }, [theme]);

  const handleMapClick = useCallback(() => {
    if (pinTappedRef.current) {
      pinTappedRef.current = false;
      return; // ignore — this click was caused by a pin tap
    }
    setExpandedPinIdx(null);
    onSelectPerson(null);
  }, [onSelectPerson]);

  const markPinTapped = useCallback(() => {
    pinTappedRef.current = true;
    // Reset after a short delay in case handleMapClick doesn't fire
    setTimeout(() => { pinTappedRef.current = false; }, 300);
  }, []);

  const selectedPerson = useMemo(
    () => (selectedUserId ? people.find((p) => p.user_id === selectedUserId) ?? null : null),
    [selectedUserId, people],
  );

  const fitToPeople = useCallback((ppl: PersonMapItem[]) => {
    if (!mapRef.current || ppl.length === 0) return;

    if (initialCenter) {
      mapRef.current.setCenter(initialCenter);
      mapRef.current.setZoom(13);
      return;
    }

    if (ppl.length === 1) {
      mapRef.current.setCenter({ lat: ppl[0].centroid_lat, lng: ppl[0].centroid_lng });
      mapRef.current.setZoom(14);
      return;
    }

    const CELL = 0.5;
    const cells = new Map<string, PersonMapItem[]>();
    for (const p of ppl) {
      const key = `${Math.floor(p.centroid_lat / CELL)},${Math.floor(p.centroid_lng / CELL)}`;
      const arr = cells.get(key) ?? [];
      arr.push(p);
      cells.set(key, arr);
    }
    let bestCell: PersonMapItem[] = ppl;
    let bestCount = 0;
    for (const [ck, arr] of cells) {
      const [cy, cx] = ck.split(",").map(Number);
      const nearby: PersonMapItem[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nk = `${cy + dy},${cx + dx}`;
          const c = cells.get(nk);
          if (c) nearby.push(...c);
        }
      }
      if (nearby.length > bestCount) {
        bestCount = nearby.length;
        bestCell = nearby;
      }
    }

    const bounds = new google.maps.LatLngBounds();
    bestCell.forEach((p) => bounds.extend({ lat: p.centroid_lat, lng: p.centroid_lng }));
    mapRef.current.fitBounds(bounds, { top: 40, bottom: 40, left: 30, right: 30 });

    google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
      if (mapRef.current) {
        const z = mapRef.current.getZoom();
        if (z !== undefined && z > 15) mapRef.current.setZoom(15);
      }
    });
  }, [initialCenter]);

  useEffect(() => {
    if (people.length === 0) return;
    const key = people.map((p) => p.user_id).sort().join(",");
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    const t = setTimeout(() => fitToPeople(people), 100);
    return () => clearTimeout(t);
  }, [people, fitToPeople]);

  // Reset expanded pin when person changes
  useEffect(() => {
    setExpandedPinIdx(null);
  }, [selectedUserId]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!selectedPerson) {
      fitToPeople(people);
      return;
    }

    if (selectedPerson.bounds) {
      const bounds = new google.maps.LatLngBounds(
        selectedPerson.bounds.sw,
        selectedPerson.bounds.ne,
      );
      mapRef.current.fitBounds(bounds, { top: 50, bottom: 50, left: 40, right: 40 });

      google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
        if (mapRef.current) {
          const z = mapRef.current.getZoom();
          if (z !== undefined && z > 16) mapRef.current.setZoom(16);
        }
      });
    } else {
      mapRef.current.panTo({ lat: selectedPerson.centroid_lat, lng: selectedPerson.centroid_lng });
    }
  }, [selectedPerson, people, fitToPeople]);

  const center = useMemo(() => {
    if (initialCenter) return initialCenter;
    if (people.length > 0) return { lat: people[0].centroid_lat, lng: people[0].centroid_lng };
    return { lat: 35.681236, lng: 139.767125 };
  }, [people, initialCenter]);

  if (!isLoaded) {
    return (
      <div
        className="relative w-full flex items-center justify-center bg-slate-100 dark:bg-[#1e2026] rounded-xl"
        style={{ height: "40vh", minHeight: 240 }}
      >
        <div className="text-sm text-slate-400 dark:text-gray-500">地図を読み込み中…</div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height: "40vh", minHeight: 240 }}>
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER}
        center={center}
        zoom={13}
        options={mapOptions}
        onLoad={onMapLoad}
        onClick={handleMapClick}
      >
        {/* Overview: avatar pins (hidden when someone is selected) */}
        {!selectedUserId &&
          people.map((person) => (
            <OverlayViewF
              key={person.user_id}
              position={{ lat: person.centroid_lat, lng: person.centroid_lng }}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <AvatarPin
                person={person}
                onInteractionStart={markPinTapped}
                onClick={() => onSelectPerson(person.user_id)}
              />
            </OverlayViewF>
          ))}

        {/* Territory: all post pins for selected person (avatar icons) */}
        {selectedPerson?.post_latlngs.map((post, i) => (
          <OverlayViewF
            key={`pin-${i}`}
            position={{ lat: post.lat, lng: post.lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <PostPin
              post={post}
              expanded={expandedPinIdx === i}
              onInteractionStart={markPinTapped}
              onTap={() => setExpandedPinIdx(expandedPinIdx === i ? null : i)}
              avatarUrl={selectedPerson.avatar_url}
              displayName={selectedPerson.display_name}
            />
          </OverlayViewF>
        ))}
      </GoogleMap>
    </div>
  );
}
