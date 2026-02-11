// src/components/VisitHeatmap.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { X, MapPin } from "lucide-react";
import { createPortal } from "react-dom";

export type HeatmapDay = {
  date: string; // "YYYY-MM-DD" (JST基準の代表日付)
  count: number;
  maxScore: number | null;
  posts: Array<{ id: string; thumbUrl: string | null }>;
};

type DetailPost = {
  id: string;
  thumbUrl: string | null;
  place_id: string | null;
  place_name: string | null;
  place_address: string | null;
  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;
  created_at: string;
  visited_on: string | null;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatYen(n: number) {
  try {
    return new Intl.NumberFormat("ja-JP").format(n);
  } catch {
    return String(n);
  }
}

function formatPrice(p: { price_yen: number | null; price_range: string | null }) {
  if (typeof p.price_yen === "number" && Number.isFinite(p.price_yen) && p.price_yen > 0) {
    return `¥${formatYen(Math.floor(p.price_yen))}`;
  }
  const r = p.price_range;
  if (!r) return "";

  if (r.startsWith("~")) {
    const max = r.replace(/[^\d]/g, "");
    return max ? `〜¥${formatYen(Number(max))}` : r;
  }
  if (r.includes("-")) {
    const [a, b] = r.split("-");
    const aa = a?.replace(/[^\d]/g, "");
    const bb = b?.replace(/[^\d]/g, "");
    if (aa && bb) return `¥${formatYen(Number(aa))}〜¥${formatYen(Number(bb))}`;
    return r;
  }
  if (r.endsWith("+")) {
    const base = r.replace(/[^\d]/g, "");
    return base ? `¥${formatYen(Number(base))}〜` : r;
  }
  const digits = r.replace(/[^\d]/g, "");
  if (digits) return `¥${formatYen(Number(digits))}〜`;
  return r;
}

/** thumb優先 */
function getThumbUrlFromRow(r: any): string | null {
  const v = r?.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;

  const urls = r?.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];

  return null;
}

/** JST日付 "YYYY-MM-DD" を UTC ISO の [start, end) に変換（JST=UTC+9） */
function jstDayToUtcRange(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map((x) => Number(x));
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString() };
}

/** JST key を日単位で加減算 */
function addDaysJstKey(key: string, deltaDays: number) {
  const [y, m, d] = key.split("-").map(Number);
  // JSTの正午をUTCで保持（DST無いが念のため）
  const jstNoonUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 9 * 60 * 60 * 1000;
  const t = new Date(jstNoonUtcMs + deltaDays * 24 * 60 * 60 * 1000);
  // JSTへ戻して "en-CA"
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  return dtf.format(new Date(t.getTime() + 9 * 60 * 60 * 1000));
}

/** pointerがfineならPC扱い（hover想定） */
function isPointerFine() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: fine)")?.matches ?? false;
}

/**
 * スコア→色段階（要望：7以下は全部黄色、7〜10を10分割）
 * 7〜10を10分割＝幅0.3
 */
function scoreToLevel(maxScore: number | null) {
  if (maxScore === null || !Number.isFinite(maxScore)) return 0;
  if (maxScore <= 7) return 1;
  const v = clamp(maxScore, 7, 10);
  const step = 0.3;
  const idx = Math.floor((v - 7) / step) + 2; // 2..11
  return clamp(idx, 2, 11);
}

function levelClass(level: number) {
  if (level === 0) return "bg-slate-200/70";
  if (level === 1) return "bg-yellow-200";
  const palette = [
    "bg-yellow-300",
    "bg-amber-300",
    "bg-amber-400",
    "bg-orange-300",
    "bg-orange-400",
    "bg-orange-500",
    "bg-red-400",
    "bg-red-500",
    "bg-red-600",
    "bg-red-700",
  ];
  return palette[clamp(level - 2, 0, palette.length - 1)];
}

function monthLabel(m: number) {
  return `${m}月`;
}

/** “全て” の下限 */
const ABS_MIN_START = "2020-01-01";

/** props:
 * - days: 初期(直近1年)の集計をサーバーから渡す
 * - earliestKey: ユーザーの最古（visited_on / created_atをJST日付に正規化したもの）
 */
export default function VisitHeatmap({
  userId,
  days,
  earliestKey,
}: {
  userId: string;
  days: HeatmapDay[];
  earliestKey?: string | null;
}) {
  const supabase = createClientComponentClient();

  const dtf = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    []
  );

  // 今日はJSTのYYYY-MM-DD
  const todayKey = useMemo(() => dtf.format(new Date()), [dtf]);

  // 直近1年の開始（365日）
  const yearStartKey = useMemo(() => addDaysJstKey(todayKey, -364), [todayKey]);

  // allの開始： max(2020-01-01, 最古-30日) ただし最低でも1年表示は守る（トグル出す/出さないで吸収）
  const allStartKey = useMemo(() => {
    if (!earliestKey || earliestKey.length !== 10) return ABS_MIN_START;
    const shifted = addDaysJstKey(earliestKey, -30);
    return shifted < ABS_MIN_START ? ABS_MIN_START : shifted;
  }, [earliestKey]);

  // Allが意味を持つか（最古が1年範囲より古いか）
  const canShowAllToggle = useMemo(() => {
    if (!earliestKey || earliestKey.length !== 10) return false;
    // 1年範囲より古いデータがある
    return earliestKey < yearStartKey;
  }, [earliestKey, yearStartKey]);

  type RangeMode = "year" | "all";
  const [mode, setMode] = useState<RangeMode>("year");

  // “全て”用データ（必要になった時だけ作る）
  const [allDays, setAllDays] = useState<HeatmapDay[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);

  // 横スクロール右寄せ（最新が右）
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }, [mode, allDays]);

  // 現在使う days
  const activeDays = useMemo(() => {
    if (mode === "all" && allDays) return allDays;
    return days;
  }, [mode, allDays, days]);

  // 日付→集計データ
  const dayMap = useMemo(() => {
    const m = new Map<string, HeatmapDay>();
    for (const d of activeDays) m.set(d.date, d);
    return m;
  }, [activeDays]);

  // 現在モードのカレンダー範囲
  const calendar = useMemo(() => {
    const endKey = todayKey;

    // year: 常に365日
    if (mode === "year") {
      const res: string[] = [];
      for (let i = 364; i >= 0; i--) res.push(addDaysJstKey(endKey, -i));
      return { startKey: res[0] ?? yearStartKey, endKey, dates: res };
    }

    // all: allStartKey..todayKey（ただし短すぎるなら結局1年相当に丸めてもOK）
    const startKey = allStartKey;

    // start->end の日数を概算（最大でも数千日程度のはず）
    // 安全のため、もし start が today より後なら年に戻す
    if (startKey > endKey) {
      const res: string[] = [];
      for (let i = 364; i >= 0; i--) res.push(addDaysJstKey(endKey, -i));
      return { startKey: res[0] ?? yearStartKey, endKey, dates: res };
    }

    const dates: string[] = [];
    // ループが長くなりすぎるのを防ぐ（2020-01-01〜でも約2200日程度）
    for (let k = startKey; k <= endKey; k = addDaysJstKey(k, 1)) {
      dates.push(k);
      if (dates.length > 4000) break;
    }

    // 最低1年は維持（※UI上、allにしても短いならyearと同じ見え方になる）
    if (dates.length < 365) {
      const res: string[] = [];
      for (let i = 364; i >= 0; i--) res.push(addDaysJstKey(endKey, -i));
      return { startKey: res[0] ?? yearStartKey, endKey, dates: res };
    }

    return { startKey, endKey, dates };
  }, [mode, todayKey, yearStartKey, allStartKey]);

  // 週の開始：月曜
  function weekdayMon0(dateKey: string) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const jstNoonUtc = Date.UTC(y, m - 1, d, 12, 0, 0) - 9 * 60 * 60 * 1000;
    const day = new Date(jstNoonUtc).getUTCDay(); // 0=Sun
    return (day + 6) % 7; // Mon=0..Sun=6
  }

  const grid = useMemo(() => {
    const dates = calendar.dates;
    if (dates.length === 0) return { weeks: [] as string[][], breakBefore: [] as boolean[] };

    const first = dates[0];
    const pad = weekdayMon0(first);
    const padded: (string | null)[] = Array(pad).fill(null).concat(dates);

    const weeksRaw: string[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      const col = padded.slice(i, i + 7).map((x) => (x ?? "")) as string[];
      weeksRaw.push(col);
    }

    const breakBefore: boolean[] = [];
    let prevYM: string | null = null;
    for (const col of weeksRaw) {
      const firstKey = col.find((x) => x && x.length === 10) ?? "";
      if (!firstKey) {
        breakBefore.push(false);
        continue;
      }
      const ym = firstKey.slice(0, 7);
      if (prevYM === null) {
        breakBefore.push(false);
        prevYM = ym;
      } else if (ym !== prevYM) {
        breakBefore.push(true);
        prevYM = ym;
      } else {
        breakBefore.push(false);
      }
    }

    return { weeks: weeksRaw, breakBefore };
  }, [calendar]);

const monthMeta = useMemo(() => {
  const meta: Array<{ show: boolean; text: string; yearText?: string; breakBefore: boolean }> = [];
  let prevYM: string | null = null;

  for (let i = 0; i < grid.weeks.length; i++) {
    const col = grid.weeks[i];
    const firstKey = col.find((x) => x && x.length === 10) ?? "";
    const bb = grid.breakBefore[i] ?? false;

    if (!firstKey) {
      meta.push({ show: false, text: "", breakBefore: bb });
      continue;
    }

    const ym = firstKey.slice(0, 7);
    const y = firstKey.slice(0, 4);
    const m = Number(firstKey.slice(5, 7));

    if (ym !== prevYM) {
      meta.push({
        show: true,
        text: monthLabel(m),            // "1月" など
        yearText: m === 1 ? y : undefined, // ✅ 1月だけ年を表示
        breakBefore: bb,
      });
      prevYM = ym;
    } else {
      meta.push({ show: false, text: "", breakBefore: bb });
    }
  }

  return meta;
}, [grid.weeks, grid.breakBefore]);


  const yearRangeText = useMemo(() => {
    const sy = Number(calendar.startKey.slice(0, 4));
    const ey = Number(calendar.endKey.slice(0, 4));
    if (sy === ey) return `${sy}`;
    return `${sy}–${ey}`;
  }, [calendar.startKey, calendar.endKey]);

  // hover popover（PC向け）
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // modal（クリック/タップで開く）
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailPosts, setDetailPosts] = useState<DetailPost[]>([]);

  async function loadDetails(dateKey: string) {
    setLoadingDetail(true);
    setDetailPosts([]);

    try {
      const { startIso, endIso } = jstDayToUtcRange(dateKey);

      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, created_at, visited_on, recommend_score, price_yen, price_range, place_id, place_name, place_address, image_variants, image_urls"
        )
        .eq("user_id", userId)
        .or(`visited_on.eq.${dateKey},and(visited_on.is.null,created_at.gte.${startIso},created_at.lt.${endIso})`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = (data ?? []).map((r: any) => ({
        id: String(r.id),
        thumbUrl: getThumbUrlFromRow(r),
        place_id: r.place_id ?? null,
        place_name: r.place_name ?? null,
        place_address: r.place_address ?? null,
        recommend_score:
          typeof r.recommend_score === "number" && Number.isFinite(r.recommend_score)
            ? r.recommend_score
            : typeof r.recommend_score === "string" && Number.isFinite(Number(r.recommend_score))
              ? Number(r.recommend_score)
              : null,
        price_yen:
          typeof r.price_yen === "number" && Number.isFinite(r.price_yen)
            ? r.price_yen
            : typeof r.price_yen === "string" && Number.isFinite(Number(r.price_yen))
              ? Number(r.price_yen)
              : null,
        price_range: r.price_range ?? null,
        created_at: String(r.created_at),
        visited_on: r.visited_on ?? null,
      })) as DetailPost[];

      rows.sort((a, b) => {
        const av = a.visited_on ? 1 : 0;
        const bv = b.visited_on ? 1 : 0;
        if (av !== bv) return bv - av;
        return a.created_at < b.created_at ? 1 : -1;
      });

      setDetailPosts(rows);
    } catch (e) {
      console.warn("loadDetails failed:", e);
      setDetailPosts([]);
    } finally {
      setLoadingDetail(false);
    }
  }

  function onEnterCell(dateKey: string, rect: DOMRect) {
    if (!isPointerFine()) return;
    setHoverKey(dateKey);
    setHoverPos({ x: rect.left + rect.width / 2, y: rect.top });
  }

  function closeHover() {
    setHoverKey(null);
    setHoverPos(null);
  }

  async function openModal(dateKey: string) {
    setOpenKey(dateKey);
    await loadDetails(dateKey);
  }

  function closeModal() {
    setOpenKey(null);
    setDetailPosts([]);
  }

  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  const hoverDay = hoverKey ? dayMap.get(hoverKey) ?? null : null;
  const legendLevels = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);

  // -----------------------------
  // “全て” 用データを client で集計
  // -----------------------------
  async function ensureAllLoaded() {
    if (allDays) return;
    if (loadingAll) return;

    setLoadingAll(true);
    try {
      const startKey = allStartKey;
      const endKey = todayKey;

      // visited_on がある投稿（date型なので文字列比較OK）
      const { data: withVisited, error: err1 } = await supabase
        .from("posts")
        .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
        .eq("user_id", userId)
        .not("visited_on", "is", null)
        .gte("visited_on", startKey)
        .lte("visited_on", endKey)
        .limit(20000);

      if (err1) throw err1;

      // visited_onが無い投稿は created_at をJSTレンジに合わせて拾う
      const startIso = jstDayToUtcRange(startKey).startIso;
      // endは “翌日0時(JST)” まで含めたいので endKeyの翌日startをendIsoとして使う
      const endPlus1 = addDaysJstKey(endKey, 1);
      const endIso = jstDayToUtcRange(endPlus1).startIso;

      const { data: noVisited, error: err2 } = await supabase
        .from("posts")
        .select("id, visited_on, created_at, recommend_score, image_variants, image_urls")
        .eq("user_id", userId)
        .is("visited_on", null)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .limit(20000);

      if (err2) throw err2;

      const rows = new Map<string, any>();
      for (const r of withVisited ?? []) rows.set(String(r.id), r);
      for (const r of noVisited ?? []) rows.set(String(r.id), r);

      type DayPost = { id: string; thumbUrl: string | null; score: number | null };
      type DayAcc = { date: string; count: number; maxScore: number | null; posts: DayPost[] };
      const acc = new Map<string, DayAcc>();

      for (const r of rows.values()) {
        const dateKey =
          r?.visited_on && String(r.visited_on).length === 10 ? String(r.visited_on) : dtf.format(new Date(String(r.created_at)));
        if (dateKey < startKey || dateKey > endKey) continue;

        const sRaw = (r as any)?.recommend_score;
        const score =
          typeof sRaw === "number"
            ? Number.isFinite(sRaw)
              ? sRaw
              : null
            : typeof sRaw === "string"
              ? Number.isFinite(Number(sRaw))
                ? Number(sRaw)
                : null
              : null;

        const cur: DayAcc = acc.get(dateKey) ?? { date: dateKey, count: 0, maxScore: null, posts: [] };
        cur.count += 1;
        if (score !== null) cur.maxScore = cur.maxScore === null ? score : Math.max(cur.maxScore, score);
        cur.posts.push({ id: String(r.id), thumbUrl: getThumbUrlFromRow(r), score });
        acc.set(dateKey, cur);
      }

      const packed: HeatmapDay[] = Array.from(acc.values())
        .map((d) => {
          const sorted = d.posts.slice().sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
          const top3 = sorted.slice(0, 3).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl }));
          return { date: d.date, count: d.count, maxScore: d.maxScore, posts: top3 };
        })
        // 新しい順に並べてもdayMapは問題ないが、見た目の意味では使わない
        .sort((a, b) => (a.date < b.date ? 1 : -1));

      setAllDays(packed);
    } catch (e) {
      console.warn("ensureAllLoaded failed:", e);
      setAllDays([]);
    } finally {
      setLoadingAll(false);
    }
  }

  async function onSelectMode(next: RangeMode) {
    setMode(next);
    if (next === "all") await ensureAllLoaded();
  }

  // Segmented control（トグル）
  const Segmented = useMemo(() => {
    if (!canShowAllToggle) return null;

    const base =
      "inline-flex items-center rounded-full border border-black/[.08] bg-white p-1 text-[11px] md:text-xs";
    const btn =
      "px-3 py-1.5 rounded-full transition outline-none focus:ring-2 focus:ring-orange-300/60 focus:ring-offset-2 focus:ring-offset-white";
    const active = "bg-slate-900 text-white";
    const idle = "text-slate-700 hover:bg-slate-50";

    return (
      <div className={base}>
        <button
          type="button"
          className={`${btn} ${mode === "year" ? active : idle}`}
          onClick={() => onSelectMode("year")}
        >
          1年
        </button>
        <button
          type="button"
          className={`${btn} ${mode === "all" ? active : idle}`}
          onClick={() => onSelectMode("all")}
        >
          全て
        </button>
      </div>
    );
  }, [canShowAllToggle, mode, onSelectMode]);

  return (
    <section className="w-full max-w-full overflow-hidden bg-white rounded-none border border-black/[.06] shadow-none">
      {/* Header */}
      <div className="flex flex-col gap-2 px-3 pt-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 md:text-base">来店ログ</h2>
            {Segmented}
            {mode === "all" && loadingAll ? (
              <span className="text-[11px] text-slate-500">読み込み中...</span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">ブロックを押すと投稿を見ることができます。</p>
        </div>

        <div className="min-w-0 text-[11px] text-slate-500 sm:text-right">
          <div className="font-medium text-slate-700">{yearRangeText}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="flex items-center gap-0.5">
              {legendLevels.map((lv) => (
                <span key={lv} className={`h-2.5 w-2.5 rounded-none ${levelClass(lv)}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll area: “余白ダサい”対策で、内側は w-max で実幅に合わせる */}
      <div ref={scrollRef} className="mt-3 overflow-x-auto overscroll-x-contain">
        <div className="inline-block w-max pb-3">
  {/* Month labels */}
<div className="mb-2 flex gap-1 h-6 items-end px-3">
  {monthMeta.map((m, i) => (
    <div key={i} className={["relative flex-none w-3.5 h-6", m.breakBefore ? "ml-2" : ""].join(" ")}>
      {m.show ? (
        <>
          {/* ✅ 年（1月だけ） */}
          {m.yearText ? (
            <span className="absolute left-0 top-0 text-[10px] font-semibold text-slate-500 whitespace-nowrap leading-none">
              {m.yearText}
            </span>
          ) : null}

          {/* 月 */}
          <span className="absolute left-0 bottom-0 text-[10px] font-medium text-slate-500 whitespace-nowrap leading-none">
            {m.text}
          </span>
        </>
      ) : null}
    </div>
  ))}
</div>


          {/* Grid */}
          <div className="flex gap-1 px-3">
            {grid.weeks.map((col, wi) => (
              <div key={wi} className={["flex flex-col gap-1", grid.breakBefore[wi] ? "ml-2" : ""].join(" ")}>
                {col.map((dateKey, di) => {
                  if (!dateKey) {
                    return <div key={`${wi}-${di}`} className="h-3.5 w-3.5 rounded-none bg-transparent" />;
                  }
                  const d = dayMap.get(dateKey) ?? null;
                  const level = scoreToLevel(d?.maxScore ?? null);

                  return (
                    <button
                      key={`${dateKey}-${wi}-${di}`}
                      type="button"
                      className={[
                        "h-3.5 w-3.5 flex-none rounded-none transition",
                        "outline-none focus:ring-2 focus:ring-orange-300/60 focus:ring-offset-2 focus:ring-offset-white",
                        levelClass(level),
                        "hover:brightness-95",
                      ].join(" ")}
                      aria-label={`${dateKey} ${d?.count ?? 0} posts`}
                      onMouseEnter={(e) => onEnterCell(dateKey, e.currentTarget.getBoundingClientRect())}
                      onMouseLeave={closeHover}
                      onFocus={(e) => onEnterCell(dateKey, e.currentTarget.getBoundingClientRect())}
                      onBlur={closeHover}
                      onClick={() => openModal(dateKey)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PC hover popover */}
      {hoverKey && hoverPos && hoverDay && isPointerFine() && (
        <div
          className="fixed z-[9998] -translate-x-1/2 rounded-none border border-black/[.08] bg-white p-3 shadow-xl"
          style={{ left: hoverPos.x, top: hoverPos.y - 12 }}
          onMouseLeave={closeHover}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-slate-900">{hoverKey}</div>
            <div className="text-[11px] text-slate-500">{hoverDay.count}件</div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            {hoverDay.posts?.length ? (
              hoverDay.posts.slice(0, 3).map((p) => (
                <div key={p.id} className="h-12 w-12 overflow-hidden rounded-none bg-slate-100">
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-[11px] text-slate-500">投稿なし</div>
            )}
            <span className="flex-1" />
            <div className="text-[11px] text-orange-700">クリックで詳細</div>
          </div>
        </div>
      )}

      {/* Modal */}
      {openKey &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-black/35" onClick={closeModal} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center p-3 md:p-6">
              <div className="w-full max-w-5xl overflow-hidden rounded-none border border-black/[.08] bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-black/[.06] p-4 md:p-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Visits</div>
                    <div className="mt-1 text-base font-bold text-slate-900 md:text-lg">{openKey}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {loadingDetail ? "読み込み中..." : `${detailPosts.length}件`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-none border border-black/[.08] bg-white text-slate-700 hover:bg-slate-50"
                    aria-label="閉じる"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="max-h-[78vh] overflow-y-auto p-4 md:p-5">
                  {loadingDetail ? (
                    <div className="border border-black/[.06] bg-white p-8 text-center text-sm text-slate-700">
                      読み込み中…
                    </div>
                  ) : detailPosts.length ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {detailPosts.map((p) => {
                        const score =
                          typeof p.recommend_score === "number" && p.recommend_score >= 0 && p.recommend_score <= 10
                            ? p.recommend_score
                            : null;

                        const priceLabel = formatPrice(p);

                        const mapUrl = p.place_id
                          ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
                          : p.place_address
                            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_address)}`
                            : null;

                        return (
                          <a
                            key={p.id}
                            href={`/posts/${p.id}`}
                            className="group flex gap-3 border border-black/[.06] bg-white p-3 shadow-sm transition hover:shadow-md"
                          >
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-none bg-slate-100 md:h-24 md:w-24">
                              {p.thumbUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.thumbUrl}
                                  alt=""
                                  className="h-full w-full object-cover transition group-hover:opacity-95"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : null}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {p.place_name ? (
                                  <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 text-[11px] text-slate-800">
                                    <MapPin size={13} className="opacity-70" />
                                    {mapUrl ? (
                                      <span className="max-w-[260px] truncate underline decoration-orange-200 underline-offset-2">
                                        {p.place_name}
                                      </span>
                                    ) : (
                                      <span className="max-w-[260px] truncate">{p.place_name}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="bg-slate-100 px-2 py-1 text-[11px] text-slate-500">店名なし</span>
                                )}

                                {score !== null ? (
                                  <span className="bg-slate-50 px-2 py-1 text-[11px] text-orange-800">
                                    おすすめ <span className="ml-1 font-semibold">{score}/10</span>
                                  </span>
                                ) : null}

                                {priceLabel ? (
                                  <span className="bg-slate-100 px-2 py-1 text-[11px] text-slate-700">{priceLabel}</span>
                                ) : null}
                              </div>

                              {p.place_address ? (
                                <div className="mt-1 truncate text-[11px] text-slate-500">{p.place_address}</div>
                              ) : null}

                              <div className="mt-2 text-[11px] text-slate-500">
                                {p.visited_on ? `来店: ${p.visited_on}` : `投稿日: ${p.created_at}`}
                              </div>

                              <div className="mt-2 text-[11px] text-orange-700">投稿を見る →</div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="border border-black/[.06] bg-white p-8 text-center text-sm text-slate-700">
                      この日は投稿がありません。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
