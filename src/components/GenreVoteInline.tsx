"use client";

import * as React from "react";

type Props = {
  placeId: string;
};

type ApiGet = {
  my_genre: string | null;
  counts: Record<string, number>;
};

const DEFAULT_GENRES = [
  "ラーメン",
  "寿司",
  "焼肉",
  "居酒屋",
  "カフェ",
  "喫茶店",
  "イタリアン",
  "フレンチ",
  "中華",
  "韓国料理",
  "カレー",
  "ハンバーガー",
  "そば",
  "うどん",
  "定食",
  "和食",
  "洋食",
  "スイーツ",
];

function uniq(arr: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const t = (s ?? "").trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function sortByCountsThenName(options: string[], counts: Record<string, number>) {
  // counts が多いものを少し上に出す（ただしデフォルトを壊しすぎない）
  return [...options].sort((a, b) => {
    const ca = counts[a] ?? 0;
    const cb = counts[b] ?? 0;
    if (ca !== cb) return cb - ca;
    return a.localeCompare(b, "ja");
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function GenreVoteInline({ placeId }: Props) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [myGenre, setMyGenre] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<Record<string, number>>({});

  const [options, setOptions] = React.useState<string[]>(DEFAULT_GENRES);
  const [selected, setSelected] = React.useState<string>("");

  const [custom, setCustom] = React.useState("");

  const fetchState = React.useCallback(async () => {
    const res = await fetch(`/api/place-genre-vote?place_id=${encodeURIComponent(placeId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as ApiGet;
    setMyGenre(json.my_genre ?? null);
    setCounts(json.counts ?? {});
  }, [placeId]);

  React.useEffect(() => {
    fetchState();
  }, [fetchState]);

  // モーダルを開いたら選択肢を組む
  React.useEffect(() => {
    if (!open) return;

    const counted = Object.keys(counts ?? {});
    const base = uniq([
      ...(myGenre ? [myGenre] : []),
      ...DEFAULT_GENRES,
      ...counted,
    ]);

    // counts による並び替え（上に寄せる）
    const sorted = sortByCountsThenName(base, counts ?? {});
    setOptions(sorted);

    // 初期選択
    setSelected(myGenre ?? sorted[0] ?? "");
    setCustom("");
  }, [open, counts, myGenre]);

  const onSave = React.useCallback(async () => {
    setLoading(true);
    try {
      const genre = (selected ?? "").trim();
      const res = await fetch("/api/place-genre-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId, genre }),
      });
      if (!res.ok) return;

      setOpen(false);
      await fetchState();
    } finally {
      setLoading(false);
    }
  }, [placeId, selected, fetchState]);

  const onClear = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/place-genre-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: placeId, genre: "" }),
      });
      if (!res.ok) return;

      setSelected("");
      setMyGenre(null);
      setOpen(false);
      await fetchState();
    } finally {
      setLoading(false);
    }
  }, [placeId, fetchState]);

  const addCustom = React.useCallback(() => {
    const g = custom.trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 24);
    if (!g) return;

    setOptions((prev) => uniq([g, ...prev]));
    setSelected(g);
    setCustom("");
  }, [custom]);

  // “気づかれにくい”表示：普段は小さく控えめ
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          gm-press
          w-full
          text-left
          rounded-2xl
          border border-black/[.06]
          bg-white/60
          px-3 py-2
          text-[12px]
          text-slate-600
          hover:bg-white/75
        "
        aria-label="ジャンルを選ぶ"
      >
        {myGenre ? (
          <span className="truncate">
            ジャンル: <span className="text-slate-800 font-medium">{myGenre}</span>{" "}
            <span className="text-slate-400">（変更）</span>
          </span>
        ) : (
          <span className="text-slate-500">ジャンルを選ぶ</span>
        )}
      </button>

      {/* モーダル */}
      {open ? (
        <div
          className="fixed inset-0 z-[60]"
          role="dialog"
          aria-modal="true"
          aria-label="ジャンル投票"
        >
          {/* 背景 */}
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            onClick={() => (loading ? null : setOpen(false))}
            aria-label="閉じる"
          />

          {/* シート */}
          <div
            className="
              absolute inset-x-0 bottom-0
              mx-auto
              max-w-lg
              rounded-t-3xl
              border border-black/[.08]
              bg-white
              shadow-2xl
            "
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">ジャンルを選択</div>
                <button
                  type="button"
                  onClick={() => (loading ? null : setOpen(false))}
                  className="gm-press rounded-full px-3 py-1 text-[12px] text-slate-500 hover:text-slate-800"
                >
                  閉じる
                </button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">

              </div>
            </div>

            {/* ホイール風ピッカー（崩れてもクリックで選べる） */}
            <WheelLikePicker
              options={options}
              value={selected}
              onChange={setSelected}
            />

            {/* 追加 */}
            <div className="px-4 pt-3">
              <div className="text-[11px] font-medium text-slate-700">新しいジャンルを追加</div>
              <div className="mt-2 flex gap-2">
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="例：ジビエ、ワインバー など"
                  className="
                    flex-1
                    rounded-2xl
                    border border-black/[.10]
                    bg-white
                    px-3 py-2
                    text-sm
                    outline-none
                    focus:ring-2 focus:ring-orange-200
                  "
                />
                <button
                  type="button"
                  onClick={addCustom}
                  className="
                    gm-press
                    rounded-2xl
                    border border-black/[.10]
                    bg-white
                    px-3 py-2
                    text-sm
                  "
                >
                  追加
                </button>
              </div>

              {/* みんなの投票（見える場合のみ） */}
              <div className="mt-4 rounded-2xl border border-black/[.06] bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-700">みんなの傾向</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.keys(counts).length === 0 ? (
                    <span className="text-[11px] text-slate-500">
                      （他ユーザーの投票が見えない設定の場合は表示されません）
                    </span>
                  ) : (
                    Object.entries(counts)
                      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                      .slice(0, 12)
                      .map(([g, c]) => (
                        <span
                          key={g}
                          className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-700 border border-black/[.06]"
                        >
                          {g} <span className="text-slate-400">{c}</span>
                        </span>
                      ))
                  )}
                </div>
              </div>
            </div>

            {/* フッター */}
            <div className="px-4 py-4 flex items-center gap-2">
              <button
                type="button"
                onClick={onClear}
                disabled={loading}
                className="
                  gm-press
                  rounded-2xl
                  border border-black/[.10]
                  bg-white
                  px-3 py-2
                  text-sm
                  text-slate-600
                "
              >
                未設定に戻す
              </button>

              <div className="flex-1" />

              <button
                type="button"
                onClick={onSave}
                disabled={loading || !selected.trim()}
                className="
                  gm-press
                  rounded-2xl
                  bg-orange-600
                  px-4 py-2
                  text-sm
                  font-semibold
                  text-white
                  disabled:opacity-50
                "
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WheelLikePicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const itemH = 44; // px
  const visible = 5; // odd
  const pad = Math.floor(visible / 2);

  const safeOptions = options.length ? options : ["（候補なし）"];
  const idx = Math.max(0, safeOptions.findIndex((x) => x === value));
  const [activeIndex, setActiveIndex] = React.useState(idx);

  // value が変わったらセンターにスクロール
  React.useEffect(() => {
    const i = Math.max(0, safeOptions.findIndex((x) => x === value));
    setActiveIndex(i);

    const el = listRef.current;
    if (!el) return;

    // 次フレームでスクロール
    requestAnimationFrame(() => {
      el.scrollTo({ top: i * itemH, behavior: "smooth" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, safeOptions.join("|")]);

  // スクロールで一番近い項目を選ぶ（クリックでも選べる）
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    let raf = 0;
    let t: any = null;

    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = clamp(Math.round(el.scrollTop / itemH), 0, safeOptions.length - 1);
        setActiveIndex(i);

        // スクロールが止まったら確定
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          const v = safeOptions[i];
          if (v && v !== value) onChange(v);
          // センターに吸着（微妙なズレ防止）
          el.scrollTo({ top: i * itemH, behavior: "smooth" });
        }, 110);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll as any);
      if (raf) cancelAnimationFrame(raf);
      if (t) clearTimeout(t);
    };
  }, [itemH, onChange, safeOptions, value]);

  return (
    <div className="px-4">
      <div
        className="
          relative
          rounded-3xl
          border border-black/[.08]
          bg-white
          overflow-hidden
        "
        style={{ height: itemH * visible }}
      >
        {/* フェード（ホイールっぽさ） */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />

        {/* センターのハイライト帯 */}
        <div
          className="pointer-events-none absolute inset-x-2 rounded-2xl border border-orange-200 bg-orange-50/60"
          style={{
            top: itemH * pad,
            height: itemH,
          }}
        />

        {/* スクロールリスト */}
        <div
          ref={listRef}
          className="h-full overflow-y-auto overscroll-contain"
          style={{
            scrollSnapType: "y mandatory",
          }}
        >
          {/* 上下余白（センターに合わせる） */}
          <div style={{ height: itemH * pad }} />
          {safeOptions.map((g, i) => {
            const active = i === activeIndex;
            return (
              <button
                type="button"
                key={`${g}-${i}`}
                onClick={() => onChange(g)}
                className={`
                  w-full
                  px-3
                  text-left
                  text-sm
                  ${active ? "text-slate-900 font-semibold" : "text-slate-600"}
                `}
                style={{
                  height: itemH,
                  scrollSnapAlign: "center",
                }}
              >
                <span className="truncate block">{g}</span>
              </button>
            );
          })}
          <div style={{ height: itemH * pad }} />
        </div>
      </div>
    </div>
  );
}
