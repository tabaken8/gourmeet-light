"use client";

import React, { useEffect, useRef, useState } from "react";

type Props = {
  /** 表示したいとき true */
  active: boolean;
  /** 色 (tailwind色でもOKだがここはCSSで直指定) */
  color?: string; // default: "#f97316" (orange-500)
  /** 高さpx */
  height?: number; // default: 2
};

export default function TopLoader({ active, color = "#f97316", height = 2 }: Props) {
  const [visible, setVisible] = useState(false);
  const [pct, setPct] = useState(0);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    // start
    if (active) {
      setVisible(true);
      setPct(0);

      const tick = () => {
        // 0→90% までスーッと進む（インスタ風の“終わりは確定まで待つ”）
        setPct((p) => {
          const cap = 90;
          if (p >= cap) return p;
          // 進むほど遅くなる
          const delta = Math.max(0.3, (cap - p) * 0.02);
          return Math.min(cap, p + delta);
        });
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    // finish
    if (!active && visible) {
      // 100%にしてからフェードアウト
      setPct(100);
      const t1 = window.setTimeout(() => {
        setVisible(false);
        setPct(0);
      }, 250);
      return () => window.clearTimeout(t1);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 top-0 z-[9999] w-full"
      style={{ height }}
    >
      <div
        className="h-full"
        style={{
          width: `${pct}%`,
          background: color,
          transition: active ? "none" : "width 200ms ease-out",
          boxShadow: "0 0 10px rgba(249,115,22,0.35)",
        }}
      />
    </div>
  );
}
