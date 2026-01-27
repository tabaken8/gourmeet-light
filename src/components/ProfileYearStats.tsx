// src/components/ProfileYearStats.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, EyeOff, Eye } from "lucide-react";

type Scope = "me" | "public";
type BadgeTier = "none" | "bronze" | "silver" | "gold" | "diamond";

type TitleMeta = {
  kind: "king" | "allrounder" | "gourmet" | "starter";
  emoji: string;
  accent: "amber" | "violet" | "rose" | "sky";
};

type GlobalRank = { rank: number; totalActive: number; topPercent: number; metricLabel?: string };

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
  year: number | null; // ✅ null = すべて
  title: string;
  titleMeta: TitleMeta;

  totals: { posts: number };
  topGenre: null | { genre: string; count: number };

  globalRank: null | GlobalRank;

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
  year: number | null; // ✅ null = すべて
  title: string;
  titleMeta: TitleMeta;

  totals: { posts: number };
  topGenre: null | { genre: string; count: number };

  globalRank: null | GlobalRank;

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

function rankText(gr: GlobalRank) {
  const pct = Number.isFinite(gr.topPercent) ? gr.topPercent : 100;
  return `あなたはこのジャンルで全ユーザーの上位 ${pct.toFixed(1)}%に位置しています。`;
}

function tierEmoji(t: BadgeTier): string | null {
  switch (t) {
    case "diamond":
      return "💎";
    case "gold":
      return "🥇";
    case "silver":
      return "🥈";
    case "bronze":
      return "🥉";
    default:
      return null;
  }
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

function TitlePlate({ title, meta }: { title: string; meta: TitleMeta }) {
  const grad = accentRing(meta.accent);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-black/[.06] bg-white/70 p-4">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className={["absolute -inset-x-10 -top-10 h-24 rotate-6 bg-gradient-to-r", grad].join(" ")} />
        <motion.div
          className={["absolute -inset-x-10 top-10 h-20 rotate-6 bg-gradient-to-r", grad].join(" ")}
          initial={{ x: -40, opacity: 0.18 }}
          animate={{ x: 40, opacity: 0.28 }}
          transition={{ duration: 2.8, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        />
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-orange-500">称号</div>
          <div className="mt-1 text-xl font-black tracking-tight text-slate-900">
            <span className="mr-2">{meta.emoji}</span>
            <span className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
              {title}
            </span>
          </div>
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
        <div className="mt-0.5 text-[11px] text-slate-500">{hover ? `${hover.value}` : total > 0 ? `${total}` : "—"}</div>
      </div>
    </div>
  );
}

function ProgressCard({ label, progress }: { label: string; progress: BadgeProgress }) {
  const cur = tierEmoji(progress.tier);
  if (!cur) return null;

  const next = progress.nextTier ? tierEmoji(progress.nextTier) : null;
  const nextLeft =
    progress.nextAt === null
      ? null
      : Math.max(0, progress.nextAt - (Number.isFinite(progress.value) ? progress.value : 0));

  return (
    <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900">{label}</div>
        </div>
        <div className="text-xl leading-none">{cur}</div>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <div className="text-sm font-semibold text-slate-900">{progress.value}</div>

        {nextLeft === null ? (
          <div className="text-[11px] font-semibold text-slate-700">MAX</div>
        ) : next ? (
          <div className="text-[11px] text-slate-600">
            次 {next} まで <span className="font-semibold text-slate-900">{nextLeft}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PublicBadgesRow({ genreTier, postsTier }: { genreTier: BadgeTier; postsTier: BadgeTier }) {
  const a = tierEmoji(genreTier);
  const b = tierEmoji(postsTier);
  const list = [a, b].filter(Boolean) as string[];
  if (list.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {list.map((e, i) => (
        <span
          key={`${e}-${i}`}
          className="inline-flex items-center justify-center rounded-full border border-black/[.08] bg-white px-3 py-1.5 text-sm"
          aria-label="badge"
          title="badge"
        >
          {e}
        </span>
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

  // ✅ 「すべて」を先頭に追加
  const yearOptions = useMemo(() => {
    const ys = Array.from({ length: 6 }, (_, i) => thisYear - i);
    return ["all" as const, ...ys] as const;
  }, [thisYear]);

  // ✅ "all" | number
  const [year, setYear] = useState<"all" | number>("all");
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

    fetch(`/api/profile/stats/year?user_id=${encodeURIComponent(userId)}&year=${encodeURIComponent(yearParam)}&scope=${scope}`, {
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
  }, [userId, year, scope, hidden]);

  const headerLabel = year === "all" ? "すべて" : `${year}年`;

  return (
    <section className={["rounded-3xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5", className ?? ""].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 md:text-base">{headerLabel}</div>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative">
            <select
              value={year === "all" ? "all" : String(year)}
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
                  <option key={y} value={String(y)}>
                    {y}年
                  </option>
                )
              )}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
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
                読み込み中…
              </div>
            ) : !data ? null : isErr(data) ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{data.error}</div>
            ) : data.ok && data.scope === "public" ? (
              <div className="space-y-3">
                <TitlePlate title={data.title} meta={data.titleMeta} />

                <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-900">投稿</div>
                    <div className="text-lg font-bold text-slate-900">{data.totals.posts}</div>
                  </div>

                  {data.topGenre ? (
                    <div className="mt-2 text-[11px] text-slate-600">
                      1位：<span className="font-semibold text-slate-900">{data.topGenre.genre}</span>
                    </div>
                  ) : null}

                  {data.globalRank ? (
                    <div className="mt-2 text-[11px] text-slate-500">{rankText(data.globalRank)}</div>
                  ) : null}

                  <PublicBadgesRow genreTier={data.badges.genreTier} postsTier={data.badges.postsTier} />
                </div>
              </div>
            ) : data.ok && data.scope === "me" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-3">
                  <TitlePlate title={data.title} meta={data.titleMeta} />

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ProgressCard label="ジャンル" progress={data.badges.genre} />
                    <ProgressCard label="投稿" progress={data.badges.posts} />
                  </div>

                  <div className="rounded-2xl border border-black/[.06] bg-white/70 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-900">投稿ジャンル</div>
                    </div>

                    {/* ✅ profileでも（回数）を出さない */}
                    {data.topGenre ? (
                      <div className="mt-2 text-[11px] text-slate-600">
                        1位：<span className="font-semibold text-slate-900">{data.topGenre.genre}</span>
                      </div>
                    ) : null}

                    {data.globalRank ? (
                      <div className="mt-2 text-[11px] text-slate-500">{rankText(data.globalRank)}</div>
                    ) : null}
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
                        .slice(0, 6)
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
                まだデータがありません。
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
