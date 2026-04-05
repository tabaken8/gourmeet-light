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

// ── Avatar Pin (overview mode) ──
function AvatarPin({
  person,
  onClick,
}: {
  person: PersonMapItem;
  onClick: () => void;
}) {
  const initial = (person.display_name || person.username || "U").slice(0, 1).toUpperCase();

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        transform: "translate(-50%, -50%)",
        cursor: "pointer",
        transition: "transform 0.2s ease, filter 0.2s ease",
        zIndex: 1,
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.25))",
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

// ── Post Pin (territory mode — tap to expand thumbnail card) ──
function PostPin({
  post,
  expanded,
  onTap,
}: {
  post: PersonMapItem["post_latlngs"][number];
  expanded: boolean;
  onTap: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      style={{
        transform: "translate(-50%, -100%)",
        cursor: "pointer",
        zIndex: expanded ? 90 : 50,
        filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
        transition: "z-index 0s",
      }}
    >
      {expanded ? (
        /* Expanded: thumbnail card */
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              backgroundColor: "white",
              borderRadius: 10,
              padding: "5px 8px 5px 5px",
              maxWidth: 180,
              border: "2px solid #f97316",
            }}
          >
            {post.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.image_url}
                alt=""
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  objectFit: "cover",
                  flexShrink: 0,
                }}
                loading="lazy"
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#1e293b",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {post.place_name}
              </div>
              {post.recommend_score != null && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "#f97316" }}>
                  {post.recommend_score.toFixed(1)}
                </div>
              )}
            </div>
          </div>
          {/* Arrow */}
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
      ) : (
        /* Collapsed: pin icon */
        <div>
          <div
            style={{
              width: 24,
              height: 32,
              position: "relative",
            }}
          >
            {/* Pin body */}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50% 50% 50% 0",
                backgroundColor: "#f97316",
                border: "2px solid white",
                transform: "rotate(-45deg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "white",
                  transform: "rotate(45deg)",
                }}
              />
            </div>
            {/* Pin shadow */}
            <div
              style={{
                width: 10,
                height: 4,
                borderRadius: "50%",
                backgroundColor: "rgba(0,0,0,0.15)",
                margin: "1px auto 0",
              }}
            />
          </div>
        </div>
      )}
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
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    id: "gourmeet-google-maps",
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const prevKeyRef = useRef<string>("");
  const [expandedPinIdx, setExpandedPinIdx] = useState<number | null>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleMapClick = useCallback(() => {
    setExpandedPinIdx(null);
    onSelectPerson(null);
  }, [onSelectPerson]);

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
        options={MAP_OPTIONS}
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
                onClick={() => onSelectPerson(person.user_id)}
              />
            </OverlayViewF>
          ))}

        {/* Territory: all post pins for selected person */}
        {selectedPerson?.post_latlngs.map((post, i) => (
          <OverlayViewF
            key={`pin-${i}`}
            position={{ lat: post.lat, lng: post.lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <PostPin
              post={post}
              expanded={expandedPinIdx === i}
              onTap={() => setExpandedPinIdx(expandedPinIdx === i ? null : i)}
            />
          </OverlayViewF>
        ))}
      </GoogleMap>
    </div>
  );
}
