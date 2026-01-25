"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { X, MapPin } from "lucide-react";
import { createPortal } from "react-dom";

export type HeatmapDay = {
  date: string; // "YYYY-MM-DD" (JST基準の代表日付)
  count: number;
  maxScore: number | null;
  posts: Array<{ id: string; thumbUrl: string | null }>; // 事前プレビュー用（上位3件など）
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
  if (maxScore === null || !Number.isFinite(maxScore)) return 0; // 0=無
  if (maxScore <= 7) return 1; // 黄色固定
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

export default function VisitHeatmap({
  userId,
  days,
}: {
  userId: string;
  days: HeatmapDay[];
}) {
  const supabase = createClientComponentClient();

  // 横スクロール右寄せ（最新が右）
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }, []);

  // 日付→集計データ
  const dayMap = useMemo(() => {
    const m = new Map<string, HeatmapDay>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  // 直近12ヶ月の日付配列（JST）
  const calendar = useMemo(() => {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayKey = dtf.format(new Date());

    const res: string[] = [];
    const [ty, tm, td] = todayKey.split("-").map(Number);
    const todayJstNoonUtc = Date.UTC(ty, tm - 1, td, 12, 0, 0) - 9 * 60 * 60 * 1000;

    for (let i = 364; i >= 0; i--) {
      const t = new Date(todayJstNoonUtc - i * 24 * 60 * 60 * 1000);
      const key = dtf.format(new Date(t.getTime() + 9 * 60 * 60 * 1000));
      res.push(key);
    }

    const startKey = res[0] ?? todayKey;
    const endKey = res[res.length - 1] ?? todayKey;

    return { todayKey, dates: res, startKey, endKey };
  }, []);

  // 週の開始：月曜
  function weekdayMon0(dateKey: string) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const jstNoonUtc = Date.UTC(y, m - 1, d, 12, 0, 0) - 9 * 60 * 60 * 1000;
    const day = new Date(jstNoonUtc).getUTCDay(); // 0=Sun
    return (day + 6) % 7; // Mon=0..Sun=6
  }

  // グリッド（GitHub風：週×曜日）
  const grid = useMemo(() => {
    const dates = calendar.dates;
    if (dates.length === 0) return { weeks: [] as string[][] };

    const first = dates[0];
    const pad = weekdayMon0(first);
    const padded: (string | null)[] = Array(pad).fill(null).concat(dates);

    const weeks: string[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      const col = padded.slice(i, i + 7).map((x) => (x ?? "")) as string[];
      weeks.push(col);
    }

    return { weeks };
  }, [calendar]);

  // ✅ Month ラベル（週列ごと：月が変わった週だけ表示）
  const monthLabels = useMemo(() => {
    // 各週の「代表日」（その列で最初に非空のdateKey）を見て、前列と月が違うならラベル表示
    const labels: Array<{ show: boolean; text: string }> = [];
    let prevYM: string | null = null;

    for (const col of grid.weeks) {
      const firstKey = col.find((x) => x && x.length === 10) ?? "";
      if (!firstKey) {
        labels.push({ show: false, text: "" });
        continue;
      }
      const ym = firstKey.slice(0, 7); // YYYY-MM
      if (ym !== prevYM) {
        const m = Number(firstKey.slice(5, 7));
        labels.push({ show: true, text: monthLabel(m) });
        prevYM = ym;
      } else {
        labels.push({ show: false, text: "" });
      }
    }
    return labels;
  }, [grid.weeks]);

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
        .or(
          `visited_on.eq.${dateKey},and(visited_on.is.null,created_at.gte.${startIso},created_at.lt.${endIso})`
        )
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

  // ✅ 凡例：実際の段階（0 + 1 + 10段階）をそのまま並べる
  const legendLevels = useMemo(() => {
    // 0..11 を全部見せる（= 12個）
    return Array.from({ length: 12 }, (_, i) => i);
  }, []);

  return (
    <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 md:text-base">来店ログ</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            ブロックを押すと投稿を見ることができます。
            <span className="ml-2 text-slate-400"></span>
          </p>
        </div>

        <div className="text-[11px] text-slate-500">
          <div className="text-right font-medium text-slate-700">{yearRangeText}</div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <span className="text-slate-500"></span>
            <div className="flex items-center gap-0.5">
              {legendLevels.map((lv) => (
                <span key={lv} className={`h-2.5 w-2.5 rounded-[3px] ${levelClass(lv)}`} />
              ))}
            </div>
            <span className="text-slate-500"></span>
          </div>
        </div>
      </div>

      {/* GitHub風：横スクロール（最新が右） */}
      <div ref={scrollRef} className="mt-4 overflow-x-auto overscroll-x-contain">
        <div className="min-w-[760px] pr-2">
          {/* ✅ Month labels */}
          <div className="mb-2 flex gap-1 pl-0">
            {monthLabels.map((m, i) => (
              <div key={i} className="w-3.5">
                {m.show ? (
                  <div className="text-[10px] font-medium text-slate-500">{m.text}</div>
                ) : (
                  <div className="text-[10px] text-transparent">.</div>
                )}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex gap-1">
            {grid.weeks.map((col, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {col.map((dateKey, di) => {
                  if (!dateKey) {
                    return <div key={`${wi}-${di}`} className="h-3.5 w-3.5 rounded-[3px] bg-transparent" />;
                  }
                  const d = dayMap.get(dateKey) ?? null;
                  const level = scoreToLevel(d?.maxScore ?? null);

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      className={[
                        "h-3.5 w-3.5 rounded-[3px] transition",
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

      {/* ✅ PC hover popover */}
      {hoverKey && hoverPos && hoverDay && isPointerFine() && (
        <div
          className="fixed z-[9998] -translate-x-1/2 rounded-2xl border border-orange-100 bg-white/95 p-3 shadow-xl backdrop-blur"
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
                <div key={p.id} className="h-12 w-12 overflow-hidden rounded-xl bg-slate-100">
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

      {/* ✅ 大きいモーダル（Portalで最前面） */}
      {openKey &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-black/35" onClick={closeModal} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center p-3 md:p-6">
              <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-black/[.06] p-4 md:p-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                      Visits
                    </div>
                    <div className="mt-1 text-base font-bold text-slate-900 md:text-lg">{openKey}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {loadingDetail ? "読み込み中..." : `${detailPosts.length}件`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-orange-100 bg-orange-50 text-slate-700 hover:bg-orange-100"
                    aria-label="閉じる"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="max-h-[78vh] overflow-y-auto p-4 md:p-5">
                  {loadingDetail ? (
                    <div className="rounded-2xl border border-orange-50 bg-orange-50/60 p-8 text-center text-sm text-slate-700">
                      読み込み中…
                    </div>
                  ) : detailPosts.length ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {detailPosts.map((p) => {
                        const score =
                          typeof p.recommend_score === "number" &&
                          p.recommend_score >= 0 &&
                          p.recommend_score <= 10
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
                            className="group flex gap-3 rounded-2xl border border-black/[.06] bg-white p-3 shadow-sm transition hover:shadow-md"
                          >
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 md:h-24 md:w-24">
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
                                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[11px] text-slate-800">
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
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                                    店名なし
                                  </span>
                                )}

                                {score !== null ? (
                                  <span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] text-orange-800">
                                    おすすめ <span className="ml-1 font-semibold">{score}/10</span>
                                  </span>
                                ) : null}

                                {priceLabel ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
                                    {priceLabel}
                                  </span>
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
                    <div className="rounded-2xl border border-orange-50 bg-orange-50/60 p-8 text-center text-sm text-slate-700">
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
