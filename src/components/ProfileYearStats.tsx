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
  emoji: string;
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

function accentRing(a: TitleMeta["accent"]) {
  switch (a) {
    case "amber":
      return "from-amber-200/80 via-orange-100/60 to-amber-200/80 ring-amber-200/60";
    case "violet":
      return "from-violet-200/80 via-fuchsia-100/60 to-violet-200/80 ring-violet-200/60";
    case "rose":
      return "from-rose-200/80 via-orange-100/60 to-rose-200/60 ring-rose-200/60";
    case "sky":
    default:
      return "from-sky-200/70 via-white/60 to-sky-200/70 ring-sky-200/60";
  }
}

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
 *  Map pins + InfoWindow
 * ========================= */

type ImageVariant = { thumb?: string | null; full?: string | null; [k: string]: any };
type ImageAsset = { pin?: string | null; square?: string | null; full?: string | null; [k: string]: any };

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type PostRow = {
  id: string;
  user_id: string;
  content: string | null;
  place_id: string | null;
  place_name: string | null;
  place_address: string | null;
  created_at: string | null;

  image_urls?: string[] | null;
  image_variants?: ImageVariant[] | null;
  image_assets?: ImageAsset[] | null;

  cover_pin_url?: string | null;
  cover_square_url?: string | null;
  cover_full_url?: string | null;

  recommend_score?: number | string | null;
  price_yen?: number | string | null;
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

type PlacePin = {
  place_id: string;
  lat: number;
  lng: number;

  place_name: string;
  place_address: string;

  latest_post_id: string;
  latest_image_url: string | null;

  latest_user_id: string;
  latest_display_name: string | null;
  latest_avatar_url: string | null;

  latest_content: string | null;
  latest_recommend_score: number | null;
  latest_price_yen: number | null;
  latest_price_range: string | null;
};

function ensureGmapsOptionsOnce(opts: Parameters<typeof setOptions>[0]) {
  const g = globalThis as any;
  if (!g.__GMAPS_OPTIONS_SET__) {
    setOptions(opts);
    g.__GMAPS_OPTIONS_SET__ = true;
  }
}

function fallbackPinSvgDataUrl() {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset="1" stop-color="#f3f4f6"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" rx="44" ry="44" fill="url(#g)"/>
        <text x="50%" y="54%" text-anchor="middle" font-size="24" font-weight="800" fill="#111827">📍</text>
      </svg>`
    )
  );
}

function normalizeMaybeUrl(url: string) {
  const s = url.trim();
  if (!s) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return s;
}

function toSupabaseThumbUrl(
  url: string,
  width = 120,
  height?: number,
  quality = 55,
  resize: "cover" | "contain" = "cover"
) {
  try {
    const u0 = normalizeMaybeUrl(url);
    const u = new URL(u0);
    const p = u.pathname;

    const needle = "/storage/v1/object/public/";
    if (!p.includes(needle)) return u.toString();

    const rest = p.split(needle)[1];
    const renderPath = `/storage/v1/render/image/public/${rest}`;
    const out = new URL(u.origin + renderPath);

    out.searchParams.set("width", String(width));
    if (height != null) out.searchParams.set("height", String(height));
    out.searchParams.set("resize", resize);
    out.searchParams.set("quality", String(quality));
    return out.toString();
  } catch {
    return url;
  }
}

function pickBestPinUrl(p: PostRow): string | null {
  if (p.cover_pin_url && typeof p.cover_pin_url === "string") return p.cover_pin_url;

  const a0 = Array.isArray(p.image_assets) && p.image_assets.length ? p.image_assets[0] : null;
  if (a0 && typeof a0.pin === "string" && a0.pin) return a0.pin;

  const v0 = Array.isArray(p.image_variants) && p.image_variants.length ? p.image_variants[0] : null;
  if (v0 && typeof v0.thumb === "string" && v0.thumb) return v0.thumb;

  const u0 = Array.isArray(p.image_urls) && p.image_urls.length ? (p.image_urls[0] ?? null) : null;
  if (u0 && typeof u0 === "string") return u0;

  return null;
}

function pickBestSquareUrl(p: PostRow): string | null {
  if (p.cover_square_url) return p.cover_square_url;

  const assets = Array.isArray(p.image_assets) ? p.image_assets : [];
  if (assets[0]?.square) return assets[0].square ?? null;

  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  if (variants[0]?.thumb) return variants[0].thumb ?? null;

  const legacy = Array.isArray(p.image_urls) ? p.image_urls : [];
  return legacy[0] ?? null;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function scoreToLevel(maxScore: number | null) {
  if (maxScore === null || !Number.isFinite(maxScore)) return 0;
  if (maxScore <= 7) return 1;
  const v = clamp(maxScore, 7, 10);
  const step = 0.3;
  const idx = Math.floor((v - 7) / step) + 2;
  return clamp(idx, 2, 11);
}
function levelToRingColor(level: number) {
  if (level === 0) return "#e2e8f0";
  if (level === 1) return "#fef08a";
  const palette = [
    "#fde047",
    "#fcd34d",
    "#fbbf24",
    "#fdba74",
    "#fb923c",
    "#f97316",
    "#f87171",
    "#ef4444",
    "#dc2626",
    "#b91c1c",
  ];
  return palette[clamp(level - 2, 0, palette.length - 1)];
}

function formatYen(n: number) {
  try {
    return new Intl.NumberFormat("ja-JP").format(n);
  } catch {
    return String(n);
  }
}
function formatPriceYenOrRange(price_yen: number | null, price_range: string | null): string | null {
  if (typeof price_yen === "number" && Number.isFinite(price_yen)) {
    return `¥${formatYen(Math.max(0, Math.floor(price_yen)))}`;
  }
  if (price_range) {
    switch (price_range) {
      case "~999":
        return "〜¥999";
      case "1000-1999":
        return "¥1,000〜¥1,999";
      case "2000-2999":
        return "¥2,000〜¥2,999";
      case "3000-3999":
        return "¥3,000〜¥3,999";
      case "4000-4999":
        return "¥4,000〜¥4,999";
      case "5000-6999":
        return "¥5,000〜¥6,999";
      case "7000-9999":
        return "¥7,000〜¥9,999";
      case "10000+":
        return "¥10,000〜";
      default:
        return price_range;
    }
  }
  return null;
}

function GoogleMark({ size = 16 }: { size?: number }) {
  return `
<svg viewBox="0 0 48 48" aria-hidden="true" width="${size}" height="${size}">
  <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.1 3.5l6.8-6.8C35.3 2.7 29.9 0 24 0 14.8 0 6.7 5.1 2.4 12.6l7.9 6.1C12.4 12.1 17.8 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.1 24.5c0-1.6-.2-3.2-.5-4.7H24v9h12.3c-.5 2.7-2.1 5-4.5 6.5v5.4h7.3c4.3-4 6.8-9.9 6.8-16.2z"/>
  <path fill="#FBBC04" d="M10.3 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6v-5.4H2.4c-1.6 3.2-2.4 6.9-2.4 10.9s.9 7.7 2.4 10.9l7.9-6.2z"/>
  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.3-5.4c-2 1.4-4.6 2.3-7.9 2.3-6.2 0-11.6-3.6-14-8.8l-7.9 6.2C6.7 42.9 14.8 48 24 48z"/>
</svg>`.trim();
}

function makeGoogleMapsUrl(placeId: string | null, address: string | null, lat?: number | null, lng?: number | null) {
  if (placeId) return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  if (typeof lat === "number" && typeof lng === "number") return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return null;
}

function makePhotoPinContent(imageUrl: string | null, ringColor: string, selected?: boolean) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "44px";
  wrap.style.height = "44px";
  wrap.style.borderRadius = "9999px";
  wrap.style.overflow = "hidden";
  wrap.style.cursor = "pointer";
  wrap.style.background = "linear-gradient(180deg,#fff,#f3f4f6)";
  wrap.style.border = `3px solid ${ringColor}`;
  wrap.style.boxShadow = "0 6px 18px rgba(0,0,0,0.20)";
  wrap.style.transform = "translateZ(0)";

  wrap.dataset.selected = selected ? "1" : "0";
  wrap.style.outline = selected ? "3px solid rgba(234,88,12,0.95)" : "0px solid transparent";
  wrap.style.outlineOffset = selected ? "2px" : "0px";

  const inner = document.createElement("div");
  inner.style.position = "absolute";
  inner.style.inset = "4px";
  inner.style.borderRadius = "9999px";
  inner.style.overflow = "hidden";
  inner.style.background = "rgba(255,255,255,0.78)";
  inner.style.boxShadow = "inset 0 0 0 1px rgba(0,0,0,0.04)";
  wrap.appendChild(inner);

  const face = document.createElement("div");
  face.style.position = "absolute";
  face.style.inset = "0px";
  face.style.borderRadius = "9999px";
  face.style.backgroundRepeat = "no-repeat";
  face.style.backgroundPosition = "center";
  face.style.backgroundSize = "contain";
  face.style.padding = "2px";
  face.style.boxSizing = "border-box";
  inner.appendChild(face);

  const fallback = fallbackPinSvgDataUrl();
  face.style.backgroundImage = `url("${fallback}")`;

  if (imageUrl) {
    const raw = normalizeMaybeUrl(imageUrl);
    const thumb = toSupabaseThumbUrl(raw, 120, 120, 45, "cover");

    const probe = new Image();
    probe.decoding = "async";
    probe.referrerPolicy = "no-referrer";
    probe.onload = () => {
      face.style.backgroundImage = `url("${thumb}")`;
    };
    probe.onerror = () => {
      face.style.backgroundImage = `url("${fallback}")`;
    };
    probe.src = thumb;
  }

  return wrap;
}

function setSelectedStyle(el: HTMLDivElement, selected: boolean) {
  const cur = el.dataset.selected === "1";
  if (cur === selected) return;
  el.dataset.selected = selected ? "1" : "0";
  el.style.outline = selected ? "3px solid rgba(234,88,12,0.95)" : "0px solid transparent";
  el.style.outlineOffset = selected ? "2px" : "0px";
}

/** ✅ InfoWindow: “スクロールなし”徹底のコンパクト版 */
function makeInfoWindowContent(pin: PlacePin) {
  const wrap = document.createElement("div");

  // ✅ 画面幅追従：横スクロールを潰す
  wrap.style.width = "min(78vw, 248px)";
  wrap.style.maxWidth = "min(78vw, 248px)";
  wrap.style.boxSizing = "border-box";
  wrap.style.overflow = "hidden";
  wrap.style.padding = "0";
  wrap.style.margin = "0";
  wrap.style.fontFamily =
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  wrap.style.wordBreak = "break-word";

  // Title
  const title = document.createElement("div");
  title.textContent = pin.place_name;
  title.style.fontWeight = "900";
  title.style.fontSize = "12px";
  title.style.lineHeight = "1.2";
  title.style.margin = "0 0 2px 0";
  title.style.overflow = "hidden";
  title.style.textOverflow = "ellipsis";
  title.style.whiteSpace = "nowrap";
  wrap.appendChild(title);

  // Address (1 line)
  if (pin.place_address) {
    const addr = document.createElement("div");
    addr.textContent = pin.place_address;
    addr.style.color = "#6b7280";
    addr.style.fontSize = "10px";
    addr.style.lineHeight = "1.2";
    addr.style.marginBottom = "6px";
    addr.style.overflow = "hidden";
    addr.style.textOverflow = "ellipsis";
    addr.style.whiteSpace = "nowrap";
    wrap.appendChild(addr);
  }

  // ✅ Square media but smaller (prevents vertical scroll)
  const media = document.createElement("div");
  media.style.position = "relative";
  media.style.width = "100%";
  media.style.height = "min(46vw, 148px)"; // ★小さくして縦スクロールを潰す
  media.style.borderRadius = "14px";
  media.style.overflow = "hidden";
  media.style.background = "linear-gradient(180deg,#fff,#f3f4f6)";
  media.style.border = "1px solid rgba(0,0,0,0.08)";
  media.style.marginBottom = "6px";

  const imgLayer = document.createElement("div");
  imgLayer.style.position = "absolute";
  imgLayer.style.inset = "0";
  imgLayer.style.backgroundRepeat = "no-repeat";
  imgLayer.style.backgroundPosition = "center";
  imgLayer.style.backgroundSize = "cover";

  const img = pin.latest_image_url
    ? toSupabaseThumbUrl(normalizeMaybeUrl(pin.latest_image_url), 560, 560, 58, "cover")
    : null;
  imgLayer.style.backgroundImage = `url("${img ?? fallbackPinSvgDataUrl()}")`;
  media.appendChild(imgLayer);

  // subtle overlay
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.background = "linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.06) 38%, rgba(0,0,0,0.12))";
  overlay.style.pointerEvents = "none";
  media.appendChild(overlay);

  // Avatar (top-left)
  const avatarWrap = document.createElement("div");
  avatarWrap.style.position = "absolute";
  avatarWrap.style.left = "8px";
  avatarWrap.style.top = "8px";
  avatarWrap.style.width = "28px";
  avatarWrap.style.height = "28px";
  avatarWrap.style.borderRadius = "9999px";
  avatarWrap.style.overflow = "hidden";
  avatarWrap.style.background = "rgba(255,255,255,0.96)";
  avatarWrap.style.border = "1px solid rgba(0,0,0,0.10)";
  avatarWrap.style.boxShadow = "0 5px 14px rgba(0,0,0,0.16)";
  avatarWrap.style.display = "grid";
  avatarWrap.style.placeItems = "center";

  if (pin.latest_avatar_url) {
    const av = document.createElement("img");
    av.src = pin.latest_avatar_url;
    av.alt = "";
    av.decoding = "async";
    av.loading = "lazy";
    av.style.width = "100%";
    av.style.height = "100%";
    av.style.objectFit = "cover";
    avatarWrap.appendChild(av);
  } else {
    const initial = (pin.latest_display_name ?? "U").slice(0, 1).toUpperCase();
    const t = document.createElement("div");
    t.textContent = initial;
    t.style.fontSize = "11px";
    t.style.fontWeight = "900";
    t.style.color = "#9a3412";
    t.style.background = "rgba(255,237,213,0.95)";
    t.style.width = "100%";
    t.style.height = "100%";
    t.style.display = "grid";
    t.style.placeItems = "center";
    avatarWrap.appendChild(t);
  }
  media.appendChild(avatarWrap);

  // Name chip (compact)
  const nameChip = document.createElement("div");
  nameChip.textContent = pin.latest_display_name ?? "ユーザー";
  nameChip.style.position = "absolute";
  nameChip.style.left = "42px";
  nameChip.style.top = "9px";
  nameChip.style.maxWidth = "calc(100% - 50px)";
  nameChip.style.padding = "5px 8px";
  nameChip.style.borderRadius = "9999px";
  nameChip.style.background = "rgba(17,24,39,0.42)";
  nameChip.style.backdropFilter = "blur(8px)";
  nameChip.style.color = "rgba(255,255,255,0.95)";
  nameChip.style.fontSize = "10px";
  nameChip.style.fontWeight = "900";
  nameChip.style.whiteSpace = "nowrap";
  nameChip.style.overflow = "hidden";
  nameChip.style.textOverflow = "ellipsis";
  media.appendChild(nameChip);

  wrap.appendChild(media);

  // Caption (max 2 lines)
  if (pin.latest_content) {
    const cap = document.createElement("div");
    cap.textContent = pin.latest_content;
    cap.style.fontSize = "11px";
    cap.style.color = "#111827";
    cap.style.fontWeight = "700";
    cap.style.lineHeight = "1.25";
    cap.style.marginBottom = "6px";
    // clamp 2 lines
    (cap.style as any).display = "-webkit-box";
    (cap.style as any).WebkitLineClamp = "2";
    (cap.style as any).WebkitBoxOrient = "vertical";
    cap.style.overflow = "hidden";
    wrap.appendChild(cap);
  }

  // ✅ compact meta chips (no big cards)
  const metaRow = document.createElement("div");
  metaRow.style.display = "flex";
  metaRow.style.gap = "6px";
  metaRow.style.marginBottom = "6px";

  const chip = (label: string, value: string) => {
    const c = document.createElement("div");
    c.style.flex = "1";
    c.style.minWidth = "0";
    c.style.borderRadius = "12px";
    c.style.padding = "7px 9px";
    c.style.border = "1px solid rgba(0,0,0,0.08)";
    c.style.background = "rgba(255,255,255,0.82)";
    c.style.boxSizing = "border-box";

    const line = document.createElement("div");
    line.style.display = "flex";
    line.style.alignItems = "baseline";
    line.style.justifyContent = "space-between";
    line.style.gap = "8px";

    const l = document.createElement("div");
    l.textContent = label;
    l.style.fontSize = "9px";
    l.style.fontWeight = "900";
    l.style.color = "#6b7280";
    l.style.whiteSpace = "nowrap";

    const v = document.createElement("div");
    v.textContent = value;
    v.style.fontSize = "10px";
    v.style.fontWeight = "900";
    v.style.color = "#111827";
    v.style.whiteSpace = "nowrap";
    v.style.overflow = "hidden";
    v.style.textOverflow = "ellipsis";

    line.appendChild(l);
    line.appendChild(v);
    c.appendChild(line);
    return c;
  };

  const priceText = formatPriceYenOrRange(pin.latest_price_yen, pin.latest_price_range) ?? "—";
  const recText =
    pin.latest_recommend_score != null && Number.isFinite(pin.latest_recommend_score)
      ? `${Number(pin.latest_recommend_score).toFixed(1)}/10`
      : "—";

  metaRow.appendChild(chip("価格", priceText));
  metaRow.appendChild(chip("おすすめ", recText));
  wrap.appendChild(metaRow);

  // Buttons row (compact height)
  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "6px";

  const btnPost = document.createElement("button");
  btnPost.textContent = "投稿";
  btnPost.type = "button";
  btnPost.style.flex = "1";
  btnPost.style.borderRadius = "12px";
  btnPost.style.padding = "9px 10px";
  btnPost.style.fontSize = "11px";
  btnPost.style.fontWeight = "900";
  btnPost.style.border = "1px solid rgba(0,0,0,0.10)";
  btnPost.style.background = "#111827";
  btnPost.style.color = "white";
  btnPost.style.cursor = "pointer";

  const mapsUrl = makeGoogleMapsUrl(pin.place_id, pin.place_address, pin.lat, pin.lng);
  const btnG = document.createElement("a");
  btnG.href = mapsUrl ?? "#";
  btnG.target = "_blank";
  btnG.rel = "noopener noreferrer";
  btnG.style.flex = "1";
  btnG.style.borderRadius = "12px";
  btnG.style.padding = "9px 10px";
  btnG.style.fontSize = "11px";
  btnG.style.fontWeight = "900";
  btnG.style.border = "1px solid rgba(0,0,0,0.10)";
  btnG.style.background = "rgba(255,255,255,0.88)";
  btnG.style.color = "#111827";
  btnG.style.cursor = "pointer";
  btnG.style.textDecoration = "none";
  btnG.style.display = "inline-flex";
  btnG.style.alignItems = "center";
  btnG.style.justifyContent = "center";
  btnG.style.gap = "6px";
  btnG.innerHTML = `${GoogleMark({ size: 14 })}<span>Maps</span>`;

  if (!mapsUrl) {
    btnG.style.opacity = "0.5";
    btnG.style.pointerEvents = "none";
  }

  btnRow.appendChild(btnPost);
  btnRow.appendChild(btnG);
  wrap.appendChild(btnRow);

  return { wrap, btnPost };
}

function ProfilePlacesMap({ userId }: { userId: string; scope: Scope }) {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const infoRef = useRef<any>(null);

  const markersRef = useRef<any[]>([]);
  const markerByPlaceIdRef = useRef<Map<string, any>>(new Map());
  const contentByPlaceIdRef = useRef<Map<string, HTMLDivElement>>(new Map());

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

      const { data: posts, error: poErr } = await supabase
        .from("posts")
        .select(
          "id, user_id, content, place_id, place_name, place_address, created_at, image_urls, image_variants, image_assets, cover_pin_url, cover_square_url, cover_full_url, recommend_score, price_yen, price_range"
        )
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

      // profiles: id = posts.user_id
      const userIds = Array.from(new Set(postRows.map((p) => p.user_id).filter(Boolean)));
      const profileById = new Map<string, ProfileLite>();

      if (userIds.length) {
        const { data: profs, error: prErr } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds)
          .limit(1000);

        if (!prErr) {
          ((profs as ProfileLite[] | null) ?? []).forEach((x) => profileById.set(x.id, x));
        }
      }

      const pinByPlace = new Map<string, PlacePin>();

      for (const p of postRows) {
        const pid = p.place_id!;
        const plc = placeById.get(pid);
        if (!plc || plc.lat == null || plc.lng == null) continue;
        if (pinByPlace.has(pid)) continue;

        const pinImg = pickBestPinUrl(p);
        const squareImg = pickBestSquareUrl(p);

        const recNum = p.recommend_score == null ? null : Number(p.recommend_score);
        const latestRecommendScore = Number.isFinite(recNum as number) ? (recNum as number) : null;

        const priceNum = p.price_yen == null ? null : Number(p.price_yen);
        const latestPriceYen = Number.isFinite(priceNum as number) ? (priceNum as number) : null;

        const latestPriceRange = p.price_range ?? null;

        const prof = profileById.get(p.user_id) ?? null;

        pinByPlace.set(pid, {
          place_id: pid,
          lat: plc.lat,
          lng: plc.lng,
          place_name: p.place_name || plc.name || "(no name)",
          place_address: p.place_address || plc.address || "",

          latest_post_id: p.id,
          latest_image_url: squareImg || pinImg || plc.photo_url || null,

          latest_user_id: p.user_id,
          latest_display_name: prof?.display_name ?? null,
          latest_avatar_url: prof?.avatar_url ?? null,

          latest_content: p.content ?? null,
          latest_recommend_score: latestRecommendScore,
          latest_price_yen: latestPriceYen,
          latest_price_range: latestPriceRange,
        });
      }

      if (cancelled) return;
      setPins(Array.from(pinByPlace.values()));
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

    // ✅ ここはそのまま（中身を小さくしたのでスクロールが出ない）
    infoRef.current = new InfoWindow();
  }, [gmapsReady, mapId]);

  const openInfoForPin = (pin: PlacePin) => {
    const map = mapRef.current;
    if (!map) return;

    const marker = markerByPlaceIdRef.current.get(pin.place_id);

    const { wrap, btnPost } = makeInfoWindowContent(pin);
    btnPost.onclick = () => {
      if (pin.latest_post_id) router.push(`/posts/${pin.latest_post_id}`);
    };

    try {
      infoRef.current?.setContent(wrap);
      if (marker) infoRef.current?.open({ map, anchor: marker });
    } catch {}

    map.panTo({ lat: pin.lat, lng: pin.lng });
    map.setZoom(Math.max(14, map.getZoom?.() ?? 14));
  };

  useEffect(() => {
    const map = mapRef.current;
    const libs = gmapsRef.current;
    if (!map || !libs) return;

    for (const m of markersRef.current) {
      try {
        m.map = null;
      } catch {}
    }
    markersRef.current = [];
    markerByPlaceIdRef.current = new Map();
    contentByPlaceIdRef.current = new Map();
    try {
      infoRef.current?.close();
    } catch {}

    if (!pins.length) return;

    const bounds = new google.maps.LatLngBounds();

    for (const pin of pins) {
      const level = scoreToLevel(pin.latest_recommend_score);
      const ringColor = levelToRingColor(level);

      const content = makePhotoPinContent(pin.latest_image_url, ringColor, false) as HTMLDivElement;

      const marker = new libs.AdvancedMarkerElement({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        content,
      });

      contentByPlaceIdRef.current.set(pin.place_id, content);

      // ✅ 1回タップで即：選択＋吹き出し
      content.addEventListener("click", () => {
        setSelectedPlaceId(pin.place_id);
        openInfoForPin(pin);
      });

      content.addEventListener("dblclick", () => {
        if (pin.latest_post_id) router.push(`/posts/${pin.latest_post_id}`);
      });

      markersRef.current.push(marker);
      markerByPlaceIdRef.current.set(pin.place_id, marker);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    }

    map.fitBounds(bounds, 60);
  }, [pins, router]);

  useEffect(() => {
    const m = contentByPlaceIdRef.current;
    if (!m.size) return;
    for (const [pid, el] of m.entries()) {
      setSelectedStyle(el, pid === selectedPlaceId);
    }
  }, [selectedPlaceId]);

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

  const [mountedKey, setMountedKey] = useState(0);
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

  const pieForLegend = useMemo(() => {
    const pie = data && !isErr(data) && (data as any).ok ? (data as any).pie ?? [] : [];
    const rows = (pie as Array<{ name: string; value: number }>).filter((d) => d.value > 0);
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

                    <ProfilePlacesMap userId={userId} scope={scope} />
                  </div>
                </div>

                <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                  <div className="text-xs font-semibold text-slate-900">ジャンル</div>
                  <div className="mt-3 flex items-center justify-center">
                    <DonutPie data={data.pie} onHoverName={(n) => setLegendActive(n)} />
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
