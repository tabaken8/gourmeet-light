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

// ── Avatar Pin ──
function AvatarPin({
  person,
  selected,
  onClick,
}: {
  person: PersonMapItem;
  selected: boolean;
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
        transform: `translate(-50%, -50%) scale(${selected ? 1.2 : 1})`,
        cursor: "pointer",
        transition: "transform 0.2s ease, filter 0.2s ease",
        zIndex: selected ? 100 : 1,
        filter: selected
          ? "drop-shadow(0 2px 8px rgba(234,88,12,0.5))"
          : "drop-shadow(0 1px 3px rgba(0,0,0,0.25))",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: selected ? "3px solid #f97316" : "3px solid white",
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

      {/* Post count badge */}
      <div
        style={{
          position: "absolute",
          bottom: -2,
          right: -4,
          backgroundColor: selected ? "#ea580c" : "#64748b",
          color: "white",
          fontSize: 9,
          fontWeight: 700,
          borderRadius: 8,
          padding: "1px 4px",
          minWidth: 16,
          textAlign: "center",
          border: "2px solid white",
          lineHeight: "12px",
        }}
      >
        {person.post_count}
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
  /** User's own specialty centroid for initial view. Null → fit all people or default Tokyo. */
  initialCenter?: { lat: number; lng: number } | null;
}) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    id: "gourmeet-google-maps",
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const prevKeyRef = useRef<string>("");

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleMapClick = useCallback(() => {
    onSelectPerson(null);
  }, [onSelectPerson]);

  // Fit map to initial view: user's centroid region or densest cluster of people
  const fitToPeople = useCallback((ppl: PersonMapItem[]) => {
    if (!mapRef.current || ppl.length === 0) return;

    // If we have the user's own centroid, center on that area and zoom to show nearby people
    if (initialCenter) {
      mapRef.current.setCenter(initialCenter);
      mapRef.current.setZoom(13);
      return;
    }

    // No user centroid → fit to the densest cluster of people
    if (ppl.length === 1) {
      mapRef.current.setCenter({ lat: ppl[0].centroid_lat, lng: ppl[0].centroid_lng });
      mapRef.current.setZoom(14);
      return;
    }

    // Find densest cluster of people centroids (grid ~50km)
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
      // Include adjacent cells
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

  // Pan to selected person
  useEffect(() => {
    if (!selectedUserId || !mapRef.current) return;
    const person = people.find((p) => p.user_id === selectedUserId);
    if (!person) return;
    mapRef.current.panTo({ lat: person.centroid_lat, lng: person.centroid_lng });
  }, [selectedUserId, people]);

  const center = useMemo(() => {
    if (initialCenter) return initialCenter;
    if (people.length > 0) return { lat: people[0].centroid_lat, lng: people[0].centroid_lng };
    return { lat: 35.681236, lng: 139.767125 }; // Tokyo Station default
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
        {people.map((person) => (
          <OverlayViewF
            key={person.user_id}
            position={{ lat: person.centroid_lat, lng: person.centroid_lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <AvatarPin
              person={person}
              selected={selectedUserId === person.user_id}
              onClick={() => onSelectPerson(person.user_id)}
            />
          </OverlayViewF>
        ))}
      </GoogleMap>
    </div>
  );
}
