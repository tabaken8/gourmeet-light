"use client";
// タイムラインの先頭に差し込む楽観的投稿カード
// DB insertが完了するまでの間、投稿者本人にだけ表示される
// タイムラインの通常カードと同じレイアウトに合わせる

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, MapPin } from "lucide-react";
import { optimisticPost, type OptimisticPostData } from "@/lib/optimisticPost";

function extractPrefCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const s = address
    .replace(/^日本[、,\s]*/u, "")
    .replace(/〒\s*\d{3}-?\d{4}\s*/u, "")
    .trim();
  const m = s.match(/(東京都|北海道|大阪府|京都府|.{2,3}県)([^0-9\s,、]{1,20}?(市|区|町|村))/u);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

export default function OptimisticPostCard() {
  const router = useRouter();
  const [data, setData] = useState<OptimisticPostData | null>(() => optimisticPost.get());

  // ストアの変化を購読
  useEffect(() => {
    setData(optimisticPost.get());
    return optimisticPost.subscribe(() => setData(optimisticPost.get()));
  }, []);

  // insert完了（status: "done"）をストア経由で検知してタイムラインを更新
  useEffect(() => {
    const handleDone = () => {
      router.refresh();
      setTimeout(() => optimisticPost.clear(), 800);
    };

    if (optimisticPost.get()?.status === "done") {
      handleDone();
      return;
    }

    return optimisticPost.subscribe(() => {
      if (optimisticPost.get()?.status === "done") {
        handleDone();
      }
    });
  }, [router]);

  if (!data) return null;

  const areaLabel = extractPrefCity(data.placeAddress);
  const isSaving = data.status === "saving";
  const isError = data.status === "error";

  return (
    <article className="gm-feed-divider">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="md:border-r md:border-black/[.05] dark:md:border-white/[.08]">
          {/* Header — 通常カードと同じレイアウト */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* avatar placeholder */}
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-orange-100 dark:bg-orange-900/30 text-[10px] font-semibold text-orange-700 dark:text-orange-400">
                ✓
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-gray-100">
                    {data.placeName}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-gray-500">·</span>
                  <span className="text-[11px] text-slate-400 dark:text-gray-500">たった今</span>
                </div>
                {areaLabel && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-gray-400 truncate">
                    <MapPin size={11} className="shrink-0 opacity-60" />
                    <span className="truncate">{areaLabel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ステータスバッジ */}
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
              {isSaving && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                  <span className="text-slate-500 dark:text-gray-400">保存中…</span>
                </>
              )}
              {isError && (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-red-500">保存に失敗しました</span>
                </>
              )}
            </div>
          </div>

          {/* Media — 通常カードと同じ aspect-square */}
          {data.coverSquareUrl && (
            <div className="block w-full aspect-square overflow-hidden bg-slate-100 dark:bg-[#1e2026]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.coverSquareUrl}
                alt={data.placeName}
                className={`h-full w-full object-cover ${isSaving ? "opacity-80" : ""}`}
              />
            </div>
          )}

          {/* Meta: score */}
          <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px]">
            <span className="font-medium text-slate-500 dark:text-gray-400">
              おすすめ {data.recommendScore.toFixed(1)}/10
            </span>
          </div>

          {/* Body */}
          {data.content && (
            <div className="px-3 pt-0.5 pb-2">
              <p className="whitespace-pre-wrap text-[12px] leading-snug text-slate-800 dark:text-gray-200 line-clamp-3">
                {data.content}
              </p>
            </div>
          )}

          {/* Error: retry / dismiss */}
          {isError && (
            <div className="px-3 pb-3 flex items-center gap-3">
              <button
                type="button"
                className="text-xs text-red-500 underline"
                onClick={() => optimisticPost.clear()}
              >
                閉じる
              </button>
              <span className="text-[11px] text-slate-400 dark:text-gray-500">
                下書きに保存されています
              </span>
            </div>
          )}
        </div>

        {/* Right panel (PC) — 保存中はプレースホルダ */}
        <aside className="hidden md:flex md:items-center md:justify-center p-4">
          {isSaving && (
            <div className="text-xs text-slate-400 dark:text-gray-500">保存中…</div>
          )}
        </aside>
      </div>
    </article>
  );
}
