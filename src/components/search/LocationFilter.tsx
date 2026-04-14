// src/components/search/LocationFilter.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { TrainFront, X } from "lucide-react";

type Station = {
  station_place_id: string;
  station_name: string;
  count_places?: number | null;
};

type Props = {
  stationPlaceId: string | null;
  stationName: string | null;
  onSelect: (station: Station) => void;
  onClear: () => void;
};

export default function LocationFilter({ stationPlaceId, stationName, onSelect, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggests, setSuggests] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Debounced station suggest
  useEffect(() => {
    const qq = query.trim();
    if (!qq) { setSuggests([]); return; }

    const my = ++reqId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search/suggest/station?q=${encodeURIComponent(qq)}&limit=8`);
        const data = await res.json().catch(() => ({}));
        if (reqId.current !== my) return;
        setSuggests(Array.isArray(data?.stations) ? data.stations : []);
      } catch {
        if (reqId.current === my) setSuggests([]);
      } finally {
        if (reqId.current === my) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const openSearch = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setSuggests([]);
  };

  const handleSelect = (s: Station) => {
    onSelect(s);
    close();
  };

  // Station selected → show chip
  if (stationPlaceId && stationName) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 dark:bg-white/15 pl-3 pr-2 py-1.5 text-[13px] font-semibold text-white dark:text-gray-100">
        <TrainFront size={13} className="shrink-0" />
        <span className="max-w-[140px] truncate">{stationName}</span>
        <button
          type="button"
          aria-label="駅を外す"
          onClick={onClear}
          className="ml-0.5 grid h-5 w-5 place-items-center rounded-full transition hover:bg-white/20"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // Station search input open
  if (open) {
    return (
      <div className="relative">
        <div className="flex items-center gap-2 rounded-full border border-orange-300 dark:border-orange-700/50 bg-white dark:bg-white/[.06] px-3 py-1.5 shadow-sm">
          <TrainFront size={14} className="shrink-0 text-slate-500 dark:text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setTimeout(close, 150)}
            onKeyDown={(e) => { if (e.key === "Escape") close(); }}
            placeholder="駅名を入力..."
            className="w-32 bg-transparent text-[16px] text-slate-900 dark:text-gray-100 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 leading-tight"
            inputMode="search"
          />
          {loading && <span className="text-[11px] text-slate-400 dark:text-gray-500">…</span>}
          <button type="button" onClick={close} className="text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300">
            <X size={13} />
          </button>
        </div>

        {suggests.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-black/[.08] dark:border-white/10 bg-white dark:bg-[#1e2026] shadow-lg">
            {suggests.map((s) => (
              <button
                key={s.station_place_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-orange-50 dark:hover:bg-white/[.06]"
              >
                <div className="flex items-center gap-2">
                  <TrainFront size={14} className="shrink-0 text-slate-500 dark:text-gray-400" />
                  <span className="text-sm font-medium text-slate-900 dark:text-gray-100">{s.station_name}</span>
                </div>
                {typeof s.count_places === "number" && (
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-gray-500">{s.count_places}件</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default: button to open station search
  return (
    <button
      type="button"
      onClick={openSearch}
      className="inline-flex items-center gap-1.5 rounded-full border border-black/[.08] dark:border-white/10 bg-white dark:bg-white/[.06] px-3 py-1.5 text-[13px] text-slate-600 dark:text-gray-400 transition hover:bg-slate-50 dark:hover:bg-white/10"
    >
      <TrainFront size={13} className="text-slate-400 dark:text-gray-500" />
      <span>駅で絞り込む</span>
    </button>
  );
}
