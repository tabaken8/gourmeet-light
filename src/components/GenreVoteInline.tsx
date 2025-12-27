"use client";

import React, { useEffect, useMemo, useState } from "react";

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

function Chip({
  active,
  children,
  onClick,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-bold",
        active
          ? "border-orange-300 bg-orange-50 text-orange-800"
          : "border-black/10 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function GenreVoteInline({
  placeId,
  compact = true,
  defaultOpen = false,
  showCounts = false,
  onVoted,
}: {
  placeId: string;
  compact?: boolean;
  defaultOpen?: boolean;
  showCounts?: boolean; // RLSで取れないこともあるのでデフォfalse推奨
  onVoted?: (emoji: string | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [myEmoji, setMyEmoji] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const topLabel = useMemo(() => {
    if (!myEmoji) return "ジャンルを追加";
    const hit = GENRES.find((g) => g.emoji === myEmoji);
    return hit ? `ジャンル: ${hit.emoji} ${hit.label}` : `ジャンル: ${myEmoji}`;
  }, [myEmoji]);

  async function refresh() {
    try {
      const res = await fetch(`/api/place-genre-vote?place_id=${encodeURIComponent(placeId)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setMyEmoji(json?.my_emoji ?? null);
      setCounts(json?.counts ?? {});
    } catch {}
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  async function vote(next: string | null) {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/place-genre-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId, emoji: next }),
      });
      if (!res.ok) return;
      setMyEmoji(next);
      onVoted?.(next);
      // countsを更新（RLSで見えない場合でも害はない）
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "" : "rounded-2xl border border-black/10 bg-white p-3"}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={[
            "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-extrabold",
            myEmoji ? "bg-slate-900 text-white" : "bg-white border border-black/10 text-slate-700 hover:bg-slate-50",
          ].join(" ")}
          onClick={() => setOpen((v) => !v)}
        >
          {topLabel}
        </button>

        {myEmoji ? (
          <button
            type="button"
            onClick={() => vote(null)}
            className="text-[11px] font-semibold text-slate-500 hover:underline"
            disabled={loading}
          >
            クリア
          </button>
        ) : null}

        <span className="flex-1" />

        {loading ? <span className="text-[11px] text-slate-500">保存中…</span> : null}
      </div>

      {open ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Chip
              key={g.key}
              active={myEmoji === g.emoji}
              onClick={() => vote(g.emoji)}
              title={g.label}
            >
              <span className="text-[14px]">{g.emoji}</span>
              <span className="text-[12px]">{g.label}</span>
              {showCounts && counts[g.emoji] ? (
                <span className="ml-1 text-[11px] font-black text-slate-500">
                  {counts[g.emoji]}
                </span>
              ) : null}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
