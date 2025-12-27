"use client";

import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";

type Item = {
  id: string;
  headline: string;
  reason: string;
  lat: number;
  lng: number;
};

// ✅ ここが重要：コンポーネント外（ファイルスコープ）で定義する
const DEFAULT_MARKER_ICON = L.icon({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitToMarkers({ items }: { items: Item[] }) {
  const map = useMap();

  useEffect(() => {
    if (!items.length) return;
    const bounds = L.latLngBounds(
      items.map((i) => [i.lat, i.lng] as [number, number])
    );
    map.fitBounds(bounds.pad(0.25));
  }, [items, map]);

  return null;
}

function CenterToSelected({ selected }: { selected: Item | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selected) return;
    map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 13), {
      animate: true,
    });
  }, [selected, map]);

  return null;
}

export default function RecommendMap({
  items,
  selectedId,
  onSelect,
}: {
  items: Item[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  // 東京中心（初期表示）
  const center: [number, number] = [35.681236, 139.767125];

  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitToMarkers items={items} />
      <CenterToSelected selected={selected} />

      {items.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={DEFAULT_MARKER_ICON}
          eventHandlers={{
            click: () => onSelect(p.id),
          }}
        >
          <Popup>
            <div className="text-sm font-semibold">{p.headline}</div>
            <div className="mt-1 text-xs text-gray-600">{p.reason}</div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
