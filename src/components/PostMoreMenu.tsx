// src/components/PostMoreMenu.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Trash2, ExternalLink, Pencil } from "lucide-react";

type Props = {
  postId: string;
  isMine: boolean; // 本人かどうか
  className?: string;
  goTo?: string; // 例: `/posts/${postId}`
};

export default function PostMoreMenu({ postId, isMine, className, goTo }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const to = goTo ?? `/posts/${postId}`;
  const editTo = `/posts/${postId}/edit`;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

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
            <form action={`/posts/${postId}/delete`} method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={(e) => {
                  if (!confirm("この投稿を削除します。よろしいですか？")) {
                    e.preventDefault();
                    return;
                  }
                  setOpen(false);
                }}
              >
                <Trash2 size={16} /> 削除する
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
