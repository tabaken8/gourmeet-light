// src/components/search/GenreFilter.tsx
"use client";

type Props = {
  genres: string[];
  selectedGenre: string;
  loading: boolean;
  onSelect: (genre: string) => void;
};

function chip(active: boolean) {
  return [
    "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium transition",
    active
      ? "border-orange-400 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 font-semibold"
      : "border-black/[.08] dark:border-white/10 bg-white dark:bg-white/[.06] text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10",
  ].join(" ");
}

export default function GenreFilter({ genres, selectedGenre, loading, onSelect }: Props) {
  return (
    <div className="mt-1 -mx-2 px-2 overflow-x-auto scrollbar-none">
      <div className="flex gap-1.5 pb-1">
        {/* すべて */}
        <button
          type="button"
          className={chip(!selectedGenre)}
          onClick={() => onSelect("")}
        >
          すべて
        </button>

        {loading && genres.length === 0 && (
          <span className="self-center px-1 text-[11px] text-slate-400 dark:text-gray-500 shrink-0">読込中…</span>
        )}

        {genres.map((g) => (
          <button
            key={g}
            type="button"
            className={chip(selectedGenre === g)}
            onClick={() => onSelect(selectedGenre === g ? "" : g)}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}
