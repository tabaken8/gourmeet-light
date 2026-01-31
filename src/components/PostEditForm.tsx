// src/components/PostEditForm.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, X, Loader2 } from "lucide-react";

export type EditInitialPost = {
  id: string;
  user_id: string;
  created_at: string;
  visited_on: string | null;

  content: string;

  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;

  place_id: string | null;
  place_name: string | null;
  place_address: string | null;

  image_variants: any[] | null;
  image_urls: string[] | null;
};

type PlaceResult = {
  place_id: string;
  name: string;
  formatted_address: string;
};

type PhotoItem = { thumb: string; full: string };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function jstTodayKey() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isPhotoItem(v: unknown): v is PhotoItem {
  if (!v || typeof v !== "object") return false;
  const o = v as any;
  return typeof o.thumb === "string" && typeof o.full === "string";
}

function buildPhotosFromInitial(initial: EditInitialPost): PhotoItem[] {
  // 1) image_variants: [{ thumb, full }] を優先
  const variants: any[] = Array.isArray(initial.image_variants) ? initial.image_variants : [];
  const fromVariants: PhotoItem[] = variants
    .map((v: any) => {
      const thumb = asTrimmedString(v?.thumb);
      const full = asTrimmedString(v?.full);
      if (thumb && full) return { thumb, full };
      if (full && !thumb) return { thumb: full, full };
      if (thumb && !full) return { thumb, full: thumb };
      return null;
    })
    .filter(isPhotoItem);

  if (fromVariants.length > 0) return fromVariants;

  // 2) image_urls: string[] をフォールバック
  const urls: unknown[] = Array.isArray(initial.image_urls) ? initial.image_urls : [];
  return urls
    .filter(isNonEmptyString)
    .map((u: string) => {
      const t = u.trim();
      return { thumb: t, full: t };
    });
}

/**
 * 価格レンジ
 */
const PRICE_RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "~999", label: "〜¥999" },
  { value: "1000-1999", label: "¥1,000〜¥1,999" },
  { value: "2000-2999", label: "¥2,000〜¥2,999" },
  { value: "3000-3999", label: "¥3,000〜¥3,999" },
  { value: "4000-4999", label: "¥4,000〜¥4,999" },
  { value: "5000-6999", label: "¥5,000〜¥6,999" },
  { value: "7000-9999", label: "¥7,000〜¥9,999" },
  { value: "10000-14999", label: "¥10,000〜¥14,999" },
  { value: "15000-19999", label: "¥15,000〜¥19,999" },
  { value: "20000-24999", label: "¥20,000〜¥24,999" },
  { value: "25000-29999", label: "¥25,000〜¥29,999" },
  { value: "30000-49999", label: "¥30,000〜¥49,999" },
  { value: "50000+", label: "¥50,000〜" },
];

function normalizePriceRange(v: string | null | undefined): string {
  if (!v) return "~999";
  if (PRICE_RANGE_OPTIONS.some((o) => o.value === v)) return v;

  if (v === "~9999") return "7000-9999";
  if (v === "10000+") return "10000-14999";
  if (v === "~999") return "~999";

  if (v.includes("-")) {
    const [aRaw, bRaw] = v.split("-");
    const a = Number(String(aRaw).replace(/[^\d]/g, ""));
    const b = Number(String(bRaw).replace(/[^\d]/g, ""));
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= 0) {
      const mid = (a + b) / 2;

      const buckets: Array<{ min: number; max: number; value: string }> = [
        { min: 0, max: 999, value: "~999" },
        { min: 1000, max: 1999, value: "1000-1999" },
        { min: 2000, max: 2999, value: "2000-2999" },
        { min: 3000, max: 3999, value: "3000-3999" },
        { min: 4000, max: 4999, value: "4000-4999" },
        { min: 5000, max: 6999, value: "5000-6999" },
        { min: 7000, max: 9999, value: "7000-9999" },
        { min: 10000, max: 14999, value: "10000-14999" },
        { min: 15000, max: 19999, value: "15000-19999" },
        { min: 20000, max: 24999, value: "20000-24999" },
        { min: 25000, max: 29999, value: "25000-29999" },
        { min: 30000, max: 49999, value: "30000-49999" },
      ];

      const hit = buckets.find((x) => mid >= x.min && mid <= x.max);
      if (hit) return hit.value;

      if (mid >= 50000) return "50000+";
      if (mid < 1000) return "~999";
      if (mid < 10000) return "7000-9999";
      return "10000-14999";
    }
  }

  if (v.endsWith("+")) {
    const a = Number(v.replace(/[^\d]/g, ""));
    if (Number.isFinite(a)) {
      if (a >= 50000) return "50000+";
      if (a >= 30000) return "30000-49999";
      if (a >= 25000) return "25000-29999";
      if (a >= 20000) return "20000-24999";
      if (a >= 15000) return "15000-19999";
      if (a >= 10000) return "10000-14999";
      if (a >= 7000) return "7000-9999";
    }
  }

  return "~999";
}

export default function PostEditForm({ initial }: { initial: EditInitialPost }) {
  const router = useRouter();

  const defaultVisited = initial.visited_on ?? jstTodayKey();

  const [content, setContent] = useState(initial.content ?? "");
  const [visitedOn, setVisitedOn] = useState(defaultVisited);

  const [score, setScore] = useState<number | null>(
    typeof initial.recommend_score === "number" ? initial.recommend_score : null
  );

  const initialMode: "exact" | "range" = useMemo(() => {
    if (typeof initial.price_yen === "number" && initial.price_yen > 0) return "exact";
    if (initial.price_range) return "range";
    return "exact";
  }, [initial.price_yen, initial.price_range]);

  const [priceMode, setPriceMode] = useState<"exact" | "range">(initialMode);
  const [priceYen, setPriceYen] = useState<string>(
    typeof initial.price_yen === "number" && initial.price_yen > 0 ? String(initial.price_yen) : ""
  );
  const [priceRange, setPriceRange] = useState<string>(normalizePriceRange(initial.price_range));

  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 写真（表示）
  const photos = useMemo(() => buildPhotosFromInitial(initial), [initial]);

  // 店（新規投稿と同じ検索UX）
  const initialSelectedPlace: PlaceResult | null = useMemo(() => {
    if (initial.place_id && initial.place_name) {
      return {
        place_id: initial.place_id,
        name: initial.place_name,
        formatted_address: initial.place_address ?? "",
      };
    }
    return null;
  }, [initial.place_id, initial.place_name, initial.place_address]);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(initialSelectedPlace);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);

  useEffect(() => {
    if (placeQuery.trim().length < 2) {
      setPlaceResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setIsSearchingPlace(true);
        const res = await fetch(`/api/places?q=${encodeURIComponent(placeQuery.trim())}`);
        const data = await res.json().catch(() => ({}));
        setPlaceResults((data.results ?? []).slice(0, 6));
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingPlace(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [placeQuery]);

  const scoreText = useMemo(() => {
    if (score === null) return "";
    const v = clamp(score, 0, 10);
    return String(Math.round(v * 10) / 10);
  }, [score]);

  async function onSubmit() {
    setErrMsg(null);
    setSaving(true);
    try {
      let scoreVal: number | null = null;
      if (score !== null && Number.isFinite(score)) scoreVal = clamp(score, 0, 10);

      const visited = visitedOn?.trim() ? visitedOn.trim() : jstTodayKey();

      let price_yen: number | null = null;
      let price_range: string | null = null;

      if (priceMode === "exact") {
        const n = Number(priceYen);
        if (Number.isFinite(n) && n > 0) price_yen = Math.floor(n);
      } else {
        price_range = priceRange || null;
      }

      const payload = {
        content,
        visited_on: visited,
        recommend_score: scoreVal,
        price_yen,
        price_range,
        place_id: selectedPlace?.place_id ?? null,
        place_name: selectedPlace?.name ?? null,
        place_address: selectedPlace?.formatted_address ?? null,
      };

      const res = await fetch(`/posts/${initial.id}/edit/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Update failed (${res.status})`);
      }

      router.push(`/posts/${initial.id}`);
      router.refresh();
    } catch (e: any) {
      setErrMsg(e?.message ?? "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="gm-card overflow-hidden">
      <div className="px-4 py-4 md:px-5 md:py-5">
        {/* 写真 */}
        <div className="mb-4 rounded-2xl border border-black/[.06] bg-white/70 p-3">
          <div className="text-xs font-semibold text-slate-800">写真</div>

          {photos.length > 0 ? (
            <div className="mt-3 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
              {photos.map((p, i) => (
                <a
                  key={`${p.full}-${i}`}
                  href={p.full}
                  target="_blank"
                  rel="noreferrer"
                  className="relative shrink-0"
                  aria-label="open photo"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumb}
                    alt={`photo-${i + 1}`}
                    className="h-24 w-24 rounded-2xl object-cover shadow-sm"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-slate-500">写真なし</div>
          )}
        </div>

        {/* 店 */}
        <div className="mb-4 rounded-2xl border border-black/[.06] bg-white/70 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-800">お店</div>
            {isSearchingPlace ? (
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-orange-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                検索中
              </div>
            ) : null}
          </div>

          {selectedPlace ? (
            <div className="mt-2 flex items-start justify-between gap-3 rounded-2xl border border-orange-100 bg-orange-50/60 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{selectedPlace.name}</div>
                <div className="truncate text-[12px] text-slate-500">{selectedPlace.formatted_address}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPlace(null);
                  setPlaceQuery("");
                  setPlaceResults([]);
                }}
                className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[12px] font-semibold text-slate-600 hover:bg-white"
                aria-label="clear place"
              >
                <span className="inline-flex items-center gap-1">
                  <X className="h-4 w-4" />
                  クリア
                </span>
              </button>
            </div>
          ) : (
            <div className="mt-2 text-sm text-slate-500">未設定</div>
          )}

          <div className="mt-3 relative">
            <div className="flex items-center gap-2 rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2 focus-within:border-orange-300 focus-within:bg-white">
              <MapPin className="h-4 w-4 text-orange-600" />
              <input
                type="text"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="店名やエリアで検索（例: 渋谷 カフェ）"
                className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                aria-label="店舗検索"
              />
            </div>

            {placeQuery.length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2">
                {placeResults.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-lg">
                    <ul className="max-h-64 overflow-y-auto py-1">
                      {placeResults.map((p) => (
                        <li
                          key={p.place_id}
                          className="cursor-pointer px-3 py-2 transition hover:bg-orange-50"
                          onClick={() => {
                            setSelectedPlace(p);
                            setPlaceQuery("");
                            setPlaceResults([]);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-1 h-4 w-4 text-orange-600" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
                              <div className="truncate text-[12px] text-slate-500">{p.formatted_address}</div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  !isSearchingPlace && (
                    <div className="rounded-2xl border border-orange-100 bg-white px-3 py-2 text-[12px] text-slate-500 shadow-sm">
                      候補が見つかりませんでした。
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* 来店日 */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-800">来店日</label>
          <input
            type="date"
            value={visitedOn}
            onChange={(e) => setVisitedOn(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/[.08] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-300/60"
          />
          <div className="mt-1 text-[11px] text-slate-500">未入力なら自動で今日（JST）になります。</div>
        </div>

        {/* おすすめ度 */}
        <div className="mb-4">
          <div className="flex items-end justify-between gap-3">
            <label className="block text-xs font-semibold text-slate-800">おすすめ度</label>
            <input
              inputMode="decimal"
              value={scoreText}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return setScore(null);
                const n = Number(v);
                if (!Number.isFinite(n)) return;
                setScore(clamp(n, 0, 10));
              }}
              className="w-24 rounded-xl border border-black/[.08] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-orange-300/60"
              placeholder="0.0-10.0"
            />
          </div>

          <input
            type="range"
            min={0}
            max={10}
            step={0.1}
            value={score ?? 0}
            onChange={(e) => setScore(Number(e.target.value))}
            className="mt-2 w-full"
          />
          <div className="mt-1 text-[11px] text-slate-500">0.0〜10.0（スライダー or 手入力）</div>
        </div>

        {/* 価格 */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-800">価格</label>

          <div className="mt-2 inline-flex overflow-hidden rounded-2xl border border-black/[.08] bg-white">
            <button
              type="button"
              onClick={() => setPriceMode("exact")}
              className={[
                "px-4 py-2 text-xs font-semibold",
                priceMode === "exact" ? "bg-orange-600 text-white" : "text-slate-700",
              ].join(" ")}
            >
              実額
            </button>
            <button
              type="button"
              onClick={() => setPriceMode("range")}
              className={[
                "px-4 py-2 text-xs font-semibold",
                priceMode === "range" ? "bg-orange-600 text-white" : "text-slate-700",
              ].join(" ")}
            >
              レンジ
            </button>
          </div>

          {priceMode === "exact" ? (
            <div className="mt-2">
              <input
                inputMode="numeric"
                placeholder="例: 3500"
                value={priceYen}
                onChange={(e) => setPriceYen(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full rounded-2xl border border-black/[.08] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-300/60"
              />
              <div className="mt-1 text-[11px] text-slate-500">数字のみ（例: 3500）</div>
            </div>
          ) : (
            <div className="mt-2">
              <select
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
                className="w-full rounded-2xl border border-black/[.08] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-300/60"
              >
                {PRICE_RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                〜¥999 / ¥1,000刻み / ¥10,000以上は大きめ刻み
              </div>
            </div>
          )}
        </div>

        {/* 本文 */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-800">本文</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="いま何食べてる？"
            className="mt-2 w-full rounded-2xl border border-black/[.08] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-300/60"
          />
        </div>

        {errMsg ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errMsg}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className={[
            "gm-press w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm",
            saving ? "bg-slate-300 text-white" : "bg-orange-600 text-white hover:bg-orange-700",
          ].join(" ")}
        >
          {saving ? "保存中..." : "変更を保存"}
        </button>
      </div>
    </section>
  );
}
