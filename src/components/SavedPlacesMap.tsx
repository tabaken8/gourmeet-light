// components/SavedPlacesMap.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { ExternalLink, MapPin, RefreshCw } from "lucide-react";

type PlaceRow = {
  place_id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
};

type RawUserPlaceRow = {
  place_id: string;
  first_saved_at: string;
  last_saved_at: string;
  last_post_id: string | null;
  last_collection_id: string | null;

  // Supabaseの埋め込みは環境によって「配列/単体/別名」になり得るので全部吸収
  places?: PlaceRow[] | PlaceRow | null;
  place?: PlaceRow[] | PlaceRow | null;
};

type NormalizedRow = Omit<RawUserPlaceRow, "places" | "place"> & {
  place: PlaceRow | null;
};

declare global {
  interface Window {
    google?: any;
  }
}

function escapeHtml(str: string) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildGoogleMapsUrl(placeId: string, name?: string | null) {
  const q = name?.trim() ? name.trim() : placeId;
  return (
    "https://www.google.com/maps/search/?api=1" +
    `&query=${encodeURIComponent(q)}` +
    `&query_place_id=${encodeURIComponent(placeId)}`
  );
}

function loadGoogleMapsScript(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gm="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("failed to load")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.gm = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("failed to load Google Maps"));
    document.head.appendChild(script);
  });
}

function normalizePlace(x: PlaceRow[] | PlaceRow | null | undefined): PlaceRow | null {
  if (!x) return null;
  if (Array.isArray(x)) return x[0] ?? null;
  return x;
}

export default function SavedPlacesMap() {
  const supabase = createClientComponentClient();

  const [rawRows, setRawRows] = useState<RawUserPlaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // Map DOM
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const placeIdToMarkerRef = useRef<Map<string, any>>(new Map());

  const rows: NormalizedRow[] = useMemo(() => {
    return rawRows.map((r) => {
      const p = normalizePlace(r.place ?? r.places);
      return { ...r, place: p };
    });
  }, [rawRows]);

  const mappable = useMemo(() => {
    return rows.filter((r) => r.place?.lat != null && r.place?.lng != null);
  }, [rows]);

  const sortedList = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ta = new Date(a.last_saved_at).getTime();
      const tb = new Date(b.last_saved_at).getTime();
      return tb - ta;
    });
  }, [rows]);

  const fetchSaved = async () => {
    setError(null);
    setLoading(true);

    const {
      data: { session },
      error: sessErr,
    } = await supabase.auth.getSession();

    if (sessErr) {
      setError("セッション取得に失敗しました");
      setLoading(false);
      return;
    }
    if (!session?.user) {
      setError("ログインが必要です");
      setLoading(false);
      return;
    }

    // ✅ ここが型エラーの原因だったので、返り値が配列でも吸収できるように RawUserPlaceRow にする
    // もし relationship 名が違ってエラーになる場合は "places(...)" を "place:places(...)" に変えてね（下に補足あり）
    const { data, error: qErr } = await supabase
      .from("user_places")
      .select(
        "place_id, first_saved_at, last_saved_at, last_post_id, last_collection_id, places(place_id, name, address, lat, lng, photo_url)"
      )
      .order("last_saved_at", { ascending: false });

    if (qErr) {
      setError(qErr.message);
      setLoading(false);
      return;
    }

    setRawRows((data ?? []) as RawUserPlaceRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!apiKey) {
      setMapReady(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMapsScript(apiKey);
        if (cancelled) return;
        setMapReady(true);
      } catch {
        if (cancelled) return;
        setError("Google Maps の読み込みに失敗しました（APIキーを確認してね）");
        setMapReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // マーカー描画
  useEffect(() => {
    if (!mapReady) return;
    if (!mapDivRef.current) return;

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: 35.681236, lng: 139.767125 }, // 仮：東京駅
        zoom: 12,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
      infoWindowRef.current = new window.google.maps.InfoWindow();
    }

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    placeIdToMarkerRef.current.clear();

    if (mappable.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();

    mappable.forEach((r) => {
      const p = r.place!;
      const pos = { lat: p.lat!, lng: p.lng! };

      const marker = new window.google.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: p.name ?? "Saved Place",
      });

      marker.addListener("click", () => {
        const html = `
          <div style="max-width:240px;">
            <div style="font-weight:600; font-size:14px; margin-bottom:6px;">
              ${escapeHtml(p.name ?? "Saved Place")}
            </div>
            <div style="font-size:12px; color:rgba(0,0,0,0.7); margin-bottom:10px;">
              ${escapeHtml(p.address ?? "")}
            </div>
            <a href="${buildGoogleMapsUrl(p.place_id, p.name)}"
               target="_blank" rel="noreferrer"
               style="font-size:12px; text-decoration:underline;">
              Google Mapsで開く
            </a>
          </div>
        `;
        infoWindowRef.current.setContent(html);
        infoWindowRef.current.open(mapRef.current, marker);
      });

      markersRef.current.push(marker);
      placeIdToMarkerRef.current.set(p.place_id, marker);
      bounds.extend(pos);
    });

    mapRef.current.fitBounds(bounds, 60);
  }, [mapReady, mappable]);

  const focusPlace = (placeId: string) => {
    const marker = placeIdToMarkerRef.current.get(placeId);
    const r = rows.find((x) => x.place_id === placeId);
    const p = r?.place;
    if (!marker || !mapRef.current || !infoWindowRef.current || !p) return;

    mapRef.current.panTo(marker.getPosition());
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() ?? 14, 15));

    const html = `
      <div style="max-width:240px;">
        <div style="font-weight:600; font-size:14px; margin-bottom:6px;">
          ${escapeHtml(p.name ?? "Saved Place")}
        </div>
        <div style="font-size:12px; color:rgba(0,0,0,0.7); margin-bottom:10px;">
          ${escapeHtml(p.address ?? "")}
        </div>
        <a href="${buildGoogleMapsUrl(p.place_id, p.name)}"
           target="_blank" rel="noreferrer"
           style="font-size:12px; text-decoration:underline;">
          Google Mapsで開く
        </a>
      </div>
    `;
    infoWindowRef.current.setContent(html);
    infoWindowRef.current.open(mapRef.current, marker);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      {/* 左：リスト */}
      <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">保存した場所</div>
          <button
            type="button"
            onClick={fetchSaved}
            className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs hover:bg-black/5"
          >
            <RefreshCw className="h-4 w-4" />
            更新
          </button>
        </div>

        {error && (
          <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {!apiKey && (
          <div className="mb-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が未設定です（地図が表示できません）
          </div>
        )}

        {loading ? (
          <div className="py-6 text-center text-sm text-black/50">読み込み中...</div>
        ) : sortedList.length === 0 ? (
          <div className="py-6 text-center text-sm text-black/50">まだ保存がありません。</div>
        ) : (
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {sortedList.map((r) => {
              const p = r.place;
              const name = p?.name ?? r.place_id;
              const address = p?.address ?? "";

              return (
                <div
                  key={r.place_id}
                  className="rounded-xl border border-black/10 p-3 hover:bg-black/5"
                >
                  <button type="button" onClick={() => focusPlace(r.place_id)} className="w-full text-left">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-orange-500" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{name}</div>
                        {address && (
                          <div className="mt-0.5 line-clamp-2 text-xs text-black/60">{address}</div>
                        )}
                        <div className="mt-1 text-[11px] text-black/40">
                          最終保存: {new Date(r.last_saved_at).toLocaleString("ja-JP")}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="mt-2 flex items-center gap-2">
                    <a
                      href={buildGoogleMapsUrl(r.place_id, p?.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Googleで開く
                    </a>

                    {/* あなたのルーティングに合わせて調整してね */}
                    {r.last_post_id && (
                      <Link
                        href={`/post/${r.last_post_id}`}
                        className="rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-white"
                      >
                        投稿へ
                      </Link>
                    )}
                  </div>

                  {/* place がまだ埋まってない（lat/lng無し）場合のヒント */}
                  {(!p || p.lat == null || p.lng == null) && (
                    <div className="mt-2 text-[11px] text-black/40">
                      ※ この場所はまだ座標が未取得なので、地図には表示されません（places の upsert を確認）
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 右：Map */}
      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <div className="text-sm font-semibold">Map</div>
          <div className="text-xs text-black/50">{mappable.length} pins</div>
        </div>

        <div className="h-[65vh] w-full" ref={mapDivRef} />
      </div>
    </div>
  );
}
