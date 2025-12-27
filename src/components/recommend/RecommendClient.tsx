"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { DEMO_RESTAURANTS } from "@/lib/recommend/demoRestaurants";

type ApiResult = {
  id: string;
  headline: string;
  subline: string;
  reason: string;
  match_score: number;
};

type ApiResponse = {
  understood: {
    summary: string;
    extracted_tags: string[];
  };
  results: ApiResult[];
};

type UIItem = ApiResult & {
  lat: number;
  lng: number;
  name: string;
  area: string;
  genre: string;
  price: string;
  tags: string[];
};

const RecommendMap = dynamic(() => import("./RecommendMap"), { ssr: false });

const EXAMPLES = [
  "静かでデート向き、渋谷か恵比寿で。ワインあると嬉しい。",
  "一人でも入りやすいラーメン。1000円台。駅近。",
  "友達とワイワイできる居酒屋。¥¥くらい。",
  "作業しやすいカフェ。電源とWi-Fi。",
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function RecommendClient() {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(3);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // API結果(id)と demoRestaurants を join して地図に置ける形にする
  const uiItems: UIItem[] = useMemo(() => {
    if (!data) return [];

    const byId = new Map(DEMO_RESTAURANTS.map((r) => [r.id, r]));
    const mapped = data.results
      .map((r) => {
        const base = byId.get(r.id);
        if (!base) return null;
        return {
          ...r,
          lat: base.lat,
          lng: base.lng,
          name: base.name,
          area: base.area,
          genre: base.genre,
          price: base.price,
          tags: base.tags,
        } satisfies UIItem;
      })
      .filter(Boolean) as UIItem[];

    // デモ用途：APIが maxResults 未満で返してきても、残りを適当に補完して「件数体験」を崩さない
    const need = clamp(maxResults, 1, 5) - mapped.length;
    if (need <= 0) return mapped.slice(0, clamp(maxResults, 1, 5));

    const used = new Set(mapped.map((x) => x.id));
    const pool = DEMO_RESTAURANTS.filter((r) => !used.has(r.id));
    const filler = pool.slice(0, need).map((base, i) => ({
      id: base.id,
      headline: base.name,
      subline: `${base.area} / ${base.genre} / ${base.price}`,
      reason: `（デモ補完）タグ: ${base.tags.slice(0, 3).join("・")}`,
      match_score: 60 - i * 3,
      lat: base.lat,
      lng: base.lng,
      name: base.name,
      area: base.area,
      genre: base.genre,
      price: base.price,
      tags: base.tags,
    }));

    return [...mapped, ...filler].slice(0, clamp(maxResults, 1, 5));
  }, [data, maxResults]);

  async function runRecommend(nextQuery?: string) {
    const q = (nextQuery ?? query).trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setSelectedId(null);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, maxResults }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "unknown error");
    } finally {
      setLoading(false);
    }
  }

  const selected = uiItems.find((x) => x.id === selectedId) ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-4">
      <h1 className="text-2xl font-semibold tracking-tight">Gourmeet</h1>

      {/* Search bar */}
      <div className="mt-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="自然な言葉で探す（例：デートで静か、渋谷、予算）"
            className="w-full rounded-full border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          />
          <button
            onClick={() => runRecommend()}
            disabled={loading || !query.trim()}
            className="shrink-0 rounded-full bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "…" : "提案"}
          </button>
        </div>

        {/* Examples */}
        <div className="mt-4 space-y-2">
          <div className="text-xs text-gray-500">こんな感じで話しかけてみて</div>
          {EXAMPLES.map((t) => (
            <button
              key={t}
              onClick={() => {
                setQuery(t);
                runRecommend(t);
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm hover:bg-gray-50"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* AI panel + slider */}
      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          ✨ {data ? "リクエストを理解しました" : "リクエストを入力してください"}
        </div>

        <div className="mt-2 text-sm text-gray-700">
          {data?.understood?.summary ?? "入力内容に合わせて候補を提案します。"}
        </div>

        {/* chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(data?.understood?.extracted_tags ?? ["友達おすすめ", "東京エリア"]).map((c) => (
            <span
              key={c}
              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
            >
              {c}
            </span>
          ))}
        </div>

        {/* slider */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>表示件数</span>
            <span className="tabular-nums">{maxResults}</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="mt-2 w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>

          {/* 件数変更で自動更新したいなら、下のボタンを消して useEffect で runRecommend() を呼ぶ */}
          <button
            onClick={() => query.trim() && runRecommend()}
            disabled={loading || !query.trim()}
            className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "更新中…" : "この条件で再提案"}
          </button>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </div>

      {/* Map */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="h-[360px] w-full">
          <RecommendMap
            items={uiItems}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </div>
      </div>

      {/* Results list */}
      <div className="mt-4 space-y-3">
        {uiItems.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={[
                "w-full rounded-2xl border bg-white p-4 text-left",
                active ? "border-black/40" : "border-gray-200",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{r.headline}</div>
                  <div className="mt-1 text-xs text-gray-500">{r.subline}</div>
                </div>
                <div className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white tabular-nums">
                  {Math.round(r.match_score)}
                </div>
              </div>

              <div className="mt-3 text-sm text-gray-700">{r.reason}</div>

              <div className="mt-3 flex flex-wrap gap-2">
                {r.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <span className="rounded-xl bg-black px-3 py-2 text-xs font-medium text-white">
                  Save
                </span>
                <span className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800">
                  Details
                </span>
              </div>
            </button>
          );
        })}

        {!data && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            例文を押すか、自然言語で検索してみてください。
          </div>
        )}
      </div>

      {/* Selected preview (optional) */}
      {selected && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 text-sm">
          <div className="font-semibold">選択中</div>
          <div className="mt-1 text-gray-700">
            {selected.name}（{selected.area}）
          </div>
        </div>
      )}
    </div>
  );
}
