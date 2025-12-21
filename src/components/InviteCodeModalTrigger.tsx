"use client";

import { useEffect, useState } from "react";
import { X, Ticket } from "lucide-react";
import InviteCodeSection from "@/components/InviteCodeSection";

export default function InviteCodeModalTrigger() {
  const [open, setOpen] = useState(false);

  // Escで閉じる
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // モーダル中は背面スクロール抑制
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-black/[.03]"
        title="招待コードを確認"
      >
        <Ticket size={14} />
        招待コード
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]">
          {/* overlay */}
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />

          {/* modal */}
          <div className="absolute left-1/2 top-1/2 w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2">
            <div className="rounded-2xl border border-black/10 bg-white shadow-[0_20px_80px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                <div className="text-sm font-bold">招待コード</div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/[.05]"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4">
                {/* 既存ロジック・文言をそのまま利用 */}
                <InviteCodeSection />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
