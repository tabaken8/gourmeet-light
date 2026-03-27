"use client";
// タイムラインの先頭に差し込む楽観的投稿カード
// DB insertが完了するまでの間、投稿者本人にだけ表示される

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { optimisticPost, type OptimisticPostData } from "@/lib/optimisticPost";

export default function OptimisticPostCard() {
  const router = useRouter();
  const [data, setData] = useState<OptimisticPostData | null>(() => optimisticPost.get());

  // ストアの変化を購読
  useEffect(() => {
    setData(optimisticPost.get());
    return optimisticPost.subscribe(() => setData(optimisticPost.get()));
  }, []);

  // insert完了（status: "done"）をストア経由で検知してタイムラインを更新
  // CustomEventと違い、マウント前にdoneになっていても確実に拾える
  useEffect(() => {
    const handleDone = () => {
      router.refresh();
      setTimeout(() => optimisticPost.clear(), 800);
    };

    // マウント時点で既にdoneだった場合（INSERT が超速だった場合）
    if (optimisticPost.get()?.status === "done") {
      handleDone();
      return;
    }

    // 購読して future の done を待つ
    return optimisticPost.subscribe(() => {
      if (optimisticPost.get()?.status === "done") {
        handleDone();
      }
    });
  }, [router]);

  if (!data) return null;

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
      {/* ステータスバッジ */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur-sm">
        {data.status === "saving" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
            <span className="text-slate-500">保存中…</span>
          </>
        ) : (
          <>
            <AlertCircle className="h-3 w-3 text-red-500" />
            <span className="text-red-500">保存に失敗しました</span>
          </>
        )}
      </div>

      {/* カバー画像 */}
      {data.coverSquareUrl && (
        <div className="aspect-square w-full overflow-hidden bg-slate-100">
          <img
            src={data.coverSquareUrl}
            alt={data.placeName}
            className="h-full w-full object-cover opacity-90"
          />
        </div>
      )}

      {/* テキスト情報 */}
      <div className="p-4">
        <div className="text-sm font-semibold text-slate-900">{data.placeName}</div>
        {data.placeAddress && (
          <div className="mt-0.5 text-xs text-slate-400">{data.placeAddress}</div>
        )}
        {data.content && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-700">
            {data.content}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
            ★ {data.recommendScore.toFixed(1)}
          </span>
          {data.status === "error" && (
            <button
              type="button"
              className="text-xs text-red-500 underline"
              onClick={() => optimisticPost.clear()}
            >
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
