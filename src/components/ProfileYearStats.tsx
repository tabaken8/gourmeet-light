// src/components/ProfileYearStats.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, EyeOff, Eye, Medal } from "lucide-react";

type Scope = "me" | "public";
type BadgeTier = "none" | "bronze" | "silver" | "gold" | "diamond";

type TitleMeta = {
  kind: "starter" | "king" | "allrounder" | "traveler" | "steady" | "celebrity" | "local";
  emoji: string; // 称号の左に出す
  accent: "amber" | "violet" | "rose" | "sky";
};

type BadgeProgress = {
  tier: BadgeTier;
  value: number; // 現在値
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
  // 得意ジャンル：genre or "バランス" が入る想定
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

function jstYearNow(): number {
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric" }).format(new Date());
  return Number(y);
}

function isErr(x: ApiResponse | null): x is { error: string } {
  return !!(x as any)?.error;
}

function accentRing(a: TitleMeta["accent"]) {
  switch (a) {
    case "amber":
      return "from-amber-200 via-orange-100 to-amber-200 ring-amber-200/70";
    case "violet":
      return "from-violet-200 via-fuchsia-100 to-violet-200 ring-violet-200/70";
    case "rose":
      return "from-rose-200 via-orange-100 to-rose-200 ring-rose-200/70";
    case "sky":
    default:
      return "from-sky-200 via-white to-sky-200 ring-sky-200/70";
  }
}

function tierVisual(t: BadgeTier) {
  // lucideで「メダル感」出す：枠と色味だけで表現（色指定はTailwindクラス）
  // ※ “bronze/silver/gold/diamond” の文字はUIに出さない
  switch (t) {
    case "diamond":
      return { ring: "ring-sky-200/70", fg: "text-sky-600", bg: "bg-sky-50" };
    case "gold":
      return { ring: "ring-yellow-200/70", fg: "text-yellow-600", bg: "bg-yellow-50" };
    case "silver":
      return { ring: "ring-slate-200/80", fg: "text-slate-500", bg: "bg-slate-50" };
    case "bronze":
      return { ring: "ring-orange-200/70", fg: "text-orange-600", bg: "bg-orange-50" };
    default:
      return null;
  }
}

function nextTierHint(nextTier: BadgeTier | null, nextAt: number | null, now: number) {
  if (!nextTier || nextAt === null) return null;
  const left = Math.max(0, nextAt - (Number.isFinite(now) ? now : 0));
  const targetText = nextAt >= 1000 ? `${nextAt}` : `${nextAt}`;
  return { left, targetText };
}

function topPercentPretty(p: number) {
  if (!Number.isFinite(p)) return null;
  // 2桁まで。見た目の「整数ダサい」は route 側でランダム小数入れる想定だけど
  // 念のためここでも2桁に。
  return p.toFixed(2);
}

function TitlePlate({
  title,
  meta,
  topGenre,
}: {
  title: string;
  meta: TitleMeta;
  topGenre: null | { genre: string; topPercent: number };
}) {
  const grad = accentRing(meta.accent);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-black/[.06] bg-white/70 p-4">
      {/* きらめき背景（文字は載せない） */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className={["absolute -inset-x-10 -top-10 h-24 rotate-6 bg-gradient-to-r", grad].join(" ")} />
        {/* 光沢スイープ */}
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
            <span className="text-xl">{meta.emoji}</span>
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
                return p ? <span className="ml-1 text-slate-500">（全ユーザーで上位 {p}%）</span> : null;
              })()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * 軽量ドーナツ（依存なし）
 */
function DonutPie({
  data,
  size = 168,
  thickness = 18,
}: {
  data: Array<{ name: string; value: number }>;
  size?: number;
  thickness?: number;
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

  const colorFor = (i: number) => `hsl(${(i * 360) / Math.max(1, segments.length)}, 70%, 55%)`;

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
            transition={{ duration: 0.8, ease: "easeOut" }}
            onMouseEnter={() => setHover({ name: s.name, value: s.value })}
            onMouseLeave={() => setHover(null)}
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

function MedalIcon({
  tier,
  faded,
  big,
}: {
  tier: BadgeTier;
  faded?: boolean;
  big?: boolean;
}) {
  const v = tierVisual(tier);
  if (!v) return null;

  return (
    <div
      className={[
        "relative grid place-items-center rounded-2xl ring-1",
        v.bg,
        v.ring,
        faded ? "opacity-35" : "opacity-100",
        big ? "h-14 w-14" : "h-12 w-12",
      ].join(" ")}
      aria-label="medal"
    >
      {/* きらっと演出（獲得済みだけ） */}
      {!faded ? (
        <motion.div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
          initial={{ opacity: 0.0 }}
          animate={{ opacity: [0.0, 0.35, 0.0] }}
          transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
        >
          <div className="absolute -inset-x-10 -top-6 h-10 rotate-12 bg-gradient-to-r from-white/0 via-white/70 to-white/0" />
        </motion.div>
      ) : null}

      <Medal className={[v.fg, big ? "h-6 w-6" : "h-5 w-5"].join(" ")} />
    </div>
  );
}

function MedalRow({
  label,
  description,
  progress,
  unitLabel, // "回" or "件" など
}: {
  label: string;
  description: string;
  progress: BadgeProgress;
  unitLabel: string;
}) {
  const curTier = progress.tier;
  const curV = tierVisual(curTier);
  const hasCur = !!curV;

  const hint = nextTierHint(progress.nextTier, progress.nextAt, progress.value);
  const nextTier = progress.nextTier && tierVisual(progress.nextTier) ? progress.nextTier : "none";
  const showNext = progress.nextTier && progress.nextAt !== null;

  // “獲得してない人にも次の条件を出す” → ここでhasCurがfalseでも表示する
  return (
    <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
      {/* 上段：タイトル + メダル（獲得/次） */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900">{label}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{description}</div>
        </div>

        {/* 右：獲得済みメダル + 次のメダル（薄く） */}
        <div className="flex shrink-0 items-center gap-2">
          <MedalIcon tier={hasCur ? curTier : "bronze"} faded={!hasCur} big />
          {showNext && nextTier !== "none" ? <MedalIcon tier={nextTier} faded /> : null}
        </div>
      </div>

      {/* 下段：進捗 */}
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

          {!showNext || !hint ? (
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

function PublicBadgesRow({ genreTier, postsTier }: { genreTier: BadgeTier; postsTier: BadgeTier }) {
  const a = tierVisual(genreTier) ? <MedalIcon tier={genreTier} big /> : null;
  const b = tierVisual(postsTier) ? <MedalIcon tier={postsTier} big /> : null;

  const items = [
    { key: "genre", node: a },
    { key: "posts", node: b },
  ].filter((x) => x.node);

  if (items.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((it) => (
        <div key={it.key} className="inline-flex">
          {it.node}
        </div>
      ))}
    </div>
  );
}

export default function ProfileYearStats({
  userId,
  scope,
  className,
}: {
  userId: string;
  scope: Scope;
  className?: string;
}) {
  const thisYear = jstYearNow();

  // 「これまで」 + 直近年（ただしデフォルトは「これまで」）
  const yearOptions = useMemo<(number | "all")[]>(() => {
    const ys = Array.from({ length: 6 }, (_, i) => thisYear - i);
    return ["all", ...ys];
  }, [thisYear]);

  const [year, setYear] = useState<number | "all">("all");
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

    const yearParam = year === "all" ? "all" : String(year);

    fetch(
      `/api/profile/stats/year?user_id=${encodeURIComponent(userId)}&year=${encodeURIComponent(yearParam)}&scope=${scope}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
      }
    )
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
  }, [userId, year, scope, hidden]);

  return (
    <section
      className={[
        "rounded-3xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5",
        className ?? "",
      ].join(" ")}
    >
      {/* ヘッダー：年だけ（余計な説明は出さない） */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 md:text-base">{year === "all" ? "すべて" : `${year}年`}</div>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative">
            <select
              value={year}
              onChange={(e) => {
                const v = e.target.value;
                setYear(v === "all" ? "all" : Number(v));
              }}
              className="appearance-none rounded-full border border-black/[.08] bg-white px-3 py-2 pr-8 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-orange-300/60"
            >
              {yearOptions.map((y) =>
                y === "all" ? (
                  <option key="all" value="all">
                    すべて
                  </option>
                ) : (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                )
              )}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
            />
          </label>

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
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {hidden ? (
          <motion.div
            key="hidden"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-4 rounded-2xl border border-orange-50 bg-orange-50/60 p-6 text-center text-sm text-slate-700"
          >
            非表示
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
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
                />

                <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-900">投稿</div>
                    <div className="text-lg font-bold text-slate-900">{data.totals.posts}</div>
                  </div>

                  <PublicBadgesRow genreTier={data.badges.genreTier} postsTier={data.badges.postsTier} />
                </div>
              </div>
            ) : data.ok && data.scope === "me" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-3">
                  <TitlePlate
                    title={data.title}
                    meta={data.titleMeta}
                    topGenre={data.topGenre ? { genre: data.topGenre.genre, topPercent: data.topGenre.topPercent } : null}
                  />

                  {/* 獲得したメダル：縦積みを基本にして崩れを根絶 */}
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
                  </div>
                </div>

                <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                  <div className="text-xs font-semibold text-slate-900">ジャンル</div>
                  <div className="mt-3 flex items-center justify-center">
                    <DonutPie data={data.pie} />
                  </div>

                  {data.pie.length ? (
                    <div className="mt-4 space-y-1">
                      {data.pie
                        .slice()
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 8)
                        .map((g) => (
                          <div key={g.name} className="flex items-center justify-between text-[11px]">
                            <span className="truncate text-slate-700">{g.name}</span>
                            <span className="tabular-nums text-slate-500">{g.value}</span>
                          </div>
                        ))}
                    </div>
                  ) : null}
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
