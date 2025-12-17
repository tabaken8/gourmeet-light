"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  ExternalLink,
  RefreshCw,
  Trash2,
  X,
  SlidersHorizontal,
  Check,
  Image as ImageIcon,
  Smile,
} from "lucide-react";

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

type PostMiniRow = {
  id: string;
  place_id: string | null;
  price_yen: number | null;
  price_range: string | null;
  image_urls: string[] | null;
};

type GenreOption = { key: string; emoji: string; label: string };

const GENRES: GenreOption[] = [
  { key: "ramen", emoji: "🍜", label: "ラーメン" },
  { key: "sushi", emoji: "🍣", label: "寿司" },
  { key: "yakiniku", emoji: "🥩", label: "焼肉" },
  { key: "yakitori_izakaya", emoji: "🍢", label: "焼き鳥/居酒屋" },
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

/** ✅ ライト地図でも見やすいチャコール半透明（白縁＋影） */
function makeEmojiSvgDataUrl(emoji: string) {
  const e = (emoji || "📍").slice(0, 4);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56">
    <defs>
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="rgba(0,0,0,0.28)"/>
      </filter>
    </defs>
    <g filter="url(#s)">
      <circle cx="28" cy="28" r="21" fill="rgba(17,24,39,0.78)" stroke="rgba(255,255,255,0.85)" stroke-width="2"/>
      <circle cx="28" cy="28" r="20" fill="rgba(17,24,39,0.60)"/>
      <text x="28" y="35" text-anchor="middle" font-size="20"
        font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${escapeHtml(
          e
        )}</text>
    </g>
  </svg>`;
  const encoded = encodeURIComponent(svg).replaceAll("'", "%27").replaceAll('"', "%22");
  return `data:image/svg+xml;charset=UTF-8,${encoded}`;
}

/** ---- Budget helpers ---- */
type BudgetKey = "any" | "0_2000" | "2000_5000" | "5000_10000" | "10000_20000" | "20000_plus";
const BUDGETS: Array<{ key: BudgetKey; label: string; min: number | null; max: number | null }> = [
  { key: "any", label: "指定なし", min: null, max: null },
  { key: "0_2000", label: "〜 ¥2,000", min: 0, max: 2000 },
  { key: "2000_5000", label: "¥2,000〜¥5,000", min: 2000, max: 5000 },
  { key: "5000_10000", label: "¥5,000〜¥10,000", min: 5000, max: 10000 },
  { key: "10000_20000", label: "¥10,000〜¥20,000", min: 10000, max: 20000 },
  { key: "20000_plus", label: "¥20,000〜", min: 20000, max: null },
];

function parsePriceRangeToYen(priceRange: string | null): number | null {
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

/** y から「所属レンジ」を推定 */
function budgetIndexFromYen(y: number): number {
  // BUDGETS[0] は any なので除外
  for (let i = 1; i < BUDGETS.length; i++) {
    const b = BUDGETS[i];
    const minOK = b.min == null ? true : y >= b.min;
    const maxOK = b.max == null ? true : y <= b.max;
    if (minOK && maxOK) return i;
  }
  return BUDGETS.length - 1;
}

/** ✅ ±1段階広げた「目安レンジ」 */
function expandedBudgetFromYen(y: number) {
  const i = budgetIndexFromYen(y);
  const lo = Math.max(1, i - 1);
  const hi = Math.min(BUDGETS.length - 1, i + 1);
  const min = BUDGETS[lo].min ?? 0;
  const max = BUDGETS[hi].max; // null あり
  const label = max == null ? `${formatYen(min)}〜` : `${formatYen(min)}〜${formatYen(max)}`;
  return { min, max, label };
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

/** 画像カルーセル（軽量） */
function MiniCarousel({
  images,
  postHref,
}: {
  images: string[];
  postHref: string;
}) {
  if (!images?.length) return null;

  return (
    <div className="-mx-3 mt-2">
      <div className="flex gap-2 overflow-x-auto px-3 pb-1 snap-x snap-mandatory">
        {images.slice(0, 10).map((url, idx) => (
          <Link
            key={`${url}-${idx}`}
            href={postHref}
            className="snap-start shrink-0"
            aria-label="投稿を開く"
          >
            <img
              src={url}
              alt=""
              className="h-28 w-40 rounded-xl object-cover border border-black/10 bg-black/[.02]"
              loading="lazy"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

type IconMode = "emoji" | "photo";

export default function SavedPlacesMap() {
  const supabase = createClientComponentClient();

  const [rawRows, setRawRows] = useState<RawUserPlaceRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [placeToCollectionIds, setPlaceToCollectionIds] = useState<Map<string, Set<string>>>(
    new Map()
  );

  const [placeToEmoji, setPlaceToEmoji] = useState<Map<string, string>>(new Map());
  const [placeToSuggestedEmoji, setPlaceToSuggestedEmoji] = useState<Map<string, string>>(new Map());

  const [placeToBudgetYen, setPlaceToBudgetYen] = useState<Map<string, number>>(new Map());
  const [placeToBudgetRange, setPlaceToBudgetRange] = useState<Map<string, string>>(new Map());

  const [postIdToImages, setPostIdToImages] = useState<Map<string, string[]>>(new Map());

  // 表に出すのはジャンルだけ
  const [activeGenreEmoji, setActiveGenreEmoji] = useState<string | null>(null);

  // 詳細フィルター内
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [activeBudgetKey, setActiveBudgetKey] = useState<BudgetKey>("any");

  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ フィルターモーダル
  const [filterOpen, setFilterOpen] = useState(false);
  const [tmpCollectionId, setTmpCollectionId] = useState<string | null>(null);
  const [tmpBudgetKey, setTmpBudgetKey] = useState<BudgetKey>("any");

  const [confirm, setConfirm] = useState<{
    open: boolean;
    placeId: string | null;
    placeName: string | null;
  }>({ open: false, placeId: null, placeName: null });

  const [emojiPicker, setEmojiPicker] = useState<{
    open: boolean;
    placeId: string | null;
    placeName: string | null;
    currentEmoji: string;
  }>({ open: false, placeId: null, placeName: null, currentEmoji: "📍" });

  const [customEmoji, setCustomEmoji] = useState<string>("");
  const [savingEmoji, setSavingEmoji] = useState(false);

  const [iconMode, setIconMode] = useState<IconMode>("emoji");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [userId, setUserId] = useState<string | null>(null);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const placeIdToMarkerRef = useRef<Map<string, any>>(new Map());

  const suggestInFlightRef = useRef<Map<string, Promise<string>>>(new Map());

  useEffect(() => {
    try {
      const v = localStorage.getItem("savedPlacesIconMode");
      if (v === "emoji" || v === "photo") setIconMode(v);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("savedPlacesIconMode", iconMode);
    } catch {}
  }, [iconMode]);

  const rows: NormalizedRow[] = useMemo(() => {
    return rawRows.map((r) => {
      const p = normalizePlace(r.place ?? r.places);
      return { ...r, place: p };
    });
  }, [rawRows]);

  const getEmoji = (placeId: string) => {
    const userE = placeToEmoji.get(placeId);
    if (userE && userE.trim()) return userE;

    const sugE = placeToSuggestedEmoji.get(placeId);
    if (sugE && sugE.trim()) return sugE;

    return "📍";
  };

  const getBudgetYen = (placeId: string) => {
    const v = placeToBudgetYen.get(placeId);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  /** 店の「目安予算（±1段階）」 */
  const getBudgetLooseLabel = (placeId: string) => {
    const y = getBudgetYen(placeId);
    if (y != null) return expandedBudgetFromYen(y).label;

    const range = placeToBudgetRange.get(placeId) ?? null;
    const mid = range ? parsePriceRangeToYen(range) : null;
    if (mid != null) return expandedBudgetFromYen(mid).label;

    return "—";
  };

  /** 予算フィルタは「ゆるめレンジ」と選択レンジが交差するか */
  const passesBudgetFilterLoose = (placeId: string, budgetKey: BudgetKey) => {
    if (budgetKey === "any") return true;

    const selected = BUDGETS.find((b) => b.key === budgetKey);
    if (!selected || selected.min == null) return true;

    const y = getBudgetYen(placeId);
    const range = placeToBudgetRange.get(placeId) ?? null;
    const mid = y ?? (range ? parsePriceRangeToYen(range) : null);
    if (mid == null) return false;

    const loose = expandedBudgetFromYen(mid);
    const selMin = selected.min ?? 0;
    const selMax = selected.max; // null あり

    const aMin = loose.min;
    const aMax = loose.max;

    const left = Math.max(aMin, selMin);
    const right =
      aMax == null && selMax == null
        ? Infinity
        : Math.min(aMax == null ? Infinity : aMax, selMax == null ? Infinity : selMax);

    return left <= right;
  };

  const getImagesForRow = (r: NormalizedRow) => {
    const pid = r.last_post_id;
    if (!pid) return [];
    return postIdToImages.get(pid) ?? [];
  };

  const getFirstImageForRow = (r: NormalizedRow) => {
    const imgs = getImagesForRow(r);
    return imgs?.[0] ?? null;
  };

  const filteredRows = useMemo(() => {
    let base = rows;

    if (activeCollectionId) {
      base = base.filter((r) => placeToCollectionIds.get(r.place_id)?.has(activeCollectionId));
    }

    if (activeGenreEmoji) {
      base = base.filter((r) => getEmoji(r.place_id) === activeGenreEmoji);
    }

    if (activeBudgetKey !== "any") {
      base = base.filter((r) => passesBudgetFilterLoose(r.place_id, activeBudgetKey));
    }

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows,
    activeCollectionId,
    activeGenreEmoji,
    activeBudgetKey,
    placeToCollectionIds,
    placeToEmoji,
    placeToSuggestedEmoji,
    placeToBudgetYen,
    placeToBudgetRange,
  ]);

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

  const genreCounts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const e = getEmoji(r.place_id);
      m.set(e, (m.get(e) ?? 0) + 1);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, placeToEmoji, placeToSuggestedEmoji]);

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

  const activeCollectionName = useMemo(() => {
    if (!activeCollectionId) return "すべて";
    return collections.find((c) => c.id === activeCollectionId)?.name ?? "選択中";
  }, [activeCollectionId, collections]);

  const activeGenreName = useMemo(() => {
    if (!activeGenreEmoji) return "すべて";
    const l = labelForEmoji(activeGenreEmoji);
    return l ? `${activeGenreEmoji} ${l}` : `${activeGenreEmoji}`;
  }, [activeGenreEmoji]);

  const activeBudgetName = useMemo(() => {
    return (BUDGETS.find((x) => x.key === activeBudgetKey) ?? BUDGETS[0]).label;
  }, [activeBudgetKey]);

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

  const fetchLastPostsMeta = async (lastPostIds: string[]) => {
    try {
      const uniq = Array.from(new Set(lastPostIds)).filter(Boolean);
      if (uniq.length === 0) {
        setPlaceToBudgetYen(new Map());
        setPlaceToBudgetRange(new Map());
        setPostIdToImages(new Map());
        return;
      }

      const CHUNK = 100;
      const yenMap = new Map<string, number>();
      const rangeMap = new Map<string, string>();
      const imagesMap = new Map<string, string[]>();

      for (let i = 0; i < uniq.length; i += CHUNK) {
        const chunk = uniq.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("posts")
          .select("id, place_id, price_yen, price_range, image_urls")
          .in("id", chunk);

        if (error) {
          console.warn("[posts meta] fetch failed:", error.message);
          continue;
        }

        (data ?? []).forEach((row: any) => {
          const p = row as PostMiniRow;
          if (!p.id) return;

          if (Array.isArray(p.image_urls) && p.image_urls.length) {
            imagesMap.set(p.id, p.image_urls.filter(Boolean));
          } else {
            imagesMap.set(p.id, []);
          }

          if (!p.place_id) return;

          const y =
            typeof p.price_yen === "number" && Number.isFinite(p.price_yen)
              ? p.price_yen
              : parsePriceRangeToYen(p.price_range);

          if (y != null) yenMap.set(p.place_id, y);
          if (p.price_range) rangeMap.set(p.place_id, p.price_range);
        });
      }

      setPlaceToBudgetYen(yenMap);
      setPlaceToBudgetRange(rangeMap);
      setPostIdToImages(imagesMap);
    } catch (e) {
      console.warn("[posts meta] exception:", e);
      setPlaceToBudgetYen(new Map());
      setPlaceToBudgetRange(new Map());
      setPostIdToImages(new Map());
    }
  };

  const fetchSuggestedEmojiOne = async (placeId: string): Promise<string> => {
    if (placeToEmoji.get(placeId)) return "";
    const existing = placeToSuggestedEmoji.get(placeId);
    if (existing) return existing;

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

        const emoji = (j?.suggestion?.emoji ?? j?.suggestedEmoji ?? "").toString().trim();
        if (!emoji) return "";

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
    const targets = placeIds.filter((pid) => {
      if (!pid) return false;
      if (placeToEmoji.get(pid)) return false;
      if (placeToSuggestedEmoji.get(pid)) return false;
      return true;
    });

    if (targets.length === 0) return;

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

    const rs = (data ?? []) as RawUserPlaceRow[];
    setRawRows(rs);

    const placeIds = rs.map((r) => r.place_id).filter(Boolean);
    const lastPostIds = rs.map((r) => r.last_post_id).filter(Boolean) as string[];

    await Promise.all([
      fetchPins(uid, placeIds),
      fetchSuggestedEmojis(placeIds),
      fetchLastPostsMeta(lastPostIds),
    ]);

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
          scaledSize: new window.google.maps.Size(44, 44),
          anchor: new window.google.maps.Point(22, 22),
        },
      });

      marker.addListener("click", () => {
        const html = `
          <div style="max-width:240px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <div style="width:30px; height:30px; border-radius:16px; border:1px solid rgba(255,255,255,0.35); display:flex; align-items:center; justify-content:center; background:rgba(17,24,39,0.78);">
                ${escapeHtml(emoji)}
              </div>
              <div style="font-weight:600; font-size:14px;">
                ${escapeHtml(p.name ?? "Saved Place")}
              </div>
            </div>
            <div style="font-size:12px; color:rgba(0,0,0,0.7); margin-bottom:10px;">
              ${escapeHtml(p.address ?? "")}
            </div>
            <div style="font-size:12px; color:rgba(0,0,0,0.55); margin-bottom:6px;">
              ジャンル: ${escapeHtml(labelForEmoji(emoji) || "未設定")}
            </div>
            <div style="font-size:12px; color:rgba(0,0,0,0.55); margin-bottom:10px;">
              予算(目安): ${escapeHtml(getBudgetLooseLabel(p.place_id))}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapReady,
    mappable,
    placeToEmoji,
    placeToSuggestedEmoji,
    placeToBudgetYen,
    placeToBudgetRange,
    activeCollectionId,
    activeGenreEmoji,
    activeBudgetKey,
  ]);

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
          <div style="width:30px; height:30px; border-radius:16px; border:1px solid rgba(255,255,255,0.35); display:flex; align-items:center; justify-content:center; background:rgba(17,24,39,0.78);">
            ${escapeHtml(emoji)}
          </div>
          <div style="font-weight:600; font-size:14px;">
            ${escapeHtml(p.name ?? "Saved Place")}
          </div>
        </div>
        <div style="font-size:12px; color:rgba(0,0,0,0.7); margin-bottom:10px;">
          ${escapeHtml(p.address ?? "")}
        </div>
        <div style="font-size:12px; color:rgba(0,0,0,0.55); margin-bottom:6px;">
          ジャンル: ${escapeHtml(labelForEmoji(emoji) || "未設定")}
        </div>
        <div style="font-size:12px; color:rgba(0,0,0,0.55); margin-bottom:10px;">
          予算(目安): ${escapeHtml(getBudgetLooseLabel(placeId))}
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

  // ===== Filter modal handlers =====
  const openFilter = () => {
    setTmpCollectionId(activeCollectionId);
    setTmpBudgetKey(activeBudgetKey);
    setFilterOpen(true);
  };

  const applyFilter = () => {
    setActiveCollectionId(tmpCollectionId);
    setActiveBudgetKey(tmpBudgetKey);
    setFilterOpen(false);
  };

  const resetFilter = () => {
    setTmpCollectionId(null);
    setTmpBudgetKey("any");
  };

  const toggleIconMode = () => {
    setIconMode((m) => (m === "emoji" ? "photo" : "emoji"));
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
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
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                保存した場所{" "}
                <span className="text-black/40">・ジャンル: {activeGenreName}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleIconMode}
                className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs hover:bg-black/5"
                title="アイコン表示を切り替え"
              >
                {iconMode === "emoji" ? <Smile className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                {iconMode === "emoji" ? "絵文字" : "写真"}
              </button>

              <button
                type="button"
                onClick={openFilter}
                className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs hover:bg-black/5"
              >
                <SlidersHorizontal className="h-4 w-4" />
                詳細フィルター
              </button>

              <button
                type="button"
                onClick={fetchSaved}
                className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs hover:bg-black/5"
              >
                <RefreshCw className="h-4 w-4" />
                更新
              </button>
            </div>
          </div>

          {/* 表に出すのはジャンルだけ */}
          <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Chip active={!activeGenreEmoji} onClick={() => setActiveGenreEmoji(null)}>
              すべて
            </Chip>
            {availableGenres.map((g) => (
              <Chip
                key={`${g.emoji}-${g.label}`}
                active={activeGenreEmoji === g.emoji}
                onClick={() => setActiveGenreEmoji(g.emoji)}
              >
                {g.emoji} {g.label}
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
                const emoji = getEmoji(r.place_id);
                const genreLabel = labelForEmoji(emoji);
                const postHref = r.last_post_id ? `/post/${r.last_post_id}` : "#";
                const images = getImagesForRow(r);
                const firstImg = getFirstImageForRow(r);

                return (
                  <div key={r.place_id} className="rounded-2xl border border-black/10 p-3 hover:bg-black/5">
                    <div className="flex items-start gap-3">
                      {/* icon (emoji/photo) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEmojiPicker(r.place_id, p?.name ?? null);
                        }}
                        className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-black/10 bg-white overflow-hidden shrink-0"
                        aria-label="ジャンル（絵文字）を変更"
                        title="ジャンル（絵文字）を変更"
                      >
                        {iconMode === "photo" && firstImg ? (
                          <img src={firstImg} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-2xl">{emoji}</span>
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => focusPlace(r.place_id)}
                          className="w-full text-left"
                          aria-label={`${name} を地図で表示`}
                        >
                          <div className="truncate text-sm font-semibold">{name}</div>

                          {/* 情報量は削り気味：ジャンル＋目安予算だけ */}
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[.03] px-2 py-0.5 text-black/70">
                              {emoji} {genreLabel || "未設定"}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[.03] px-2 py-0.5 text-black/70">
                              予算(目安) {getBudgetLooseLabel(r.place_id)}
                            </span>
                          </div>
                        </button>

                        {/* 投稿画像カルーセル */}
                        {r.last_post_id && images.length > 0 && (
                          <MiniCarousel images={images} postHref={postHref} />
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <a
                              href={buildGoogleMapsUrl(r.place_id, p?.name)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-white"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Google
                            </a>

                            {r.last_post_id && (
                              <Link
                                href={postHref}
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
                            ※ この場所はまだ座標が未取得なので、地図には表示されません
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========= 詳細フィルター（PCは横に広く、×は常に見える） ========= */}
      {filterOpen && (
        <div className="fixed inset-0 z-[350] bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="close-overlay"
            onClick={() => setFilterOpen(false)}
          />

          <div className="absolute inset-0 flex items-end justify-center sm:items-center px-3 pb-3 sm:pb-0">
            <div className="relative w-full sm:max-w-6xl sm:h-[86vh] rounded-t-3xl sm:rounded-2xl bg-white shadow-xl overflow-hidden">
              {/* header (sticky) */}
              <div className="sticky top-0 z-10 bg-white border-b border-black/10 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">詳細フィルター</div>
                    <div className="mt-0.5 text-[12px] text-black/45 truncate">
                      現在：{activeCollectionName} / 予算: {activeBudgetName}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="shrink-0 rounded-full p-2 text-black/50 hover:bg-black/5"
                    aria-label="閉じる"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-4">
                {/* Desktop */}
                <div className="hidden sm:grid grid-cols-12 gap-4 h-[calc(86vh-56px-76px)]">
                  {/* collections */}
                  <div className="col-span-6 rounded-2xl border border-black/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-black/10 bg-white">
                      <div className="text-xs font-semibold text-black/60">コレクション</div>
                    </div>
                    <div className="p-3 overflow-y-auto h-full">
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setTmpCollectionId(null)}
                          className={[
                            "w-full rounded-2xl border px-3 py-3 text-left transition",
                            !tmpCollectionId
                              ? "border-orange-400 bg-orange-50"
                              : "border-black/10 hover:bg-black/5",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">すべて</div>
                            {!tmpCollectionId && (
                              <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                                <Check className="h-4 w-4" /> 選択中
                              </span>
                            )}
                          </div>
                        </button>

                        {collections.map((c) => {
                          const active = tmpCollectionId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setTmpCollectionId(c.id)}
                              className={[
                                "w-full rounded-2xl border px-3 py-3 text-left transition",
                                active
                                  ? "border-orange-400 bg-orange-50"
                                  : "border-black/10 hover:bg-black/5",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold truncate">{c.name}</div>
                                {active && (
                                  <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                                    <Check className="h-4 w-4" /> 選択中
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* budget */}
                  <div className="col-span-6 rounded-2xl border border-black/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-black/10 bg-white">
                      <div className="text-xs font-semibold text-black/60">予算</div>
                      <div className="mt-1 text-[11px] text-black/45">
                        ※ 投稿者入力が前提なので、判定は±1段階ゆるめ（目安）
                      </div>
                    </div>
                    <div className="p-3 overflow-y-auto h-full">
                      <div className="space-y-2">
                        {BUDGETS.map((b) => {
                          const active = tmpBudgetKey === b.key;
                          return (
                            <button
                              key={b.key}
                              type="button"
                              onClick={() => setTmpBudgetKey(b.key)}
                              className={[
                                "w-full rounded-2xl border px-3 py-3 text-left transition",
                                active
                                  ? "border-orange-400 bg-orange-50"
                                  : "border-black/10 hover:bg-black/5",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold">{b.label}</div>
                                {active && (
                                  <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                                    <Check className="h-4 w-4" /> 選択中
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-[11px] text-black/45">
                                ※ 予算未登録の店は予算フィルタ時は除外
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile */}
                <div className="sm:hidden space-y-4 max-h-[68vh] overflow-y-auto pr-1">
                  <div>
                    <div className="text-xs font-semibold text-black/60 mb-2">コレクション</div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setTmpCollectionId(null)}
                        className={[
                          "w-full rounded-2xl border px-3 py-3 text-left transition",
                          !tmpCollectionId
                            ? "border-orange-400 bg-orange-50"
                            : "border-black/10 hover:bg-black/5",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">すべて</div>
                          {!tmpCollectionId && (
                            <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                              <Check className="h-4 w-4" /> 選択中
                            </span>
                          )}
                        </div>
                      </button>

                      {collections.map((c) => {
                        const active = tmpCollectionId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setTmpCollectionId(c.id)}
                            className={[
                              "w-full rounded-2xl border px-3 py-3 text-left transition",
                              active
                                ? "border-orange-400 bg-orange-50"
                                : "border-black/10 hover:bg-black/5",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold truncate">{c.name}</div>
                              {active && (
                                <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                                  <Check className="h-4 w-4" /> 選択中
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-black/60 mb-1">予算</div>
                    <div className="text-[11px] text-black/45 mb-2">
                      ※ 投稿者入力が前提なので、判定は±1段階ゆるめ（目安）
                    </div>
                    <div className="space-y-2">
                      {BUDGETS.map((b) => {
                        const active = tmpBudgetKey === b.key;
                        return (
                          <button
                            key={b.key}
                            type="button"
                            onClick={() => setTmpBudgetKey(b.key)}
                            className={[
                              "w-full rounded-2xl border px-3 py-3 text-left transition",
                              active
                                ? "border-orange-400 bg-orange-50"
                                : "border-black/10 hover:bg-black/5",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold">{b.label}</div>
                              {active && (
                                <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                                  <Check className="h-4 w-4" /> 選択中
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[11px] text-black/45">
                              ※ 予算未登録の店は予算フィルタ時は除外
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* footer (sticky) */}
              <div className="sticky bottom-0 z-10 bg-white border-t border-black/10 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={resetFilter}
                    className="rounded-xl border border-black/10 px-4 py-3 text-sm hover:bg-black/5"
                  >
                    リセット
                  </button>

                  <button
                    type="button"
                    onClick={applyFilter}
                    className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700"
                  >
                    適用
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========= Emoji Picker ========= */}
      {emojiPicker.open && (
        <div className="fixed inset-0 z-[320] bg-black/40 backdrop-blur-sm">
          <div className="absolute inset-0 flex items-end justify-center sm:items-center px-3 pb-3 sm:pb-0">
            <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">ジャンルを変更</div>
                  <div className="mt-0.5 text-[12px] text-black/50 truncate">
                    {emojiPicker.placeName ?? "この場所"} / 現在：{" "}
                    <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[.03] px-2 py-0.5">
                      <span className="text-base">{emojiPicker.currentEmoji || "📍"}</span>
                      <span>{labelForEmoji(emojiPicker.currentEmoji) || "未設定"}</span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeEmojiPicker}
                  className="rounded-full p-2 text-black/50 hover:bg-black/5"
                  aria-label="閉じる"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4">
                <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
                  {GENRES.map((g) => {
                    const active = emojiPicker.currentEmoji === g.emoji;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        disabled={savingEmoji}
                        onClick={() => emojiPicker.placeId && setEmojiForPlace(emojiPicker.placeId, g.emoji)}
                        className={[
                          "w-full rounded-2xl border px-3 py-3 text-left transition",
                          active ? "border-orange-400 bg-orange-50" : "border-black/10 hover:bg-black/5",
                          savingEmoji ? "opacity-60 cursor-not-allowed" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-2xl border border-black/10 bg-white flex items-center justify-center text-2xl">
                              {g.emoji}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{g.label}</div>
                            </div>
                          </div>

                          {active ? (
                            <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                              <Check className="h-4 w-4" /> 選択中
                            </span>
                          ) : (
                            <span className="text-xs text-black/35">選ぶ</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl border border-black/10 p-3">
                  <div className="text-xs font-semibold text-black/60">カスタム</div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={customEmoji}
                      onChange={(e) => setCustomEmoji(e.target.value)}
                      placeholder="絵文字を貼り付け（例: 🥶）"
                      className="w-full rounded-xl border border-black/20 px-3 py-3 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      disabled={savingEmoji}
                    />
                    <button
                      type="button"
                      onClick={commitCustomEmoji}
                      disabled={savingEmoji || !customEmoji.trim()}
                      className="shrink-0 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                    >
                      適用
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => emojiPicker.placeId && resetEmojiForPlace(emojiPicker.placeId)}
                      disabled={savingEmoji}
                      className="text-xs text-red-600 hover:underline disabled:opacity-60"
                    >
                      ユーザー設定を消す（サジェストに戻す/無ければ📍）
                    </button>

                    <button type="button" onClick={closeEmojiPicker} className="text-xs text-black/50 hover:underline">
                      閉じる
                    </button>
                  </div>
                </div>

                {savingEmoji && <div className="mt-3 text-center text-xs text-black/50">保存中...</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========= Delete modal ========= */}
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
