"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import MapRecommendPanel, {
  RecommendItem,
  Poster,
} from "@/components/map/MapRecommendPanel";

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

  // ✅ 追加
  recommend_score?: number | null;
};
type PlaceRow = {
  place_id: string;
  lat: number | null;
  lng: number | null;
  name: string | null;
  address: string | null;
  photo_url: string | null;
};
type ProfileRow = {
  id: string;
  avatar_url: string | null;
  display_name?: string | null;
};
type UserPlacePinRow = { place_id: string; emoji: string | null };
type UserPlaceRow = { place_id: string };

type IconMode = "avatar" | "photo";

/** ---- Genre (emoji) options ---- */
type GenreOption = { key: string; emoji: string; label: string };
const GENRES: GenreOption[] = [
  { key: "ramen", emoji: "🍜", label: "ラーメン" },
  { key: "sushi", emoji: "🍣", label: "寿司" },
  { key: "yakiniku", emoji: "🥩", label: "焼肉" },
  { key: "yakitori_izakaya", emoji: "🍺", label: "焼き鳥/居酒屋" },
  { key: "chinese", emoji: "🥟", label: "中華" },
  { key: "curry", emoji: "🍛", label: "カレー" },
  { key: "italian", emoji: "🍝", label: "イタリアン" },
  { key: "pizza", emoji: "🍕", label: "ピザ" },
  { key: "burger", emoji: "🍔", label: "バーガー" },
  { key: "cafe", emoji: "☕️", label: "カフェ" },
  { key: "sweets", emoji: "🍰", label: "スイーツ" },
  { key: "bar", emoji: "🍷", label: "バー/酒" },
  { key: "other", emoji: "📍", label: "その他" },
];

function labelForEmoji(emoji: string | null | undefined) {
  if (!emoji) return "";
  return GENRES.find((g) => g.emoji === emoji)?.label ?? "";
}

/** ---- Budget helpers (loose range) ---- */
type BudgetKey =
  | "any"
  | "0_2000"
  | "2000_5000"
  | "5000_10000"
  | "10000_20000"
  | "20000_plus";

const BUDGETS: Array<{
  key: BudgetKey;
  label: string;
  min: number | null;
  max: number | null;
}> = [
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
  const nums =
    s
      .match(/\d+/g)
      ?.map((x) => Number(x))
      .filter((n) => Number.isFinite(n)) ?? [];
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
  const label =
    max == null ? `${formatYen(min)}〜` : `${formatYen(min)}〜${formatYen(max)}`;
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
      : Math.min(
          aMax == null ? Infinity : aMax,
          selMax == null ? Infinity : selMax
        );

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
      display_name: string | null;
      latest_created_at: number; // ms
    }
  >;

  latest_post_at: number; // ms
  latest_user_id: string;

  latest_post_id: string;
  latest_image_url: string | null;

  // ✅ 追加：カード表示用
  images_sample: string[];
  latest_price_yen: number | null;
  latest_price_range: string | null;

  // ✅ 追加：おすすめ度（最新投稿のスコア）
  latest_recommend_score: number | null;

  // ✅ 追加：同じ店の複数投稿（カード内横スクロールに使う）
  posts_sample: Array<{
    post_id: string;
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at_ms: number;
    image_urls: string[];
    recommend_score: number | null;
    price_yen: number | null;
    price_range: string | null;
  }>;

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

function makeAvatarPinContent(args: {
  avatarUrl: string | null;
  badge?: number;
  fallbackText: string;
  highlight?: boolean;
}) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "44px";
  wrap.style.height = "44px";
  wrap.style.borderRadius = "9999px";
  wrap.style.overflow = "hidden";
  wrap.style.boxShadow = "0 6px 18px rgba(0,0,0,0.22)";
  wrap.style.border = args.highlight
    ? "3px solid rgba(249,115,22,0.95)"
    : "2px solid rgba(255,255,255,0.95)";
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

function makePhotoPinContent(args: {
  imageUrl: string | null;
  badge?: number;
  fallbackText: string;
  highlight?: boolean;
}) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "44px";
  wrap.style.height = "44px";
  wrap.style.borderRadius = "9999px";
  wrap.style.overflow = "hidden";
  wrap.style.boxShadow = "0 6px 18px rgba(0,0,0,0.22)";
  wrap.style.border = args.highlight
    ? "3px solid rgba(249,115,22,0.95)"
    : "2px solid rgba(255,255,255,0.95)";
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
        fontWeight: 700,
        border: "1px solid rgba(0,0,0,0.08)",
        background: active ? "#ea580c" : "rgba(0,0,0,0.04)",
        color: active ? "white" : "rgba(0,0,0,0.65)",
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

function uniqLimit(arr: string[], limit: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const v = (x ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

export default function SavedPlacesMapAI() {
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

  const [gmapsReady, setGmapsReady] = useState(false);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [errorText, setErrorText] = useState<string>("");

  // filters & view modes
  const [savedOnly, setSavedOnly] = useState(false);
  const [activeGenreEmoji, setActiveGenreEmoji] = useState<string | null>(null);
  const [activeBudgetKey, setActiveBudgetKey] = useState<BudgetKey>("any");
  const [iconMode, setIconMode] = useState<IconMode>("photo");

  // loaded pins
  const [pins, setPins] = useState<PlacePin[]>([]);

  // ✅ AI UI
  const [aiQuery, setAiQuery] = useState("");
  const [aiMaxResults, setAiMaxResults] = useState(4);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUnderstood, setAiUnderstood] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<
    Array<{ place_id: string; reason?: string; match_score?: number }>
  >([]);
  const [aiError, setAiError] = useState<string | null>(null);

  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "";

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

  const filteredPins = useMemo(() => {
    let base = pins;
    if (savedOnly) base = base.filter((p) => p.is_saved);
    if (activeGenreEmoji) base = base.filter((p) => p.genre_emoji === activeGenreEmoji);
    if (activeBudgetKey !== "any")
      base = base.filter((p) => passesBudgetFilterLoose(p.budget_mid_yen, activeBudgetKey));
    return base;
  }, [pins, savedOnly, activeGenreEmoji, activeBudgetKey]);

  const pinById = useMemo(() => {
    const m = new Map<string, PlacePin>();
    pins.forEach((p) => m.set(p.place_id, p));
    return m;
  }, [pins]);

  const recommendedIdSet = useMemo(() => {
    return new Set(aiResults.map((r) => r.place_id));
  }, [aiResults]);

  const recommendItems: RecommendItem[] = useMemo(() => {
    const out: RecommendItem[] = [];
    for (const r of aiResults) {
      const pin = pinById.get(r.place_id);
      if (!pin) continue;

      const posters: Poster[] = Array.from(pin.users.entries())
        .map(([user_id, u]) => ({
          user_id,
          display_name: u.display_name ?? null,
          avatar_url: u.avatar_url ?? null,
        }))
        .sort((a, b) => {
          const ua = pin.users.get(a.user_id)?.latest_created_at ?? 0;
          const ub = pin.users.get(b.user_id)?.latest_created_at ?? 0;
          return ub - ua;
        });

      out.push({
        place_id: pin.place_id,
        name: pin.place_name,
        address: pin.place_address,
        lat: pin.lat,
        lng: pin.lng,

        reason: r.reason ?? null,
        match_score: typeof r.match_score === "number" ? r.match_score : null,

        images: pin.images_sample ?? [],
        price_yen: pin.latest_price_yen ?? null,
        price_range: pin.latest_price_range ?? null,

        // ✅ 追加（Panel側で表示）
        recommend_score: pin.latest_recommend_score ?? null,
        latest_post_id: pin.latest_post_id ?? null,
        posts_sample: (pin.posts_sample ?? []).map((x) => ({
          post_id: x.post_id,
          user_id: x.user_id,
          display_name: x.display_name ?? null,
          avatar_url: x.avatar_url ?? null,
          created_at_ms: x.created_at_ms,
          image_urls: x.image_urls ?? [],
          recommend_score: x.recommend_score ?? null,
          price_yen: x.price_yen ?? null,
          price_range: x.price_range ?? null,
        })),

        genre_emoji: pin.genre_emoji ?? "📍",
        is_saved: pin.is_saved,
        posters,
      });
    }
    return out;
  }, [aiResults, pinById]);

  function makeInfoHtml(pin: PlacePin) {
    const budgetLabel =
      pin.budget_mid_yen != null ? expandedBudgetFromYen(pin.budget_mid_yen).label : "—";
    const genreLabel =
      labelForEmoji(pin.genre_emoji) || (pin.genre_emoji === "📍" ? "未設定" : "その他");

    const rs =
      typeof pin.latest_recommend_score === "number" &&
      pin.latest_recommend_score >= 1 &&
      pin.latest_recommend_score <= 10
        ? pin.latest_recommend_score
        : null;

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
            rs
              ? `<span style="font-size:12px; padding:4px 8px; border-radius:9999px; border:1px solid rgba(255,237,213,1); background:rgba(255,237,213,1); color:#9a3412; font-weight:900;">
                  おすすめ: ${rs}/10
                </span>`
              : ""
          }
          ${
            pin.is_saved
              ? `<span style="font-size:12px; padding:4px 8px; border-radius:9999px; border:1px solid rgba(0,0,0,0.08); background:rgba(255,237,213,1); color:#9a3412; font-weight:800;">保存済み</span>`
              : ""
          }
        </div>
        <div style="font-size:12px;color:#111827;">投稿者: ${pin.users.size}人</div>
      </div>
    `;
    return html;
  }

  async function runAI() {
    const q = aiQuery.trim();
    if (!q) return;

    setAiLoading(true);
    setAiError(null);
    setAiUnderstood(null);
    setAiResults([]);

    // ✅ 候補は「いま地図に出せるもの」だけ（フィルタ反映）
    const candidates = filteredPins.map((p) => ({
      place_id: p.place_id,
      name: p.place_name,
      address: p.place_address,
      lat: p.lat,
      lng: p.lng,
      genre_emoji: p.genre_emoji,
      budget_mid_yen: p.budget_mid_yen,
      is_saved: p.is_saved,

      // backendが使わなくてもOK：将来拡張用
      images_sample: p.images_sample ?? [],
      price_yen: p.latest_price_yen ?? null,
      price_range: p.latest_price_range ?? null,

      // ✅ 追加：推薦カードで使うデータ（API側が無視してもOK）
      latest_post_id: p.latest_post_id ?? null,
      recommend_score: p.latest_recommend_score ?? null,
    }));

    try {
      const res = await fetch("/api/recommend-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          maxResults: Math.max(1, Math.min(5, aiMaxResults)),
          candidates,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Failed (${res.status})`);

      // 想定形： { understood: { summary }, results: [{ place_id, reason, match_score }] }
      const summary = payload?.understood?.summary ?? null;
      const results = Array.isArray(payload?.results) ? payload.results : [];

      setAiUnderstood(summary);

      setAiResults(
        results
          .map((r: any) => ({
            place_id: String(r?.place_id ?? ""),
            reason: typeof r?.reason === "string" ? r.reason : "",
            match_score: typeof r?.match_score === "number" ? r.match_score : undefined,
          }))
          .filter((x: any) => !!x.place_id)
      );
    } catch (e: any) {
      setAiError(e?.message ?? "検索に失敗しました");
    } finally {
      setAiLoading(false);
    }
  }

  function focusPlace(placeId: string) {
    const pin = pinById.get(placeId);
    const map = mapRef.current;
    const marker = markerByPlaceIdRef.current.get(placeId);
    if (!pin || !map || !marker) return;

    map.panTo({ lat: pin.lat, lng: pin.lng });
    map.setZoom(Math.max(14, map.getZoom?.() ?? 14));

    try {
      infoRef.current?.setContent(makeInfoHtml(pin));
      infoRef.current?.open({ map, anchor: marker });
    } catch {}
  }

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

      // 2) profiles avatars (+display_name)
      const { data: profiles, error: prErr } = await supabase
        .from("profiles")
        .select("id, avatar_url, display_name")
        .in("id", followeeIds);

      if (prErr) console.warn("profiles fetch error:", prErr.message);

      const profileByUser = new Map<
        string,
        { avatar_url: string | null; display_name: string | null }
      >();
      (profiles as ProfileRow[] | null)?.forEach((p) =>
        profileByUser.set(p.id, {
          avatar_url: p.avatar_url ?? null,
          display_name: (p as any).display_name ?? null,
        })
      );

      // 3) posts (include images/budget + recommend_score)
      const { data: posts, error: poErr } = await supabase
        .from("posts")
        .select(
          "id, user_id, place_id, place_name, place_address, created_at, image_urls, price_yen, price_range, recommend_score"
        )
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
        const prof = profileByUser.get(uid);
        const avatarUrl = prof?.avatar_url ?? null;
        const displayName = prof?.display_name ?? null;

        const img0 =
          Array.isArray(p.image_urls) && p.image_urls.length ? (p.image_urls[0] ?? null) : null;

        const mid =
          typeof p.price_yen === "number" && Number.isFinite(p.price_yen)
            ? p.price_yen
            : parsePriceRangeToYen(p.price_range ?? null);

        const rec =
          typeof p.recommend_score === "number" && Number.isFinite(p.recommend_score)
            ? p.recommend_score
            : null;

        const existing = pinByPlace.get(p.place_id);

        if (!existing) {
          const users = new Map<
            string,
            { avatar_url: string | null; display_name: string | null; latest_created_at: number }
          >();
          users.set(uid, { avatar_url: avatarUrl, display_name: displayName, latest_created_at: createdMs });

          const firstMini = {
            post_id: p.id,
            user_id: uid,
            display_name: displayName,
            avatar_url: avatarUrl,
            created_at_ms: createdMs,
            image_urls: Array.isArray(p.image_urls) ? (p.image_urls.filter(Boolean) as string[]) : [],
            recommend_score: rec,
            price_yen: typeof p.price_yen === "number" ? p.price_yen : null,
            price_range: p.price_range ?? null,
          };

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

            images_sample: uniqLimit([img0 ?? ""], 5),
            latest_price_yen: typeof p.price_yen === "number" ? p.price_yen : null,
            latest_price_range: p.price_range ?? null,

            latest_recommend_score: rec,

            posts_sample: [firstMini],

            budget_mid_yen: mid ?? null,

            genre_emoji: emojiByPlace.get(p.place_id) ?? "📍",
            is_saved: savedSet.has(p.place_id),
          });
        } else {
          // user latest
          const u = existing.users.get(uid);
          if (!u || createdMs > u.latest_created_at) {
            existing.users.set(uid, { avatar_url: avatarUrl, display_name: displayName, latest_created_at: createdMs });
          }

          // images sample（各postの先頭画像だけ集める）
          if (img0) {
            existing.images_sample = uniqLimit([...(existing.images_sample ?? []), img0], 5);
          }

          // ✅ posts_sample 追加（重複防止 + 最新順 + 上限8）
          const existed = existing.posts_sample?.some((x) => x.post_id === p.id) ?? false;
          if (!existed) {
            const mini = {
              post_id: p.id,
              user_id: uid,
              display_name: displayName,
              avatar_url: avatarUrl,
              created_at_ms: createdMs,
              image_urls: Array.isArray(p.image_urls) ? (p.image_urls.filter(Boolean) as string[]) : [],
              recommend_score: rec,
              price_yen: typeof p.price_yen === "number" ? p.price_yen : null,
              price_range: p.price_range ?? null,
            };

            existing.posts_sample = [mini, ...(existing.posts_sample ?? [])]
              .sort((a, b) => b.created_at_ms - a.created_at_ms)
              .slice(0, 8);
          }

          // latest post info
          if (createdMs > existing.latest_post_at) {
            existing.latest_post_at = createdMs;
            existing.latest_user_id = uid;
            existing.place_name = placeName || existing.place_name;
            existing.place_address = placeAddr || existing.place_address;

            existing.latest_post_id = p.id;
            existing.latest_image_url = img0 ?? existing.latest_image_url;

            existing.latest_price_yen = typeof p.price_yen === "number" ? p.price_yen : existing.latest_price_yen;
            existing.latest_price_range = p.price_range ?? existing.latest_price_range;

            existing.budget_mid_yen = (mid ?? null) ?? existing.budget_mid_yen;

            // ✅ 最新投稿のおすすめ度
            existing.latest_recommend_score = rec ?? existing.latest_recommend_score;
          }
        }
      }

      const pinsSorted = Array.from(pinByPlace.values()).sort(
        (a, b) => b.latest_post_at - a.latest_post_at
      );

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

  /** ---- Render markers whenever filteredPins / iconMode / AI results change ---- */
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

      const highlight = recommendedIdSet.has(pin.place_id);

      const content =
        iconMode === "photo"
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
        infoRef.current?.setContent(makeInfoHtml(pin));
        infoRef.current?.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
      markerByPlaceIdRef.current.set(pin.place_id, marker);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    }

    map.fitBounds(bounds, 60);
  }, [filteredPins, iconMode, recommendedIdSet]);

  return (
    <div style={{ width: "100%" }}>
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900 }}>マップ</div>

        {status === "loading" && (
          <div style={{ fontSize: 12, color: "#6b7280" }}>読み込み中…</div>
        )}
        {status === "error" && (
          <div style={{ fontSize: 12, color: "#ef4444" }}>{errorText}</div>
        )}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* saved only */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#374151",
            }}
          >
            <input
              type="checkbox"
              checked={savedOnly}
              onChange={(e) => setSavedOnly(e.target.checked)}
            />
            保存済みのみ
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

      {/* genre chips */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 10,
        }}
      >
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

      {/* AI search panel */}
      <div className="mb-3 rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
        <MapRecommendPanel
          query={aiQuery}
          onChangeQuery={setAiQuery}
          maxResults={aiMaxResults}
          onChangeMaxResults={setAiMaxResults}
          onRun={runAI}
          loading={aiLoading}
          understoodSummary={aiError ? `エラー: ${aiError}` : aiUnderstood}
          items={recommendItems}
          onFocusPlace={focusPlace}
        />
      </div>

      {/* map */}
      <div style={{ position: "relative" }}>
        <div
          ref={mapDivRef}
          style={{
            width: "100%",
            height: "calc(100dvh - 310px)",
            borderRadius: 16,
            overflow: "hidden",
            background: "#f3f4f6",
          }}
        />
      </div>

      {/* footer hint */}
      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
        pins: {filteredPins.length} / total: {pins.length}
      </div>
    </div>
  );
}
