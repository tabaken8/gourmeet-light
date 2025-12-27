"use client";

import React, { useState } from "react";

export default function BackfillPlacesGeoButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/admin/backfill-places-geo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onlyMissing: true, // 欠損だけ埋める
          limit: 5000,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? "unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className={[
            "rounded-xl px-4 py-2 text-sm font-extrabold",
            loading
              ? "bg-black/10 text-black/40 cursor-not-allowed"
              : "bg-black text-white hover:opacity-90",
          ].join(" ")}
        >
          {loading ? "埋め込み中…" : "places の lat/lng を埋める"}
        </button>

        <div className="text-xs text-slate-600">
          いまだけの管理ボタン（欠損のみ）
        </div>
      </div>

      {error ? (
        <div className="mt-3 text-sm font-semibold text-red-600">{error}</div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-xl bg-black/5 p-3 text-xs text-slate-800">
          <div>attempted: {result.attempted}</div>
          <div>fetched_ok: {result.fetched_ok}</div>
          <div>updated: {result.updated}</div>
          <div>failed_count: {result.failed_count}</div>
          {Array.isArray(result.failed) && result.failed.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-bold">failed (先頭)</summary>
              <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(result.failed, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
