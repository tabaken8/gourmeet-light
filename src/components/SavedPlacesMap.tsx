"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { GENRES, GENRE_LABEL_BY_EMOJI } from "@/lib/genre/genres";

type FollowRow = { follower_id: string; followee_id: string; status: string };
type PostRow = {
  id: string;
  user_id: string;
  place_id: string | null;
  place_name: string | null;
  place_address: string | null;
  created_at: string | null;
  image_urls?: string[] | null;
  price_yen?: number | null;
  price_range?: string | null;
};
type PlaceRow = {
  place_id: string;
  lat: number | null;
  lng: number | null;
  name: string | null;
  address: string | null;
  photo_url: string | null;
};
type ProfileRow = { id: string; avatar_url: string | null };
type UserPlacePinRow = { place_id: string; emoji: string | null };
type UserPlaceRow = { place_id: string };

type IconMode = "avatar" | "photo";

/** ---- Genre (emoji) options ---- */

function labelForEmoji(emoji: string | null | undefined) {
  if (!emoji) return "";
  return GENRE_LABEL_BY_EMOJI[emoji] ?? "";
}

/** ---- Budget helpers (loose range) ---- */
type BudgetKey =
  | "any"
  | "0_2000"
  | "2000_5000"
  | "5000_10000"
  | "10000_20000"
  | "20000_plus";

const BUDGETS: Array<{ key: BudgetKey; label: string; min: number | null; max: number | null }> = [
  { key: "any", label: "指定なし", min: null, max: null },
  { key: "0_2000", label: "〜 ¥2,000", min: 0, max: 2000 },
  { key: "2000_5000", label: "¥2,000〜¥5,000", min: 2000, max: 5000 },
  { key: "5000_10000", label: "¥5,000〜¥10,000", min: 5000, max: 10000 },
  { key: "10000_20000", label: "¥10,000〜¥20,000", min: 10000, max: 20000 },
  { key: "20000_plus", label: "¥20,000〜", min: 20000, max: null },
];

function parsePriceRangeToYen(priceRange: string | null | undefined): number | null {
  if (!priceRange) return null;
  const s = priceRange.replaceAll(",", "");
  const nums = s.match(/\d+/g)?.map((x) => Number(x)).filter((n) => Number.isFinite(n)) ?? [];
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0];
  return Math.round((nums[0] + nums[1]) / 2);
}

function formatYen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function budgetIndexFromYen(y: number): number {
  for (let i = 1; i < BUDGETS.length; i++) {
    const b = BUDGETS[i];
    const minOK = b.min == null ? true : y >= b.min;
    const maxOK = b.max == null ? true : y <= b.max;
    if (minOK && maxOK) return i;
  }
  return BUDGETS.length - 1;
}

function expandedBudgetFromYen(y: number) {
  const i = budgetIndexFromYen(y);
  const lo = Math.max(1, i - 1);
  const hi = Math.min(BUDGETS.length - 1, i + 1);
  const min = BUDGETS[lo].min ?? 0;
  const max = BUDGETS[hi].max;
  const label = max == null ? `${formatYen(min)}〜` : `${formatYen(min)}〜${formatYen(max)}`;
  return { min, max, label };
}

function passesBudgetFilterLoose(midYen: number | null, budgetKey: BudgetKey) {
  if (budgetKey === "any") return true;
  const sel = BUDGETS.find((b) => b.key === budgetKey);
  if (!sel || sel.min == null) return true;
  if (midYen == null) return false;

  const loose = expandedBudgetFromYen(midYen);
  const selMin = sel.min ?? 0;
  const selMax = sel.max;

  const aMin = loose.min;
  const aMax = loose.max;

  const left = Math.max(aMin, selMin);
  const right =
    aMax == null && selMax == null
      ? Infinity
      : Math.min(aMax == null ? Infinity : aMax, selMax == null ? Infinity : selMax);

  return left <= right;
}

/** ---- Pin model (place-aggregated) ---- */
type PlacePin = {
  place_id: string;
  lat: number;
  lng: number;
  place_name: string;
  place_address: string;

  users: Map<
    string,
    {
      avatar_url: string | null;
      latest_created_at: number; // ms
    }
  >;

  latest_post_at: number; // ms
  latest_user_id: string;

  latest_post_id: string;
  latest_image_url: string | null;
  budget_mid_yen: number | null;

  genre_emoji: string;
  is_saved: boolean;
};

function toMs(ts: string | null): number {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

function fallbackInitial(uid: string) {
  return uid.slice(0, 2).toUpperCase();
}

function ensureGmapsOptionsOnce(opts: Parameters<typeof setOptions>[0]) {
  const g = globalThis as any;
  if (!g.__GMAPS_OPTIONS_SET__) {
    setOptions(opts);
    g.__GMAPS_OPTIONS_SET__ = true;
  }
}

function attachBadge(wrap: HTMLDivElement, badge: number) {
  if (badge >= 2) {
    const b = document.createElement("div");
    b.textContent = String(badge);
    b.style.position = "absolute";
    b.style.top = "-6px";
    b.style.right = "-6px";
    b.style.minWidth = "20px";
    b.style.height = "20px";
    b.style.padding = "0 6px";
    b.style.borderRadius = "9999px";
    b.style.display = "flex";
    b.style.alignItems = "center";
    b.style.justifyContent = "center";
    b.style.fontSize = "12px";
    b.style.fontWeight = "800";
    b.style.color = "white";
    b.style.background = "#111827";
    b.style.border = "2px solid rgba(255,255,255,0.95)";
    wrap.appendChild(b);
  }
}

function makeAvatarPinContent(args: { avatarUrl: string | null; badge?: number; fallbackText: string; highlight?: boolean }) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "44px";
  wrap.style.height = "44px";
  wrap.style.borderRadius = "9999px";
  wrap.style.overflow = "hidden";
  wrap.style.boxShadow = args.highlight ? "0 10px 26px rgba(234,88,12,0.35)" : "0 6px 18px rgba(0,0,0,0.22)";
  wrap.style.border = args.highlight ? "3px solid rgba(234,88,12,0.95)" : "2px solid rgba(255,255,255,0.95)";
  wrap.style.background = "white";
  wrap.style.cursor = "pointer";
  wrap.style.transform = "translateZ(0)";

  if (args.avatarUrl) {
    const img = document.createElement("img");
    img.src = args.avatarUrl;
    img.alt = "avatar";
    img.referrerPolicy = "no-referrer";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    wrap.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.textContent = args.fallbackText;
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.fontWeight = "800";
    div.style.fontSize = "13px";
    div.style.color = "#111";
    div.style.background = "linear-gradient(180deg,#fff,#f3f4f6)";
    wrap.appendChild(div);
  }

  attachBadge(wrap, args.badge ?? 0);
  return wrap;
}

function makePhotoPinContent(args: { imageUrl: string | null; badge?: number; fallbackText: string; highlight?: boolean }) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "44px";
  wrap.style.height = "44px";
  wrap.style.borderRadius = "9999px";
  wrap.style.overflow = "hidden";
  wrap.style.boxShadow = args.highlight ? "0 10px 26px rgba(234,88,12,0.35)" : "0 6px 18px rgba(0,0,0,0.22)";
  wrap.style.border = args.highlight ? "3px solid rgba(234,88,12,0.95)" : "2px solid rgba(255,255,255,0.95)";
  wrap.style.background = "white";
  wrap.style.cursor = "pointer";
  wrap.style.transform = "translateZ(0)";

  if (args.imageUrl) {
    const img = document.createElement("img");
    img.src = args.imageUrl;
    img.alt = "photo";
    img.referrerPolicy = "no-referrer";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    wrap.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.textContent = args.fallbackText;
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.fontWeight = "900";
    div.style.fontSize = "12px";
    div.style.color = "#111";
    div.style.background = "linear-gradient(180deg,#fff,#f3f4f6)";
    wrap.appendChild(div);
  }

  attachBadge(wrap, args.badge ?? 0);
  return wrap;
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
      style={{
        flexShrink: 0,
        borderRadius: 9999,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid rgba(0,0,0,0.08)",
        background: active ? "#ea580c" : "rgba(0,0,0,0.04)",
        color: active ? "white" : "rgba(0,0,0,0.70)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** ---------------- AI types ---------------- */
type RecommendMapReqCandidate = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  genre_emoji: string;
  budget_mid_yen: number | null;
  is_saved: boolean;
};

type RecommendMapResult = {
  place_id?: string;            // 推奨: place_id
  id?: string;                  // 互換: id
  headline?: string;            // 互換: headline
  reason?: string;
  match_score?: number;         // 互換: match_score
  score?: number;               // 互換: score
};

type RecommendMapResp = {
  understood: { summary: string; extracted_tags: string[] };
  results: RecommendMapResult[];
};

const EMPTY_AI: RecommendMapResp = {
  understood: { summary: "", extracted_tags: [] },
  results: [],
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function pickResultId(r: RecommendMapResult) {
  return (r.place_id || r.id || "").toString();
}

export default function SavedPlacesMap() {
  const supabase = createClientComponentClient();

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const markerByPlaceIdRef = useRef<Map<string, any>>(new Map());
  const infoRef = useRef<any>(null);

  const gmapsRef = useRef<{
    GMap: any;
    AdvancedMarkerElement: any;
    InfoWindow: any;
  } | null>(null);

  // gmaps ready
  const [gmapsReady, setGmapsReady] = useState(false);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorText, setErrorText] = useState<string>("");

  // filters & view modes
  const [savedOnly, setSavedOnly] = useState(false);
  const [activeGenreEmoji, setActiveGenreEmoji] = useState<string | null>(null);
  const [activeBudgetKey, setActiveBudgetKey] = useState<BudgetKey>("any");
  const [iconMode, setIconMode] = useState<IconMode>("avatar");

  // loaded pins
  const [pins, setPins] = useState<PlacePin[]>([]);

  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "";

  /** ---------------- AI states ---------------- */
  const [aiQuery, setAiQuery] = useState("");
  const [aiMaxResults, setAiMaxResults] = useState<number>(4);
  const [aiOnly, setAiOnly] = useState<boolean>(false);
  const [aiState, setAiState] = useState<"idle" | "thinking" | "done" | "error">("idle");
  const [aiError, setAiError] = useState<string>("");
  const [ai, setAi] = useState<RecommendMapResp>(EMPTY_AI);
  const [aiSelectedPlaceId, setAiSelectedPlaceId] = useState<string>("");

  const genreCounts = useMemo(() => {
    const m = new Map<string, number>();
    pins.forEach((p) => {
      const e = p.genre_emoji || "📍";
      m.set(e, (m.get(e) ?? 0) + 1);
    });
    return m;
  }, [pins]);

  const availableGenres = useMemo(() => {
    const res: Array<{ emoji: string; label: string; count: number }> = [];
    GENRES.forEach((g) => {
      const c = genreCounts.get(g.emoji) ?? 0;
      if (c > 0) res.push({ emoji: g.emoji, label: g.label, count: c });
    });
    genreCounts.forEach((count, emoji) => {
      if (count <= 0) return;
      const known = GENRES.some((g) => g.emoji === emoji);
      if (!known) res.push({ emoji, label: labelForEmoji(emoji) || "その他", count });
    });
    return res;
  }, [genreCounts]);

  const filteredPinsBase = useMemo(() => {
    let base = pins;
    if (savedOnly) base = base.filter((p) => p.is_saved);
    if (activeGenreEmoji) base = base.filter((p) => p.genre_emoji === activeGenreEmoji);
    if (activeBudgetKey !== "any")
      base = base.filter((p) => passesBudgetFilterLoose(p.budget_mid_yen, activeBudgetKey));
    return base;
  }, [pins, savedOnly, activeGenreEmoji, activeBudgetKey]);

  // AI結果をPlacePinに結びつける
  const aiPlaceIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of ai.results || []) {
      const id = pickResultId(r);
      if (id) s.add(id);
    }
    return s;
  }, [ai]);

  const filteredPins = useMemo(() => {
    if (!aiOnly) return filteredPinsBase;
    if (aiPlaceIdSet.size === 0) return [];
    return filteredPinsBase.filter((p) => aiPlaceIdSet.has(p.place_id));
  }, [filteredPinsBase, aiOnly, aiPlaceIdSet]);

  /** ---- Load pins once (Supabase) ---- */
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("loading");
      setErrorText("");

      if (!apiKey) {
        setStatus("error");
        setErrorText("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が未設定です");
        return;
      }
      if (!mapId) {
        setStatus("error");
        setErrorText("NEXT_PUBLIC_GOOGLE_MAP_ID が未設定です（Map IDが必要）");
        return;
      }

      const { data: userRes, error: uErr } = await supabase.auth.getUser();
      if (uErr || !userRes?.user) {
        setStatus("error");
        setErrorText("ログイン情報が取得できませんでした");
        return;
      }
      const myUid = userRes.user.id;

      // 1) followees
      const { data: follows, error: fErr } = await supabase
        .from("follows")
        .select("followee_id, status")
        .eq("follower_id", myUid)
        .eq("status", "accepted");

      if (fErr) {
        setStatus("error");
        setErrorText(`follows 取得失敗: ${fErr.message}`);
        return;
      }

      const followeeIds = (follows as FollowRow[] | null)?.map((r) => r.followee_id) ?? [];
      if (followeeIds.length === 0) {
        setPins([]);
        setStatus("ready");
        return;
      }

      // 2) profiles avatars
      const { data: profiles, error: prErr } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .in("id", followeeIds);

      if (prErr) console.warn("profiles fetch error:", prErr.message);

      const avatarByUser = new Map<string, string | null>();
      (profiles as ProfileRow[] | null)?.forEach((p) => avatarByUser.set(p.id, p.avatar_url ?? null));

      // 3) posts (include images/budget)
      const { data: posts, error: poErr } = await supabase
        .from("posts")
        .select("id, user_id, place_id, place_name, place_address, created_at, image_urls, price_yen, price_range")
        .in("user_id", followeeIds)
        .not("place_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(800);

      if (poErr) {
        setStatus("error");
        setErrorText(`posts 取得失敗: ${poErr.message}`);
        return;
      }

      const postRows = (posts as PostRow[] | null) ?? [];
      const placeIds = Array.from(new Set(postRows.map((p) => p.place_id).filter(Boolean) as string[]));

      if (placeIds.length === 0) {
        setPins([]);
        setStatus("ready");
        return;
      }

      // 4) places lat/lng
      const { data: places, error: plErr } = await supabase
        .from("places")
        .select("place_id, lat, lng, name, address, photo_url")
        .in("place_id", placeIds);

      if (plErr) {
        setStatus("error");
        setErrorText(`places 取得失敗: ${plErr.message}`);
        return;
      }

      const placeById = new Map<string, PlaceRow>();
      ((places as PlaceRow[] | null) ?? []).forEach((p) => placeById.set(p.place_id, p));

      // 5) my saved set (user_places)
      const savedSet = new Set<string>();
      try {
        const CHUNK = 200;
        for (let i = 0; i < placeIds.length; i += CHUNK) {
          const chunk = placeIds.slice(i, i + CHUNK);
          const { data: up, error } = await supabase
            .from("user_places")
            .select("place_id")
            .eq("user_id", myUid)
            .in("place_id", chunk);

          if (error) {
            console.warn("[user_places] fetch failed:", error.message);
            continue;
          }
          (up as UserPlaceRow[] | null)?.forEach((r) => {
            if (r?.place_id) savedSet.add(r.place_id);
          });
        }
      } catch (e) {
        console.warn("[user_places] exception:", e);
      }

      // 6) my genre pins (user_place_pins)
      const emojiByPlace = new Map<string, string>();
      try {
        const CHUNK = 200;
        for (let i = 0; i < placeIds.length; i += CHUNK) {
          const chunk = placeIds.slice(i, i + CHUNK);
          const { data: upp, error } = await supabase
            .from("user_place_pins")
            .select("place_id, emoji")
            .eq("user_id", myUid)
            .in("place_id", chunk);

          if (error) {
            console.warn("[user_place_pins] fetch failed:", error.message);
            continue;
          }

          (upp as UserPlacePinRow[] | null)?.forEach((r) => {
            const e2 = (r?.emoji ?? "").toString().trim();
            if (r?.place_id && e2) emojiByPlace.set(r.place_id, e2);
          });
        }
      } catch (e) {
        console.warn("[user_place_pins] exception:", e);
      }

      // 7) aggregate by place_id
      const pinByPlace = new Map<string, PlacePin>();

      for (const p of postRows) {
        if (!p.place_id) continue;
        const plc = placeById.get(p.place_id);
        if (!plc || plc.lat == null || plc.lng == null) continue;

        const createdMs = toMs(p.created_at);
        const placeName = p.place_name || plc.name || "(no name)";
        const placeAddr = p.place_address || plc.address || "";

        const uid = p.user_id;
        const avatarUrl = avatarByUser.get(uid) ?? null;

        const img0 = Array.isArray(p.image_urls) && p.image_urls.length ? (p.image_urls[0] ?? null) : null;

        const mid =
          typeof p.price_yen === "number" && Number.isFinite(p.price_yen)
            ? p.price_yen
            : parsePriceRangeToYen(p.price_range ?? null);

        const existing = pinByPlace.get(p.place_id);
        if (!existing) {
          const users = new Map<string, { avatar_url: string | null; latest_created_at: number }>();
          users.set(uid, { avatar_url: avatarUrl, latest_created_at: createdMs });

          pinByPlace.set(p.place_id, {
            place_id: p.place_id,
            lat: plc.lat,
            lng: plc.lng,
            place_name: placeName,
            place_address: placeAddr,
            users,
            latest_post_at: createdMs,
            latest_user_id: uid,

            latest_post_id: p.id,
            latest_image_url: img0,
            budget_mid_yen: mid ?? null,

            genre_emoji: emojiByPlace.get(p.place_id) ?? "📍",
            is_saved: savedSet.has(p.place_id),
          });
        } else {
          const u = existing.users.get(uid);
          if (!u || createdMs > u.latest_created_at) {
            existing.users.set(uid, { avatar_url: avatarUrl, latest_created_at: createdMs });
          }
          if (createdMs > existing.latest_post_at) {
            existing.latest_post_at = createdMs;
            existing.latest_user_id = uid;
            existing.place_name = placeName || existing.place_name;
            existing.place_address = placeAddr || existing.place_address;

            existing.latest_post_id = p.id;
            existing.latest_image_url = img0 ?? existing.latest_image_url;
            existing.budget_mid_yen = (mid ?? null) ?? existing.budget_mid_yen;
          }
        }
      }

      const pinsSorted = Array.from(pinByPlace.values()).sort((a, b) => b.latest_post_at - a.latest_post_at);

      if (cancelled) return;
      setPins(pinsSorted);
      setStatus("ready");
    }

    run().catch((e) => {
      console.error(e);
      setStatus("error");
      setErrorText(e?.message ?? "unknown error");
    });

    return () => {
      cancelled = true;
    };
  }, [supabase, apiKey, mapId]);

  /** ---- Load Google Maps libs once ---- */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!apiKey || !mapId) return;

      ensureGmapsOptionsOnce({
        key: apiKey,
        v: "weekly",
        language: "ja",
        region: "JP",
      });

      const [{ Map: GMap, InfoWindow }, { AdvancedMarkerElement }] = await Promise.all([
        importLibrary("maps") as Promise<any>,
        importLibrary("marker") as Promise<any>,
      ]);

      if (cancelled) return;

      gmapsRef.current = { GMap, AdvancedMarkerElement, InfoWindow };
      setGmapsReady(true);
    }

    load().catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [apiKey, mapId]);

  /** ---- Init map once ---- */
  useEffect(() => {
    if (!gmapsReady) return;
    if (!gmapsRef.current) return;
    if (!mapDivRef.current) return;
    if (mapRef.current) return;

    const { GMap, InfoWindow } = gmapsRef.current;

    mapRef.current = new GMap(mapDivRef.current, {
      center: { lat: 35.681236, lng: 139.767125 },
      zoom: 12,
      mapId,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      clickableIcons: false,
    });

    infoRef.current = new InfoWindow();
  }, [gmapsReady, mapId]);

  function openInfoForPin(pin: PlacePin) {
    const map = mapRef.current;
    if (!map) return;

    const marker = markerByPlaceIdRef.current.get(pin.place_id);
    if (!marker) {
      // markerがまだ無い場合は移動だけ
      map.panTo({ lat: pin.lat, lng: pin.lng });
      map.setZoom(Math.max(14, map.getZoom?.() ?? 14));
      return;
    }

    const budgetLabel = pin.budget_mid_yen != null ? expandedBudgetFromYen(pin.budget_mid_yen).label : "—";
    const genreLabel = labelForEmoji(pin.genre_emoji) || (pin.genre_emoji === "📍" ? "未設定" : "その他");

    const html = `
      <div style="min-width:240px">
        <div style="font-weight:800;font-size:14px;margin-bottom:6px;">${escapeHtml(pin.place_name)}</div>
        ${
          pin.place_address
            ? `<div style="color:#374151;font-size:12px;margin-bottom:8px;">${escapeHtml(pin.place_address)}</div>`
            : ""
        }
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          <span style="font-size:12px; padding:4px 8px; border-radius:9999px; border:1px solid rgba(0,0,0,0.08); background:rgba(0,0,0,0.03);">
            ジャンル: ${escapeHtml(pin.genre_emoji)} ${escapeHtml(genreLabel)}
          </span>
          <span style="font-size:12px; padding:4px 8px; border-radius:9999px; border:1px solid rgba(0,0,0,0.08); background:rgba(0,0,0,0.03);">
            予算(目安): ${escapeHtml(budgetLabel)}
          </span>
          ${
            pin.is_saved
              ? `<span style="font-size:12px; padding:4px 8px; border-radius:9999px; border:1px solid rgba(0,0,0,0.08); background:rgba(255,237,213,1); color:#9a3412; font-weight:800;">保存済み</span>`
              : ""
          }
        </div>
        <div style="font-size:12px;color:#111827;">投稿者: ${pin.users.size}人</div>
      </div>
    `;

    try {
      infoRef.current?.setContent(html);
      infoRef.current?.open({ map, anchor: marker });
    } catch {}

    map.panTo({ lat: pin.lat, lng: pin.lng });
    map.setZoom(Math.max(14, map.getZoom?.() ?? 14));
  }

  /** ---- Render markers whenever filteredPins / iconMode / AI selection change ---- */
  useEffect(() => {
    const map = mapRef.current;
    const libs = gmapsRef.current;
    if (!map || !libs) return;

    // cleanup markers
    for (const m of markersRef.current) {
      try {
        m.map = null;
      } catch {}
    }
    markersRef.current = [];
    markerByPlaceIdRef.current = new Map();

    try {
      infoRef.current?.close();
    } catch {}

    if (filteredPins.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    for (const pin of filteredPins) {
      const badgeCount = pin.users.size;

      const latestUid = pin.latest_user_id;
      const latestAvatar = pin.users.get(latestUid)?.avatar_url ?? null;

      const highlight = aiSelectedPlaceId === pin.place_id;

      const content =
        iconMode === "avatar"
          ? makePhotoPinContent({
              imageUrl: pin.latest_image_url,
              badge: badgeCount,
              fallbackText: "📷",
              highlight,
            })
          : makeAvatarPinContent({
              avatarUrl: latestAvatar,
              badge: badgeCount,
              fallbackText: fallbackInitial(latestUid),
              highlight,
            });

      const marker = new libs.AdvancedMarkerElement({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        content,
      });

      content.addEventListener("click", () => {
        setAiSelectedPlaceId(pin.place_id);
        openInfoForPin(pin);
      });

      markersRef.current.push(marker);
      markerByPlaceIdRef.current.set(pin.place_id, marker);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    }

    map.fitBounds(bounds, 60);
  }, [filteredPins, iconMode, aiSelectedPlaceId]);

  /** ---------------- AI request ---------------- */
  async function runAIRecommend(nextQuery?: string) {
    const q = (nextQuery ?? aiQuery).trim();
    if (!q) return;

    setAiState("thinking");
    setAiError("");
    setAiSelectedPlaceId("");

    // 候補は「現在のフィルタ後」をAIに渡す（＝UIと一致）
    const candidates: RecommendMapReqCandidate[] = filteredPinsBase.map((p) => ({
      place_id: p.place_id,
      name: p.place_name,
      address: p.place_address,
      lat: p.lat,
      lng: p.lng,
      genre_emoji: p.genre_emoji,
      budget_mid_yen: p.budget_mid_yen,
      is_saved: p.is_saved,
    }));

    try {
      const res = await fetch("/api/recommend-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          maxResults: clamp(aiMaxResults, 1, 5),
          candidates,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${text || res.statusText}`);
      }

      const data = (await res.json().catch(() => null)) as any;

      const safe: RecommendMapResp = {
        understood: {
          summary: data?.understood?.summary ?? "",
          extracted_tags: Array.isArray(data?.understood?.extracted_tags) ? data.understood.extracted_tags : [],
        },
        results: Array.isArray(data?.results) ? data.results : [],
      };

      setAi(safe);
      setAiState("done");

      // AI only をONにしてるなら、この時点で地図が推薦のみ表示になる
      // ついでに1件目へフォーカスしてテンション上げる
      const firstId = pickResultId(safe.results?.[0] ?? {});
      if (firstId) {
        setAiSelectedPlaceId(firstId);
        const pin = pins.find((p) => p.place_id === firstId);
        if (pin) openInfoForPin(pin);
      }
    } catch (e: any) {
      console.error(e);
      setAiState("error");
      setAiError(e?.message ?? "AI error");
      setAi(EMPTY_AI);
    }
  }

  const aiCards = useMemo(() => {
    const byId = new Map(pins.map((p) => [p.place_id, p]));
    return (ai.results || [])
      .map((r) => {
        const id = pickResultId(r);
        const pin = id ? byId.get(id) : undefined;
        if (!pin) return null;
        const score = (typeof r.match_score === "number" ? r.match_score : typeof r.score === "number" ? r.score : null);
        return {
          id: pin.place_id,
          pin,
          headline: r.headline || pin.place_name,
          reason: r.reason || "",
          score,
        };
      })
      .filter(Boolean) as Array<{ id: string; pin: PlacePin; headline: string; reason: string; score: number | null }>;
  }, [ai, pins]);

  const examplePrompts = [
    "静かでデート向き、渋谷か恵比寿で。ワインあると嬉しい。",
  ];

  return (
    <div style={{ width: "100%" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900 }}>マップ</div>

        {status === "loading" && <div style={{ fontSize: 12, color: "#6b7280" }}>読み込み中…</div>}
        {status === "error" && <div style={{ fontSize: 12, color: "#ef4444" }}>{errorText}</div>}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* saved only */}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
            <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} />
            保存済みのみ
          </label>

          {/* AI only */}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
            <input type="checkbox" checked={aiOnly} onChange={(e) => setAiOnly(e.target.checked)} />
            AI結果のみ表示
          </label>

          {/* icon mode */}
          <button
            type="button"
            onClick={() => setIconMode((m) => (m === "avatar" ? "photo" : "avatar"))}
            style={{
              borderRadius: 12,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 800,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "white",
              cursor: "pointer",
            }}
            title="ピン表示を切り替え"
          >
            {iconMode === "avatar" ? "👤 アイコン" : "🖼️ 写真"}
          </button>

          {/* budget */}
          <select
            value={activeBudgetKey}
            onChange={(e) => setActiveBudgetKey(e.target.value as BudgetKey)}
            style={{
              borderRadius: 12,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 800,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "white",
            }}
            title="価格帯"
          >
            {BUDGETS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSavedOnly(false);
              setActiveGenreEmoji(null);
              setActiveBudgetKey("any");
              setAiOnly(false);
              setAiState("idle");
              setAiError("");
              setAi(EMPTY_AI);
              setAiSelectedPlaceId("");
            }}
            style={{
              borderRadius: 12,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 800,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(0,0,0,0.03)",
              cursor: "pointer",
            }}
            title="フィルタをクリア"
          >
            リセット
          </button>
        </div>
      </div>

      {/* AI panel */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
          padding: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>✨ AIでおすすめ</div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#374151" }}>件数</div>
              <input
                type="range"
                min={1}
                max={5}
                value={aiMaxResults}
                onChange={(e) => setAiMaxResults(Number(e.target.value))}
              />
              <div style={{ fontSize: 12, fontWeight: 900, width: 18, textAlign: "right" }}>{aiMaxResults}</div>
            </div>

            <button
              type="button"
              onClick={() => runAIRecommend()}
              disabled={!aiQuery.trim() || aiState === "thinking"}
              style={{
                borderRadius: 12,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 900,
                border: "1px solid rgba(0,0,0,0.10)",
                background: !aiQuery.trim() || aiState === "thinking" ? "rgba(0,0,0,0.06)" : "#111827",
                color: !aiQuery.trim() || aiState === "thinking" ? "rgba(0,0,0,0.35)" : "white",
                cursor: !aiQuery.trim() || aiState === "thinking" ? "not-allowed" : "pointer",
              }}
            >
              {aiState === "thinking" ? "考え中…" : "提案する"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runAIRecommend(e.currentTarget.value);
            }}
            placeholder="文章で入力できます"
            style={{
              width: "100%",
              borderRadius: 14,
              padding: "10px 12px",
              fontSize: 14,
              fontWeight: 700,
              border: "1px solid rgba(0,0,0,0.10)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {examplePrompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setAiQuery(p);
                runAIRecommend(p);
              }}
              style={{
                borderRadius: 9999,
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 800,
                border: "1px solid rgba(0,0,0,0.08)",
                background: "rgba(0,0,0,0.03)",
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {(aiState === "done" || aiState === "thinking") && (
          <div
            style={{
              marginTop: 10,
              borderRadius: 14,
              padding: 10,
              background: "rgba(17,24,39,0.03)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, color: "#111827", marginBottom: 6 }}>
              {aiState === "thinking" ? "理解中…" : "リクエストを理解しました"}
            </div>
            <div style={{ fontSize: 13, color: "#111827", fontWeight: 700 }}>
              {ai.understood.summary || (aiState === "thinking" ? "…" : "—")}
            </div>
            {ai.understood.extracted_tags?.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ai.understood.extracted_tags.slice(0, 8).map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "4px 8px",
                      borderRadius: 9999,
                      border: "1px solid rgba(0,0,0,0.08)",
                      background: "white",
                      color: "#374151",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {aiState === "error" && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#ef4444", fontWeight: 800 }}>
            {aiError || "AI error"}
          </div>
        )}

        {/* results */}
        {aiCards.length > 0 && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {aiCards.map((c, idx) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setAiSelectedPlaceId(c.id);
                  openInfoForPin(c.pin);
                }}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 10,
                  border: c.id === aiSelectedPlaceId ? "2px solid rgba(234,88,12,0.9)" : "1px solid rgba(0,0,0,0.08)",
                  background: c.id === aiSelectedPlaceId ? "rgba(255,237,213,0.55)" : "white",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#6b7280" }}>#{idx + 1}</div>
                  <div style={{ fontWeight: 900, fontSize: 14, color: "#111827" }}>{c.headline}</div>
                  <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 900, color: "#111827" }}>
                    {c.score != null ? `${Math.round(c.score)}` : ""}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#374151", fontWeight: 700 }}>
                  {c.pin.place_address || ""}
                </div>
                {c.reason && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#111827", fontWeight: 700 }}>
                    {c.reason}
                  </div>
                )}
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "4px 8px",
                      borderRadius: 9999,
                      background: "rgba(0,0,0,0.03)",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    {c.pin.genre_emoji} {labelForEmoji(c.pin.genre_emoji) || "その他"}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "4px 8px",
                      borderRadius: 9999,
                      background: "rgba(0,0,0,0.03)",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    予算: {c.pin.budget_mid_yen != null ? expandedBudgetFromYen(c.pin.budget_mid_yen).label : "—"}
                  </span>
                  {c.pin.is_saved && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        padding: "4px 8px",
                        borderRadius: 9999,
                        background: "rgba(255,237,213,1)",
                        border: "1px solid rgba(154,52,18,0.22)",
                        color: "#9a3412",
                      }}
                    >
                      保存済み
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* genre chips */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
        <Chip active={!activeGenreEmoji} onClick={() => setActiveGenreEmoji(null)}>
          すべて
        </Chip>
        {availableGenres.map((g) => (
          <Chip
            key={`${g.emoji}-${g.label}`}
            active={activeGenreEmoji === g.emoji}
            onClick={() => setActiveGenreEmoji(g.emoji)}
          >
            {g.emoji} {g.label} ({g.count})
          </Chip>
        ))}
      </div>

      {/* map */}
      <div
        ref={mapDivRef}
        style={{
          width: "100%",
          height: "calc(100dvh - 320px)",
          borderRadius: 16,
          overflow: "hidden",
          background: "#f3f4f6",
        }}
      />

      {/* footer hint */}
      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
        pins: {filteredPins.length} / total: {pins.length}{" "}
        {aiOnly && <span style={{ marginLeft: 8, fontWeight: 900, color: "#111827" }}>（AI結果のみ表示中）</span>}
      </div>
    </div>
  );
}
