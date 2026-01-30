// src/components/ProfileYearStats.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EyeOff, Eye } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useRouter } from "next/navigation";

type Scope = "me" | "public";
type BadgeTier = "none" | "bronze" | "silver" | "gold" | "diamond";

type TitleMeta = {
  kind: "starter" | "king" | "allrounder" | "traveler" | "steady" | "celebrity" | "local";
  emoji: string; // 左に出す
  accent: "amber" | "violet" | "rose" | "sky";
};

type BadgeProgress = {
  tier: BadgeTier;
  value: number;
  nextTier: BadgeTier | null;
  nextAt: number | null;
};

type MeResponse = {
  ok: true;
  scope: "me";
  userId: string;
  year: number | "all";

  title: string;
  titleMeta: TitleMeta;

  totals: { posts: number };
  topGenre: null | { genre: string; count: number; topPercent: number };
  globalRank: null;

  pie: Array<{ name: string; value: number }>;

  badges: {
    genre: BadgeProgress;
    posts: BadgeProgress;
  };
};

type PublicResponse = {
  ok: true;
  scope: "public";
  userId: string;
  year: number | "all";

  title: string;
  titleMeta: TitleMeta;

  totals: { posts: number };
  topGenre: null | { genre: string; count: number; topPercent: number };
  globalRank: null;

  badges: {
    genreTier: BadgeTier;
    postsTier: BadgeTier;
  };
};

type ApiResponse = MeResponse | PublicResponse | { error: string };

function isErr(x: ApiResponse | null): x is { error: string } {
  return !!(x as any)?.error;
}

function topPercentPretty(p: number) {
  if (!Number.isFinite(p)) return null;
  return p.toFixed(2);
}

/** -------- UI helper: gradient accent -------- */
function accentRing(a: TitleMeta["accent"]) {
  switch (a) {
    case "amber":
      return "from-amber-200/80 via-orange-100/60 to-amber-200/80 ring-amber-200/60";
    case "violet":
      return "from-violet-200/80 via-fuchsia-100/60 to-violet-200/80 ring-violet-200/60";
    case "rose":
      return "from-rose-200/80 via-orange-100/60 to-rose-200/80 ring-rose-200/60";
    case "sky":
    default:
      return "from-sky-200/70 via-white/60 to-sky-200/70 ring-sky-200/60";
  }
}

/** -------- "メダル"は絵文字で -------- */
function tierEmoji(t: BadgeTier) {
  switch (t) {
    case "bronze":
      return "🥉";
    case "silver":
      return "🥈";
    case "gold":
      return "🥇";
    case "diamond":
      return "💎";
    default:
      return null;
  }
}

function nextTierHint(nextTier: BadgeTier | null, nextAt: number | null, now: number) {
  if (!nextTier || nextAt === null) return null;
  const left = Math.max(0, nextAt - (Number.isFinite(now) ? now : 0));
  return { left, targetText: `${nextAt}` };
}

/** -------- Title plate -------- */
function TitlePlate({
  title,
  meta,
  topGenre,
  totalsPosts,
}: {
  title: string;
  meta: TitleMeta;
  topGenre: null | { genre: string; topPercent: number };
  totalsPosts: number;
}) {
  const grad = accentRing(meta.accent);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-black/[.06] bg-white/70 p-4">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className={["absolute -inset-x-10 -top-10 h-24 rotate-6 bg-gradient-to-r", grad].join(" ")} />
        <motion.div
          className={["absolute -inset-x-10 top-10 h-20 rotate-6 bg-gradient-to-r", grad].join(" ")}
          initial={{ x: -50, opacity: 0.16 }}
          animate={{ x: 60, opacity: 0.28 }}
          transition={{ duration: 3.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        />
      </div>

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-orange-500">称号</div>

          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl">{meta.emoji}</span>
            <div className="min-w-0 text-xl font-black tracking-tight text-slate-900">
              <span className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
                {title}
              </span>
            </div>
          </div>

          {topGenre ? (
            <div className="mt-2 text-[12px] text-slate-600">
              得意ジャンル：<span className="font-semibold text-slate-900">{topGenre.genre}</span>
              {(() => {
                const p = topPercentPretty(topGenre.topPercent);
                // 投稿数が少ない人は topPercent 出さない（プロモーションで促す）
                if (totalsPosts <= 3) return null;
                return p ? <span className="ml-1 text-slate-500">（全ユーザーで上位 {p}%）</span> : null;
              })()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** -------- Donut Pie -------- */
function DonutPie({
  data,
  size = 168,
  thickness = 18,
  onHoverName,
}: {
  data: Array<{ name: string; value: number }>;
  size?: number;
  thickness?: number;
  onHoverName?: (name: string | null) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const [hover, setHover] = useState<{ name: string; value: number } | null>(null);

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let acc = 0;
    return data
      .filter((d) => d.value > 0)
      .map((d, i) => {
        const start = acc / total;
        const frac = d.value / total;
        acc += d.value;
        return { ...d, start, frac, i };
      });
  }, [data, total]);

  const r = (size - thickness) / 2;
  const c = size / 2;

  // “暗いだけ”でも “原色ベタ”でもない、上品寄りパレット（hsl の S/L を控えめに）
  const colorFor = (i: number) => {
    const n = Math.max(1, segments.length);
    const hue = (i * 360) / n;
    return `hsl(${hue}, 55%, 58%)`;
  };

  const arcPath = (start: number, frac: number) => {
    const end = start + frac;
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;
    const x0 = c + r * Math.cos(a0);
    const y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1);
    const y1 = c + r * Math.sin(a1);
    const large = frac > 0.5 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth={thickness} />
        {segments.map((s) => (
          <motion.path
            key={s.name}
            d={arcPath(s.start, s.frac)}
            fill="none"
            stroke={colorFor(s.i)}
            strokeWidth={thickness}
            strokeLinecap="butt"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            onMouseEnter={() => {
              setHover({ name: s.name, value: s.value });
              onHoverName?.(s.name);
            }}
            onMouseLeave={() => {
              setHover(null);
              onHoverName?.(null);
            }}
          />
        ))}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-xs font-semibold text-slate-900">{hover ? hover.name : "ジャンル"}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {hover ? `${hover.value}` : total > 0 ? `${total}` : "データなし"}
        </div>
      </div>
    </div>
  );
}

/** -------- Legend (普通の凡例) -------- */
function GenreLegend({
  data,
  getColor,
  onPick,
  active,
}: {
  data: Array<{ name: string; value: number }>;
  getColor: (i: number) => string;
  onPick: (name: string | null) => void;
  active: string | null;
}) {
  const rows = data
    .slice()
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  if (!rows.length) return null;

  return (
    <div className="mt-4 space-y-1">
      {rows.map((g, idx) => {
        const isActive = active === g.name;
        return (
          <button
            key={g.name}
            type="button"
            onMouseEnter={() => onPick(g.name)}
            onMouseLeave={() => onPick(null)}
            onClick={() => onPick(isActive ? null : g.name)}
            className={[
              "w-full rounded-xl px-2 py-1 text-left text-[11px] transition",
              isActive ? "bg-black/5" : "hover:bg-black/5",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: getColor(idx), boxShadow: "0 0 0 2px rgba(255,255,255,0.9)" }}
                />
                <span className="truncate text-slate-700">{g.name}</span>
              </div>
              <span className="tabular-nums text-slate-500">{g.value}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** -------- Badges row (emoji medals) -------- */
function MedalRow({
  label,
  description,
  progress,
  unitLabel,
}: {
  label: string;
  description: string;
  progress: BadgeProgress;
  unitLabel: string;
}) {
  const cur = tierEmoji(progress.tier);
  const next = tierEmoji(progress.nextTier ?? "none");

  const hint = nextTierHint(progress.nextTier, progress.nextAt, progress.value);

  return (
    <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900">{label}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{description}</div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className={["grid place-items-center rounded-2xl bg-black/5", "h-14 w-14"].join(" ")}>
            <span className="text-3xl">{cur ?? "—"}</span>
          </div>
          {progress.nextTier && hint ? (
            <div className={["grid place-items-center rounded-2xl bg-black/5", "h-12 w-12 opacity-60"].join(" ")}>
              <span className="text-2xl">{next ?? ""}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-black/[.06] bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500">いま</div>
          <div className="mt-1 text-sm font-bold text-slate-900">
            {progress.value}
            <span className="ml-1 text-[11px] font-semibold text-slate-500">{unitLabel}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[.06] bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500">次のメダル</div>

          {!progress.nextTier || !hint ? (
            <div className="mt-1 text-sm font-bold text-slate-900">MAX</div>
          ) : (
            <>
              <div className="mt-1 text-sm font-bold text-slate-900">
                あと {hint.left}
                <span className="ml-1 text-[11px] font-semibold text-slate-500">{unitLabel}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                目標：{hint.targetText}
                {unitLabel}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** =========================
 *  Map (userの投稿一覧)
 *  - scope publicでも表示
 *  - pinはサムネ
 *  - pin/infoから投稿へ遷移
 *  - サムネは render/image で軽量化（可能なら）
 * ========================= */

type PostRow = {
  id: string;
  user_id: string;
  place_id: string | null;
  place_name: string | null;
  place_address: string | null;
  created_at: string | null;
  image_urls?: string[] | null;
};

type PlaceRow = {
  place_id: string;
  lat: number | null;
  lng: number | null;
  name: string | null;
  address: string | null;
  photo_url: string | null;
};

type PlacePin = {
  place_id: string;
  lat: number;
  lng: number;
  place_name: string;
  place_address: string;
  latest_post_id: string;
  latest_image_url: string | null;
};

function toMs(ts: string | null) {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

function ensureGmapsOptionsOnce(opts: Parameters<typeof setOptions>[0]) {
  const g = globalThis as any;
  if (!g.__GMAPS_OPTIONS_SET__) {
    setOptions(opts);
    g.__GMAPS_OPTIONS_SET__ = true;
  }
}

/**
 * Supabase public URL → render/image へ変換して軽量サムネ化（対応してない環境ならそのまま）
 * 例:
 *  /storage/v1/object/public/bucket/path.jpg
 *   → /storage/v1/render/image/public/bucket/path.jpg?width=120&quality=45
 */
function toSupabaseThumbUrl(url: string, width = 120, quality = 45) {
  try {
    const u = new URL(url);
    const p = u.pathname;

    const needle = "/storage/v1/object/public/";
    if (!p.includes(needle)) return url;

    const rest = p.split(needle)[1]; // bucket/path...
    const renderPath = `/storage/v1/render/image/public/${rest}`;
    const out = new URL(u.origin + renderPath);
    out.searchParams.set("width", String(width));
    out.searchParams.set("quality", String(quality));
    // 高さ指定しない（勝手に比率維持）
    return out.toString();
  } catch {
    return url;
  }
}

function makePhotoPinContent(imageUrl: string | null, highlight?: boolean) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "44px";
  wrap.style.height = "44px";
  wrap.style.borderRadius = "9999px";
  wrap.style.overflow = "hidden";
  wrap.style.cursor = "pointer";
  wrap.style.background = "linear-gradient(180deg,#fff,#f3f4f6)";
  wrap.style.border = highlight ? "3px solid rgba(234,88,12,0.95)" : "2px solid rgba(255,255,255,0.95)";
  wrap.style.boxShadow = highlight ? "0 10px 26px rgba(234,88,12,0.30)" : "0 6px 18px rgba(0,0,0,0.20)";
  wrap.style.transform = "translateZ(0)";

  const img = document.createElement("img");
  img.alt = "thumb";
  img.referrerPolicy = "no-referrer";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";
  img.style.filter = "saturate(1.05) contrast(1.02)";
  img.decoding = "async";

  if (imageUrl) {
    // まず軽いサムネURL
    img.src = toSupabaseThumbUrl(imageUrl, 120, 45);
  } else {
    // fallback
    img.src =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="52%" text-anchor="middle" font-size="22" font-weight="800" fill="#111827">📍</text></svg>`
      );
  }

  wrap.appendChild(img);
  return wrap;
}

function ProfilePlacesMap({
  userId,
  scope,
}: {
  userId: string;
  scope: Scope;
}) {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const infoRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const markerByPlaceIdRef = useRef<Map<string, any>>(new Map());

  const gmapsRef = useRef<{ GMap: any; AdvancedMarkerElement: any; InfoWindow: any } | null>(null);

  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "";

  const [gmapsReady, setGmapsReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorText, setErrorText] = useState<string>("");

  const [pins, setPins] = useState<PlacePin[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>("");

  /** load pins: この user の投稿一覧だけ */
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

      // publicでも見せたいので、認証が無くても動く形にする（RLS次第）
      const { data: posts, error: poErr } = await supabase
        .from("posts")
        .select("id, user_id, place_id, place_name, place_address, created_at, image_urls")
        .eq("user_id", userId)
        .not("place_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(800);

      if (poErr) {
        setStatus("error");
        setErrorText(`posts 取得失敗: ${poErr.message}`);
        return;
      }

      const postRows = ((posts as PostRow[] | null) ?? []).filter((p) => !!p.place_id) as PostRow[];
      const placeIds = Array.from(new Set(postRows.map((p) => p.place_id).filter(Boolean) as string[]));

      if (!placeIds.length) {
        setPins([]);
        setStatus("ready");
        return;
      }

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

      // aggregate by place_id（最新投稿を採用）
      const pinByPlace = new Map<string, PlacePin>();

      for (const p of postRows) {
        const pid = p.place_id!;
        const plc = placeById.get(pid);
        if (!plc || plc.lat == null || plc.lng == null) continue;

        const createdMs = toMs(p.created_at);
        const img0 = Array.isArray(p.image_urls) && p.image_urls.length ? (p.image_urls[0] ?? null) : null;

        const existing = pinByPlace.get(pid);
        if (!existing) {
          pinByPlace.set(pid, {
            place_id: pid,
            lat: plc.lat,
            lng: plc.lng,
            place_name: p.place_name || plc.name || "(no name)",
            place_address: p.place_address || plc.address || "",
            latest_post_id: p.id,
            latest_image_url: img0 || plc.photo_url || null,
          });
        } else {
          // より新しい投稿なら更新
          // 既存の createdMs を持ってないので、比較したければ別Mapに置くが簡略化：postsはdescなので初回が最新のはず
          // 念のため createdMs 比較する場合は extra field を入れてください
          // ここでは「desc取得」前提で更新なしでOK
        }
      }

      const pinsSorted = Array.from(pinByPlace.values());

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
  }, [supabase, userId, apiKey, mapId]);

  /** load google maps libs once */
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

  /** init map once */
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

    // DOMで作る（ボタンでrouter.push）
    const wrap = document.createElement("div");
    wrap.style.minWidth = "240px";

    const title = document.createElement("div");
    title.textContent = pin.place_name;
    title.style.fontWeight = "900";
    title.style.fontSize = "14px";
    title.style.marginBottom = "6px";
    wrap.appendChild(title);

    if (pin.place_address) {
      const addr = document.createElement("div");
      addr.textContent = pin.place_address;
      addr.style.color = "#374151";
      addr.style.fontSize = "12px";
      addr.style.marginBottom = "10px";
      wrap.appendChild(addr);
    }

    const btn = document.createElement("button");
    btn.textContent = "投稿を見る";
    btn.style.borderRadius = "12px";
    btn.style.padding = "8px 10px";
    btn.style.fontSize = "12px";
    btn.style.fontWeight = "900";
    btn.style.border = "1px solid rgba(0,0,0,0.10)";
    btn.style.background = "#111827";
    btn.style.color = "white";
    btn.style.cursor = "pointer";
    btn.onclick = () => {
      if (pin.latest_post_id) router.push(`/posts/${pin.latest_post_id}`);
    };
    wrap.appendChild(btn);

    try {
      infoRef.current?.setContent(wrap);
      if (marker) infoRef.current?.open({ map, anchor: marker });
    } catch {}

    map.panTo({ lat: pin.lat, lng: pin.lng });
    map.setZoom(Math.max(14, map.getZoom?.() ?? 14));
  }

  /** render markers whenever pins/selected changes */
  useEffect(() => {
    const map = mapRef.current;
    const libs = gmapsRef.current;
    if (!map || !libs) return;

    // cleanup
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

    if (!pins.length) return;

    const bounds = new google.maps.LatLngBounds();

    for (const pin of pins) {
      const highlight = selectedPlaceId === pin.place_id;
      const content = makePhotoPinContent(pin.latest_image_url, highlight);

      const marker = new libs.AdvancedMarkerElement({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        content,
      });

      content.addEventListener("click", () => {
        setSelectedPlaceId(pin.place_id);
        openInfoForPin(pin);
      });

      // ダブルクリックで即遷移（誤タップ防止）
      content.addEventListener("dblclick", () => {
        if (pin.latest_post_id) router.push(`/posts/${pin.latest_post_id}`);
      });

      markersRef.current.push(marker);
      markerByPlaceIdRef.current.set(pin.place_id, marker);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    }

    map.fitBounds(bounds, 60);
  }, [pins, selectedPlaceId, router]);

  return (
    <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-900">マップ</div>
        <div className="text-[11px] text-slate-500">
          {status === "loading" ? "読み込み中…" : status === "error" ? errorText : `pins: ${pins.length}`}
        </div>
      </div>

      <div
        ref={mapDivRef}
        className="mt-3 w-full overflow-hidden rounded-2xl bg-slate-100"
        style={{ height: "420px" }}
      />
      <div className="mt-2 text-[11px] text-slate-500">
        ピンをタップで詳細、<span className="font-semibold">ダブルタップで投稿へ</span>
      </div>
    </div>
  );
}

/** =========================
 * ProfileYearStats (main)
 * - 年タブ/セレクトは削除（常に "すべて"）
 * - 表示した瞬間も毎回アニメ（mounted key）
 * - publicでも楽しいアニメ
 * ========================= */
export default function ProfileYearStats({
  userId,
  scope,
  className,
}: {
  userId: string;
  scope: Scope;
  className?: string;
}) {
  const year = "all" as const;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const storageKey = scope === "me" ? "gm_hide_year_stats" : null;
  const [hidden, setHidden] = useState<boolean>(() => {
    if (!storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const [mountedKey, setMountedKey] = useState(0); // ★毎回アニメ用
  useEffect(() => {
    setMountedKey((x) => x + 1);
  }, [userId, scope]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, hidden ? "1" : "0");
    } catch {}
  }, [hidden, storageKey]);

  useEffect(() => {
    if (hidden) return;

    let alive = true;
    setLoading(true);

    fetch(`/api/profile/stats/year?user_id=${encodeURIComponent(userId)}&year=all&scope=${scope}`, {
      method: "GET",
      headers: { accept: "application/json" },
    })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setData(j);
      })
      .catch((e) => {
        if (!alive) return;
        setData({ error: e?.message ?? "failed" });
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [userId, scope, hidden]);

  // donut legend palette must match DonutPie’s internal formula for “index”
  const pieForLegend = useMemo(() => {
    const pie = (data && !isErr(data) && (data as any).ok) ? (data as any).pie ?? [] : [];
    const rows = (pie as Array<{ name: string; value: number }>).filter((d) => d.value > 0);
    // same sort as Legend uses (desc)
    return rows.sort((a, b) => b.value - a.value).slice(0, 12);
  }, [data]);

  const [legendActive, setLegendActive] = useState<string | null>(null);
  const legendColor = (idx: number) => {
    const n = Math.max(1, pieForLegend.length);
    const hue = (idx * 360) / n;
    return `hsl(${hue}, 55%, 58%)`;
  };

  return (
    <section
      className={[
        "rounded-3xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 md:text-base">すべて</div>
        </div>

        {scope === "me" ? (
          <button
            type="button"
            onClick={() => setHidden((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-black/[.08] bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-black/5"
          >
            {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {hidden ? "表示" : "隠す"}
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={true} mode="popLayout">
        {hidden ? (
          <motion.div
            key={`hidden-${mountedKey}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 rounded-2xl border border-orange-50 bg-orange-50/60 p-6 text-center text-sm text-slate-700"
          >
            非表示
          </motion.div>
        ) : (
          <motion.div
            key={`content-${mountedKey}-${loading ? "loading" : "ready"}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mt-4"
          >
            {loading ? (
              <div className="rounded-2xl border border-orange-50 bg-orange-50/60 p-8 text-center text-sm text-slate-700">
                計算中…
              </div>
            ) : !data ? null : isErr(data) ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{data.error}</div>
            ) : data.ok && data.scope === "public" ? (
              <div className="space-y-3">
                <TitlePlate
                  title={data.title}
                  meta={data.titleMeta}
                  topGenre={data.topGenre ? { genre: data.topGenre.genre, topPercent: data.topGenre.topPercent } : null}
                  totalsPosts={data.totals.posts}
                />

                <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-900">投稿</div>
                    <div className="text-lg font-bold text-slate-900">{data.totals.posts}</div>
                  </div>
                  {data.totals.posts <= 3 ? (
                    <div className="mt-2 text-[11px] font-semibold text-slate-600">
                      あと <span className="font-black text-slate-900">{Math.max(0, 4 - data.totals.posts)}</span>{" "}
                      投稿でランキングに参加できます
                    </div>
                  ) : null}
                </div>

                {/* publicでもmap表示 */}
                <ProfilePlacesMap userId={userId} scope={scope} />
              </div>
            ) : data.ok && data.scope === "me" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-3">
                  <TitlePlate
                    title={data.title}
                    meta={data.titleMeta}
                    topGenre={data.topGenre ? { genre: data.topGenre.genre, topPercent: data.topGenre.topPercent } : null}
                    totalsPosts={data.totals.posts}
                  />

                  <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                    <div className="text-xs font-semibold text-slate-900">獲得したメダル</div>

                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <MedalRow
                        label="ジャンル"
                        description="いろんなジャンルを記録していくほど、メダルが育ちます。"
                        progress={data.badges.genre}
                        unitLabel="回"
                      />
                      <MedalRow
                        label="投稿"
                        description="投稿が増えるほど、メダルが育ちます。"
                        progress={data.badges.posts}
                        unitLabel="件"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-900">投稿</div>
                      <div className="text-sm font-bold text-slate-900">{data.totals.posts}</div>
                    </div>

                    {data.totals.posts <= 3 ? (
                      <div className="mt-2 text-[11px] font-semibold text-slate-600">
                        あと <span className="font-black text-slate-900">{Math.max(0, 4 - data.totals.posts)}</span>{" "}
                        投稿でランキングに参加できます
                      </div>
                    ) : null}
                  </div>

                  {/* me でも map 表示 */}
                  <ProfilePlacesMap userId={userId} scope={scope} />
                </div>

                <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                  <div className="text-xs font-semibold text-slate-900">ジャンル</div>
                  <div className="mt-3 flex items-center justify-center">
                    <DonutPie
                      data={data.pie}
                      onHoverName={(n) => setLegendActive(n)}
                    />
                  </div>

                  <GenreLegend
                    data={data.pie}
                    getColor={(i) => legendColor(i)}
                    onPick={(name) => setLegendActive(name)}
                    active={legendActive}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-orange-50 bg-orange-50/60 p-6 text-center text-sm text-slate-700">
                データなし
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
