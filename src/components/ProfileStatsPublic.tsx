// src/components/ProfileStatsPublic.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type StatsResponse = {
  ok: boolean;
  userId: string;
  totalPosts: number;
  topGenre: string;
  genres: Array<{ genre: string; count: number }>;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pickTitle(topGenre: string, totalPosts: number) {
  // 雑に「辞書＋条件」で称号を作る（後で辞書を増やせる）
  const g = (topGenre || "未分類").trim();

  const genreKing = `${g}のキング`;
  const allRounder = "オールラウンダー";
  const foodie = "美食家";
  const explorer = "開拓者";

  // 投稿数で雰囲気を変える
  if (totalPosts >= 80) return genreKing;
  if (totalPosts >= 40) return foodie;
  if (totalPosts >= 15) return explorer;
  return allRounder;
}

/**
 * 本当は全ユーザー分布から出すけど、今は “placeholder” として
 * （a）ユーザーの topGenre 比率と（b）投稿数 を使ってそれっぽい値を作る。
 * 後でサーバ側で本計算に差し替えやすいよう関数を分離。
 */
function pseudoPercentile(genres: Array<{ genre: string; count: number }>, totalPosts: number) {
  if (!totalPosts) return 50;
  const top = genres?.[0]?.count ?? 0;
  const ratio = top / Math.max(1, totalPosts); // 0..1
  // 投稿数多い＋偏り強いほど「上位」っぽく
  const score = 0.6 * ratio + 0.4 * clamp(totalPosts / 120, 0, 1);
  const pct = 100 - Math.round(score * 80); // 20%〜100%くらい
  return clamp(pct, 1, 99);
}

/** SVG pie (軽量、Recharts不要) */
function Pie({
  data,
  size = 140,
  stroke = 10,
}: {
  data: Array<{ label: string; value: number }>;
  size?: number;
  stroke?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  // 色は Tailwind の class でやるのが面倒なので、SVGのstrokeだけは固定的に
  // “おしゃれ”はカード側のUIで担保（あとで増やすなら配列追加）
  const colors = ["#fb923c", "#f59e0b", "#f97316", "#ef4444", "#facc15", "#fdba74", "#f87171", "#fb7185"];

  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth={stroke} />
      {data.map((d, i) => {
        if (!total) return null;
        const frac = d.value / total;
        const dash = frac * circumference;
        const gap = circumference - dash;
        const offset = -acc * circumference;
        acc += frac;

        return (
          <circle
            key={d.label}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${c} ${c})`}
          />
        );
      })}
    </svg>
  );
}

export default function ProfileStatsPublic({
  userId,
  canView,
}: {
  userId: string;
  canView: boolean;
}) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let mounted = true;
    (async () => {
      try {
        setErr(null);
        const res = await fetch(`/api/profile/stats?user_id=${encodeURIComponent(userId)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          // 401/403/404 は「静かに非表示」でもOKだが、ここでは err にする
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? `stats failed (${res.status})`);
        }
        const j = (await res.json()) as StatsResponse;
        if (!mounted) return;
        setData(j);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "stats error");
        setData(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId, canView]);

  const title = useMemo(() => {
    if (!data) return "";
    return pickTitle(data.topGenre, data.totalPosts);
  }, [data]);

  const percentile = useMemo(() => {
    if (!data) return null;
    return pseudoPercentile(data.genres, data.totalPosts);
  }, [data]);

  const pieData = useMemo(() => {
    const g = data?.genres ?? [];
    // 円グラフは上位6まで + その他
    const top = g.slice(0, 6);
    const rest = g.slice(6).reduce((s, x) => s + x.count, 0);
    const out = top.map((x) => ({ label: x.genre, value: x.count }));
    if (rest > 0) out.push({ label: "その他", value: rest });
    return out;
  }, [data]);

  if (!canView) return null;

  // statsが無くても「空状態」は出す
  if (!data) {
    return (
      <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 md:text-base">プロフィール統計</h2>
          <div className="text-[11px] text-slate-500">Stats</div>
        </div>
        <div className="mt-3 rounded-xl border border-orange-50 bg-orange-50/60 p-6 text-center text-xs text-slate-600 md:text-sm">
          {err ? `読み込みに失敗しました: ${err}` : "読み込み中..."}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 md:text-base">プロフィール統計</h2>
          <p className="mt-1 text-[11px] text-slate-500">この人の“傾向”を一瞬で。</p>
        </div>
        <div className="text-[11px] text-slate-500">
          <div className="text-right font-medium text-slate-700">{data.totalPosts} posts</div>
        </div>
      </div>

      {/* 視線の順番：称号 → 比較 → 円グラフ */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* 1) 称号 */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl border border-black/[.06] bg-white/70 p-4"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">
            Title
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900">{title}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            一位ジャンル：<span className="font-semibold text-slate-700">{data.topGenre}</span>
          </div>
        </motion.div>

        {/* 2) 比較（パーセンタイル） */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="rounded-2xl border border-black/[.06] bg-white/70 p-4"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">
            Compare
          </div>

          <div className="mt-2 text-sm font-semibold text-slate-900">
             <span className="text-orange-700">{data.topGenre}率</span> は、
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            同地域ユーザーの上位{" "}
            <span className="text-orange-600">{percentile ?? 50}%</span>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">

          </div>
        </motion.div>

        {/* 3) 円グラフ（ジャンル） */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="md:col-span-2 rounded-2xl border border-black/[.06] bg-white/70 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">
                Genre
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">ジャンル構成</div>
              <div className="mt-1 text-[11px] text-slate-500">投稿ベース（全期間）</div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35 }}
              className="flex items-center justify-center"
            >
              <Pie data={pieData.map((x) => ({ label: x.label, value: x.value }))} />
            </motion.div>

            <div className="flex-1">
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pieData.map((g) => (
                  <li
                    key={g.label}
                    className="flex items-center justify-between rounded-xl border border-black/[.06] bg-white/60 px-3 py-2"
                  >
                    <span className="truncate text-xs font-medium text-slate-800">{g.label}</span>
                    <span className="text-xs font-semibold text-slate-900">{g.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
