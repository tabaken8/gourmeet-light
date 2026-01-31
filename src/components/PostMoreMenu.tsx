// src/components/PostMoreMenu.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2, ExternalLink, Pencil } from "lucide-react";

type Props = {
  postId: string;
  isMine: boolean;
  className?: string;
  goTo?: string; // 例: `/posts/${postId}`
  afterDeleteTo?: string; // 例: "/timeline"
};

export default function PostMoreMenu({ postId, isMine, className, goTo, afterDeleteTo }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const to = goTo ?? `/posts/${postId}`;
  const editTo = `/posts/${postId}/edit`;

  // ✅ Undo 用 state
  const [pending, setPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  const commitTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    };
  }, []);

  function startPendingDelete(windowSeconds = 5) {
    // 既に開始中なら無視
    if (pending || busy) return;

    setPending(true);
    setSecondsLeft(windowSeconds);

    // 1秒ごとに減らす
    tickTimerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    // windowSeconds 後に実削除
    commitTimerRef.current = window.setTimeout(() => {
      commitDelete().catch(() => {
        // commitDelete 内で alert するのでここは空でOK
      });
    }, windowSeconds * 1000);
  }

  function cancelPendingDelete() {
    if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    commitTimerRef.current = null;
    tickTimerRef.current = null;

    setPending(false);
    setSecondsLeft(0);
  }

  async function commitDelete() {
    // タイマー停止（重複防止）
    if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    commitTimerRef.current = null;
    tickTimerRef.current = null;

    setBusy(true);
    try {
      const res = await fetch(`/posts/${postId}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Delete failed (${res.status})`);
      }

      setPending(false);
      setSecondsLeft(0);

      router.push(afterDeleteTo ?? "/timeline");
      router.refresh();
    } catch (e: any) {
      setPending(false);
      setSecondsLeft(0);
      alert(e?.message ?? "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-full p-1.5 hover:bg-black/5"
      >
        <MoreHorizontal size={22} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border bg-white shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={to}
            className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-black/5"
            onClick={() => setOpen(false)}
          >
            <ExternalLink size={16} /> 投稿へ移動
          </Link>

          {isMine && (
            <Link
              href={editTo}
              className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-black/5"
              onClick={() => setOpen(false)}
            >
              <Pencil size={16} /> 編集する
            </Link>
          )}

          {isMine && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                if (busy || pending) return;

                if (!confirm("この投稿を削除します。よろしいですか？")) return;

                setOpen(false);
                // ✅ ここで「削除しました」モーダルを出し、実削除は遅延
                startPendingDelete(5);
              }}
            >
              <Trash2 size={16} /> 削除する
            </button>
          )}
        </div>
      )}

      {/* ✅ Undo モーダル */}
      {pending && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/30 p-4"
          onClick={cancelPendingDelete} // 背景クリックで取り消し
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-bold text-slate-900">削除しました</div>
            <div className="mt-1 text-xs text-slate-500">
              {secondsLeft}秒以内なら取り消せます（時間切れで確定します）
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelPendingDelete}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                取り消す
              </button>
              <button
                type="button"
                onClick={commitDelete}
                disabled={busy}
                className={[
                  "rounded-xl px-3 py-2 text-sm font-semibold text-white",
                  busy ? "bg-slate-300" : "bg-orange-600 hover:bg-orange-700",
                ].join(" ")}
              >
                今すぐ確定
              </button>
            </div>

            <div className="mt-3 text-[11px] text-slate-400">※背景クリックでも取り消せます</div>
          </div>
        </div>
      )}
    </div>
  );
}
