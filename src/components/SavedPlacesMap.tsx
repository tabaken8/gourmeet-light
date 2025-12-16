// components/SavedPlacesMap.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { ExternalLink, RefreshCw, Trash2, X } from "lucide-react";

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
  places?: PlaceRow[] | PlaceRow | null;
  place?: PlaceRow[] | PlaceRow | null;
};

type NormalizedRow = Omit<RawUserPlaceRow, "places" | "place"> & {
  place: PlaceRow | null;
};

type CollectionRow = { id: string; name: string };

type UserPlacePinRow = {
  place_id: string;
  emoji: string | null;
};

type SuggestTypeResponse = {
  ok: boolean;
  suggestion?: { emoji: string; key: string; matchedType?: string; source?: string } | null;
  suggestedEmoji?: string | null;
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
      existing.addEventListener("error", () => reject(new Error("failed to load")), { once: true });
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

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition",
        active ? "bg-orange-600 text-white" : "bg-black/[.04] text-black/70 hover:bg-black/[.06]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** ✅ 絵文字ピンSVGアイコン（fail safe: emoji未設定でも📍） */
function makeEmojiSvgDataUrl(emoji: string) {
  const e = (emoji || "📍").slice(0, 4);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
    <defs>
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.25)"/>
      </filter>
    </defs>
    <g filter="url(#s)">
      <circle cx="24" cy="24" r="18" fill="white" stroke="rgba(0,0,0,0.15)" stroke-width="2"/>
      <text x="24" y="30" text-anchor="middle" font-size="18"
        font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${escapeHtml(
          e
        )}</text>
    </g>
  </svg>`;
  const encoded = encodeURIComponent(svg).replaceAll("'", "%27").replaceAll('"', "%22");
  return `data:image/svg+xml;charset=UTF-8,${encoded}`;
}

const EMOJI_PRESETS: { label: string; emojis: string[] }[] = [
  {
    label: "食ジャンル",
    emojis: ["🍜", "🍣", "🍛", "🥟", "🍔", "🍕", "🥩", "🍗", "🐟", "🥗", "🍱", "🍝", "🌮", "🧁", "🍰"],
  },
  { label: "飲み・カフェ", emojis: ["☕️", "🍵", "🥤", "🍺", "🍷", "🍸", "🍶"] },
  { label: "気分・目印", emojis: ["📍", "⭐️", "❤️", "🔥", "✅", "💡", "🎯", "🕒", "💰", "🚶"] },
];

export default function SavedPlacesMap() {
  const supabase = createClientComponentClient();

  const [rawRows, setRawRows] = useState<RawUserPlaceRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [placeToCollectionIds, setPlaceToCollectionIds] = useState<Map<string, Set<string>>>(
    new Map()
  );

  // ✅ place_id -> emoji（ユーザーが明示設定したもの）
  const [placeToEmoji, setPlaceToEmoji] = useState<Map<string, string>>(new Map());

  // ✅ place_id -> suggestedEmoji（Googleのsuggest）
  const [placeToSuggestedEmoji, setPlaceToSuggestedEmoji] = useState<Map<string, string>>(new Map());

  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null); // null=All
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<{
    open: boolean;
    placeId: string | null;
    placeName: string | null;
  }>({ open: false, placeId: null, placeName: null });

  // ✅ 絵文字ピッカー
  const [emojiPicker, setEmojiPicker] = useState<{
    open: boolean;
    placeId: string | null;
    placeName: string | null;
    currentEmoji: string;
  }>({ open: false, placeId: null, placeName: null, currentEmoji: "📍" });

  const [customEmoji, setCustomEmoji] = useState<string>("");
  const [savingEmoji, setSavingEmoji] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // 現在ユーザー（ピン変更時にも使う）
  const [userId, setUserId] = useState<string | null>(null);

  // Map DOM
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const placeIdToMarkerRef = useRef<Map<string, any>>(new Map());

  // suggest-type の同時リクエスト制御
  const suggestInFlightRef = useRef<Map<string, Promise<string>>>(new Map());

  const rows: NormalizedRow[] = useMemo(() => {
    return rawRows.map((r) => {
      const p = normalizePlace(r.place ?? r.places);
      return { ...r, place: p };
    });
  }, [rawRows]);

  const filteredRows = useMemo(() => {
    if (!activeCollectionId) return rows; // All
    return rows.filter((r) => placeToCollectionIds.get(r.place_id)?.has(activeCollectionId));
  }, [rows, activeCollectionId, placeToCollectionIds]);

  const mappable = useMemo(() => {
    return filteredRows.filter((r) => r.place?.lat != null && r.place?.lng != null);
  }, [filteredRows]);

  const sortedList = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const ta = new Date(a.last_saved_at).getTime();
      const tb = new Date(b.last_saved_at).getTime();
      return tb - ta;
    });
  }, [filteredRows]);

  /** ✅ 表示用絵文字：ユーザー設定 > Googleサジェスト > デフォルト */
  const getEmoji = (placeId: string) => {
    const userE = placeToEmoji.get(placeId);
    if (userE && userE.trim()) return userE;

    const sugE = placeToSuggestedEmoji.get(placeId);
    if (sugE && sugE.trim()) return sugE;

    return "📍";
  };

  const buildMapping = async (uid: string) => {
    const { data: cols, error: cErr } = await supabase
      .from("collections")
      .select("id, name")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });

    if (cErr) throw new Error(cErr.message);
    const colList = (cols ?? []) as CollectionRow[];
    setCollections(colList);

    if (colList.length === 0) {
      setPlaceToCollectionIds(new Map());
      return;
    }

    const colIds = colList.map((c) => c.id);

    const { data: pcs, error: pcErr } = await supabase
      .from("post_collections")
      .select("collection_id, post_id")
      .in("collection_id", colIds);

    if (pcErr) throw new Error(pcErr.message);

    const pcRows = (pcs ?? []) as { collection_id: string; post_id: string }[];
    const postIds = Array.from(new Set(pcRows.map((x) => x.post_id)));
    if (postIds.length === 0) {
      setPlaceToCollectionIds(new Map());
      return;
    }

    const { data: posts, error: pErr } = await supabase
      .from("posts")
      .select("id, place_id")
      .in("id", postIds);

    if (pErr) throw new Error(pErr.message);

    const postIdToPlaceId = new Map<string, string>();
    (posts ?? []).forEach((p: any) => {
      if (p?.id && p?.place_id) postIdToPlaceId.set(p.id, p.place_id);
    });

    const map = new Map<string, Set<string>>();
    for (const x of pcRows) {
      const placeId = postIdToPlaceId.get(x.post_id);
      if (!placeId) continue;
      if (!map.has(placeId)) map.set(placeId, new Set());
      map.get(placeId)!.add(x.collection_id);
    }
    setPlaceToCollectionIds(map);
  };

  // ✅ user_place_pins をまとめて引く（失敗してもUIは壊さない）
  const fetchPins = async (uid: string, placeIds: string[]) => {
    try {
      if (placeIds.length === 0) {
        setPlaceToEmoji(new Map());
        return;
      }

      const uniq = Array.from(new Set(placeIds)).filter(Boolean);
      const CHUNK = 100;
      const map = new Map<string, string>();

      for (let i = 0; i < uniq.length; i += CHUNK) {
        const chunk = uniq.slice(i, i + CHUNK);
        const { data, error: pErr } = await supabase
          .from("user_place_pins")
          .select("place_id, emoji")
          .eq("user_id", uid)
          .in("place_id", chunk);

        if (pErr) {
          console.warn("[user_place_pins] fetch failed:", pErr.message);
          continue;
        }

        (data ?? []).forEach((r: any) => {
          const row = r as UserPlacePinRow;
          if (row.place_id) map.set(row.place_id, (row.emoji ?? "").toString());
        });
      }

      // 空文字は持たない
      const cleaned = new Map<string, string>();
      map.forEach((v, k) => {
        const t = (v ?? "").trim();
        if (t) cleaned.set(k, t);
      });

      setPlaceToEmoji(cleaned);
    } catch (e) {
      console.warn("[user_place_pins] fetch exception:", e);
      setPlaceToEmoji(new Map());
    }
  };

  /** ✅ Googleサジェスト絵文字（未設定のやつだけ） */
  const fetchSuggestedEmojiOne = async (placeId: string): Promise<string> => {
    // すでにユーザー設定があるなら不要
    if (placeToEmoji.get(placeId)) return "";

    // すでに持ってるならそれ
    const existing = placeToSuggestedEmoji.get(placeId);
    if (existing) return existing;

    // in-flight 共有
    const inflight = suggestInFlightRef.current.get(placeId);
    if (inflight) return inflight;

    const p = (async () => {
      try {
        const res = await fetch("/api/places/suggest-type", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId }),
        });

        if (!res.ok) return "";
        const j = (await res.json().catch(() => null)) as SuggestTypeResponse | null;

        const emoji =
          (j?.suggestion?.emoji ?? j?.suggestedEmoji ?? "").toString().trim();

        if (!emoji) return "";

        // 保存（ユーザー設定が後で入っても getEmoji が優先してくれる）
        setPlaceToSuggestedEmoji((prev) => {
          const next = new Map(prev);
          if (!next.has(placeId)) next.set(placeId, emoji);
          return next;
        });

        return emoji;
      } catch {
        return "";
      } finally {
        suggestInFlightRef.current.delete(placeId);
      }
    })();

    suggestInFlightRef.current.set(placeId, p);
    return p;
  };

  const fetchSuggestedEmojis = async (placeIds: string[]) => {
    // placeToEmoji（ユーザー確定）が無いものだけ
    const targets = placeIds.filter((pid) => {
      if (!pid) return false;
      if (placeToEmoji.get(pid)) return false;
      if (placeToSuggestedEmoji.get(pid)) return false;
      return true;
    });

    if (targets.length === 0) return;

    // 同時投げすぎ防止：小さめ並列
    const CONCURRENCY = 6;
    let idx = 0;

    const workers = Array.from({ length: CONCURRENCY }).map(async () => {
      while (idx < targets.length) {
        const i = idx++;
        const pid = targets[i];
        await fetchSuggestedEmojiOne(pid);
      }
    });

    await Promise.all(workers);
  };

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

    const uid = session.user.id;
    setUserId(uid);

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

    const rows = (data ?? []) as RawUserPlaceRow[];
    setRawRows(rows);

    const placeIds = rows.map((r) => r.place_id).filter(Boolean);

    // 1) 明示ピン（ユーザー設定）
    await fetchPins(uid, placeIds);

    // 2) Googleサジェスト（未設定のやつだけ）※失敗してもOK
    // fetchPins 後に回すのがポイント（優先順位が明確になる）
    await fetchSuggestedEmojis(placeIds);

    // 3) collectionフィルタ
    try {
      await buildMapping(uid);
    } catch (e: any) {
      setError(e?.message ?? "フィルタ情報の取得に失敗しました");
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google Maps load
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

  // markers（emoji反映）
  useEffect(() => {
    if (!mapReady) return;
    if (!mapDivRef.current) return;

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: 35.681236, lng: 139.767125 },
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

      const emoji = getEmoji(p.place_id);
      const iconUrl = makeEmojiSvgDataUrl(emoji);

      const marker = new window.google.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: `${emoji} ${p.name ?? "Saved Place"}`,
        icon: {
          url: iconUrl,
          scaledSize: new window.google.maps.Size(40, 40),
          anchor: new window.google.maps.Point(20, 20),
        },
      });

      marker.addListener("click", () => {
        const html = `
          <div style="max-width:240px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <div style="width:28px; height:28px; border-radius:14px; border:1px solid rgba(0,0,0,0.12); display:flex; align-items:center; justify-content:center; background:white;">
                ${escapeHtml(emoji)}
              </div>
              <div style="font-weight:600; font-size:14px;">
                ${escapeHtml(p.name ?? "Saved Place")}
              </div>
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
  }, [mapReady, mappable, placeToEmoji, placeToSuggestedEmoji]); // ✅ suggested でも更新

  const focusPlace = (placeId: string) => {
    const marker = placeIdToMarkerRef.current.get(placeId);
    const r = filteredRows.find((x) => x.place_id === placeId);
    const p = r?.place;
    if (!marker || !mapRef.current || !infoWindowRef.current || !p) return;

    mapRef.current.panTo(marker.getPosition());
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() ?? 14, 15));

    const emoji = getEmoji(placeId);

    const html = `
      <div style="max-width:240px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <div style="width:28px; height:28px; border-radius:14px; border:1px solid rgba(0,0,0,0.12); display:flex; align-items:center; justify-content:center; background:white;">
            ${escapeHtml(emoji)}
          </div>
          <div style="font-weight:600; font-size:14px;">
            ${escapeHtml(p.name ?? "Saved Place")}
          </div>
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

  // ===== 絵文字ピン 更新（upsert / delete） =====

  const openEmojiPicker = (placeId: string, placeName: string | null) => {
    const cur = getEmoji(placeId);
    setCustomEmoji("");
    setEmojiPicker({ open: true, placeId, placeName, currentEmoji: cur });
  };

  const closeEmojiPicker = () => {
    setEmojiPicker({ open: false, placeId: null, placeName: null, currentEmoji: "📍" });
    setCustomEmoji("");
    setSavingEmoji(false);
  };

  const applyEmojiLocal = (placeId: string, emoji: string | null) => {
    setPlaceToEmoji((prev) => {
      const next = new Map(prev);
      if (!emoji || !emoji.trim()) next.delete(placeId);
      else next.set(placeId, emoji);
      return next;
    });
  };

  const setEmojiForPlace = async (placeId: string, emoji: string) => {
    const e = (emoji || "📍").trim();
    if (!placeId) return;

    setError(null);
    setSavingEmoji(true);

    const prev = placeToEmoji.get(placeId) ?? null;

    applyEmojiLocal(placeId, e);

    try {
      const uid = userId;
      if (!uid) throw new Error("ログイン情報がありません");

      const { error: upErr } = await supabase
        .from("user_place_pins")
        .upsert({ user_id: uid, place_id: placeId, emoji: e }, { onConflict: "user_id,place_id" });

      if (upErr) throw new Error(upErr.message);

      setEmojiPicker((s) => ({ ...s, currentEmoji: e }));
    } catch (err: any) {
      // revert
      applyEmojiLocal(placeId, prev);
      setError(err?.message ?? "絵文字の保存に失敗しました");
    } finally {
      setSavingEmoji(false);
    }
  };

  const resetEmojiForPlace = async (placeId: string) => {
    if (!placeId) return;

    setError(null);
    setSavingEmoji(true);

    const prev = placeToEmoji.get(placeId) ?? null;

    applyEmojiLocal(placeId, null);

    try {
      const uid = userId;
      if (!uid) throw new Error("ログイン情報がありません");

      const { error: delErr } = await supabase
        .from("user_place_pins")
        .delete()
        .eq("user_id", uid)
        .eq("place_id", placeId);

      if (delErr) throw new Error(delErr.message);

      setEmojiPicker((s) => ({ ...s, currentEmoji: getEmoji(placeId) }));
    } catch (err: any) {
      // revert
      applyEmojiLocal(placeId, prev);
      setError(err?.message ?? "リセットに失敗しました");
    } finally {
      setSavingEmoji(false);
    }
  };

  const commitCustomEmoji = async () => {
    const placeId = emojiPicker.placeId;
    if (!placeId) return;

    const c = customEmoji.trim();
    if (!c) return;

    const compact = Array.from(c).slice(0, 2).join("");
    await setEmojiForPlace(placeId, compact);
  };

  // ===== 削除（既存） =====

  const openDelete = (placeId: string, placeName: string | null) => {
    setConfirm({ open: true, placeId, placeName });
  };

  const doRemove = async (mode: "this" | "all") => {
    if (!confirm.placeId) return;

    setError(null);

    const target_collection_id = mode === "this" ? activeCollectionId : null;

    const { error: rpcErr } = await supabase.rpc("remove_place_from_my_collections", {
      target_place_id: confirm.placeId,
      target_collection_id,
    });

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setConfirm({ open: false, placeId: null, placeName: null });

    await fetchSaved();
  };

  const activeName = useMemo(() => {
    if (!activeCollectionId) return "すべて";
    return collections.find((c) => c.id === activeCollectionId)?.name ?? "選択中";
  }, [activeCollectionId, collections]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        {/* Map */}
        <div className="order-1 lg:order-2 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div className="text-sm font-semibold">Map</div>
            <div className="text-xs text-black/50">{mappable.length} pins</div>
          </div>
          <div className="h-[65vh] w-full" ref={mapDivRef} />
        </div>

        {/* List */}
        <div className="order-2 lg:order-1 rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">
              保存した場所 <span className="text-black/40">・{activeName}</span>
            </div>
            <button
              type="button"
              onClick={fetchSaved}
              className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs hover:bg-black/5"
            >
              <RefreshCw className="h-4 w-4" />
              更新
            </button>
          </div>

          {/* Filter */}
          <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Chip active={!activeCollectionId} onClick={() => setActiveCollectionId(null)}>
              すべて
            </Chip>
            {collections.map((c) => (
              <Chip
                key={c.id}
                active={activeCollectionId === c.id}
                onClick={() => setActiveCollectionId(c.id)}
              >
                {c.name}
              </Chip>
            ))}
          </div>

          {error && (
            <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
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
                const emoji = getEmoji(r.place_id);

                return (
                  <div
                    key={r.place_id}
                    className="rounded-xl border border-black/10 p-3 hover:bg-black/5"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => focusPlace(r.place_id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          focusPlace(r.place_id);
                        }
                      }}
                      className="w-full text-left"
                      aria-label={`${name} を地図で表示`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openEmojiPicker(r.place_id, p?.name ?? null);
                          }}
                          className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-white text-[14px] hover:bg-black/5"
                          aria-label="ピン絵文字を変更"
                          title="ピン絵文字を変更"
                        >
                          {emoji}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{name}</div>
                          {address && (
                            <div className="mt-0.5 line-clamp-2 text-xs text-black/60">
                              {address}
                            </div>
                          )}
                          <div className="mt-1 text-[11px] text-black/40">
                            最終保存: {new Date(r.last_saved_at).toLocaleString("ja-JP")}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <a
                          href={buildGoogleMapsUrl(r.place_id, p?.name)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-white"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Googleで開く
                        </a>

                        {r.last_post_id && (
                          <Link
                            href={`/post/${r.last_post_id}`}
                            className="rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-white"
                          >
                            投稿へ
                          </Link>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => openDelete(r.place_id, p?.name ?? null)}
                        className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs text-red-600 hover:bg-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        削除
                      </button>
                    </div>

                    {(!p || p.lat == null || p.lng == null) && (
                      <div className="mt-2 text-[11px] text-black/40">
                        ※ この場所はまだ座標が未取得なので、地図には表示されません（places を埋めてね）
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Emoji Picker */}
      {emojiPicker.open && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">ピン絵文字を変更</div>
              <button
                type="button"
                onClick={closeEmojiPicker}
                className="rounded-full p-1 text-black/50 hover:bg-black/5"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 text-sm text-black/70">
              <div className="font-medium text-black">
                {emojiPicker.placeName ?? "この場所"}{" "}
                <span className="ml-1 inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-2 text-[13px]">
                  {emojiPicker.currentEmoji || "📍"}
                </span>
              </div>
              <div className="mt-1 text-xs text-black/50">
                ※ 未設定/削除時は自動で 📍（Googleサジェストがあればそれ）になります
              </div>
            </div>

            <div className="space-y-3">
              {EMOJI_PRESETS.map((g) => (
                <div key={g.label}>
                  <div className="mb-1 text-xs font-medium text-black/60">{g.label}</div>
                  <div className="grid grid-cols-10 gap-2">
                    {g.emojis.map((e) => (
                      <button
                        key={e}
                        type="button"
                        disabled={savingEmoji}
                        onClick={() => emojiPicker.placeId && setEmojiForPlace(emojiPicker.placeId, e)}
                        className={[
                          "h-9 w-9 rounded-xl border border-black/10 bg-white text-[18px] hover:bg-black/5 active:scale-[0.99]",
                          savingEmoji ? "opacity-60 cursor-not-allowed" : "",
                        ].join(" ")}
                        aria-label={`絵文字 ${e} を選択`}
                        title={e}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-black/10 p-3">
                <div className="text-xs font-medium text-black/60">カスタム</div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={customEmoji}
                    onChange={(e) => setCustomEmoji(e.target.value)}
                    placeholder="絵文字を貼り付け（例: 🥶）"
                    className="w-full rounded-lg border border-black/20 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    disabled={savingEmoji}
                  />
                  <button
                    type="button"
                    onClick={commitCustomEmoji}
                    disabled={savingEmoji || !customEmoji.trim()}
                    className="shrink-0 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                  >
                    適用
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => emojiPicker.placeId && resetEmojiForPlace(emojiPicker.placeId)}
                    disabled={savingEmoji}
                    className="text-xs text-red-600 hover:underline disabled:opacity-60"
                  >
                    ユーザー設定を消す（サジェストに戻す/無ければ📍）
                  </button>

                  <button
                    type="button"
                    onClick={closeEmojiPicker}
                    className="text-xs text-black/50 hover:underline"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>

            {savingEmoji && (
              <div className="mt-3 text-center text-xs text-black/50">保存中...</div>
            )}
          </div>
        </div>
      )}

      {/* Delete modal */}
      {confirm.open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">保存を削除</div>
              <button
                type="button"
                onClick={() => setConfirm({ open: false, placeId: null, placeName: null })}
                className="rounded-full p-1 text-black/50 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-sm text-black/70">
              <div className="font-medium text-black">{confirm.placeName ?? "この場所"}</div>
              <div className="mt-1 text-xs text-black/50">どう削除しますか？</div>
            </div>

            <div className="mt-4 space-y-2">
              {activeCollectionId && (
                <button
                  type="button"
                  onClick={() => doRemove("this")}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm hover:bg-black/5"
                >
                  このコレクションから外す
                </button>
              )}

              <button
                type="button"
                onClick={() => doRemove("all")}
                className="w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                すべてのコレクションから削除（ピンも消える）
              </button>

              <button
                type="button"
                onClick={() => setConfirm({ open: false, placeId: null, placeName: null })}
                className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm hover:bg-black/5"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
