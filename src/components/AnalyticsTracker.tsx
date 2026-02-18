// src/components/AnalyticsTracker.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics/track";

const TICK_MS = 5000;        // 5秒ごとに積分
const IDLE_MS = 60_000;      // 60秒無操作で“非アクティブ扱い”
const FLUSH_MIN_MS = 3000;   // 3秒未満は捨てる（ノイズ削減）

export default function AnalyticsTracker() {
  const pathname = usePathname();

  const mountedAtRef = useRef<number>(Date.now());
  const lastTickRef = useRef<number>(Date.now());
  const lastActivityRef = useRef<number>(Date.now());
  const activeMsRef = useRef<number>(0);

  // 画面表示（route change）で screen_view を送る
  useEffect(() => {
    mountedAtRef.current = Date.now();
    lastTickRef.current = Date.now();
    lastActivityRef.current = Date.now();
    activeMsRef.current = 0;

    trackEvent({
      name: "screen_view",
      pathname,
      props: { ts: new Date().toISOString() },
    }).catch(() => {});

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ユーザー操作を拾って “最近操作した” を更新
  useEffect(() => {
    const mark = () => (lastActivityRef.current = Date.now());

    const events: (keyof WindowEventMap)[] = [
      "click",
      "keydown",
      "wheel",
      "mousemove",
      "pointerdown",
      "pointermove",
      "touchstart",
      "touchmove",
      "scroll",
    ];

    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  // 定期的に “visible かつ idleでない” なら滞在時間を加算
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      const visible = document.visibilityState === "visible";
      const idle = now - lastActivityRef.current > IDLE_MS;

      if (visible && !idle) activeMsRef.current += dt;
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  // 画面離脱/タブ非表示などで flush
  useEffect(() => {
    const flush = () => {
      const active_ms = activeMsRef.current;

      // ノイズ除去
      if (active_ms < FLUSH_MIN_MS) return;

      trackEvent({
        name: "screen_dwell",
        pathname,
        props: {
          active_ms,
          idle_ms: Math.max(0, Date.now() - lastActivityRef.current),
          mounted_ms: Date.now() - mountedAtRef.current,
        },
      }).catch(() => {});
    };

    const onVis = () => {
      // hidden になるタイミングは大事（放置で水増ししない）
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush(); // route change/unmount時にも最後に送る
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
