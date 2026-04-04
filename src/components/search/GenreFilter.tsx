// src/components/search/GenreFilter.tsx
"use client";

import { useState } from "react";

type Props = {
  genres: string[];
  selectedGenre: string;
  loading: boolean;
  onSelect: (genre: string) => void;
};

const GENRE_LIMIT = 10;

function chip(active: boolean) {
  return [
    "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
    active
      ? "border-orange-400 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 font-semibold"
      : "border-black/[.08] dark:border-white/10 bg-white dark:bg-white/[.06] text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10",
  ].join(" ");
}

export default function GenreFilter({ genres, selectedGenre, loading, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? genres : genres.slice(0, GENRE_LIMIT);
  const hasMore = genres.length > GENRE_LIMIT;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {/* すべて */}
      <button
        type="button"
        className={chip(!selectedGenre)}
        onClick={() => onSelect("")}
      >
        すべて
      </button>

      {loading && genres.length === 0 && (
        <span className="self-center px-1 text-[11px] text-slate-400 dark:text-gray-500">読込中…</span>
      )}

      {visible.map((g) => (
        <button
          key={g}
          type="button"
          className={chip(selectedGenre === g)}
          onClick={() => onSelect(selectedGenre === g ? "" : g)}
        >
          {g}
        </button>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-full border border-black/[.08] dark:border-white/10 bg-white dark:bg-white/[.06] px-3 py-1.5 text-[12px] text-slate-500 dark:text-gray-400 transition hover:bg-slate-50 dark:hover:bg-white/10"
        >
          {expanded ? "閉じる" : `+${genres.length - GENRE_LIMIT}`}
        </button>
      )}
    </div>
  );
}
