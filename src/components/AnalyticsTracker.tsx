// src/components/AnalyticsTracker.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics/track";

const TICK_MS = 5000;
const IDLE_MS = 60_000;
const FLUSH_MIN_MS = 3000;

export default function AnalyticsTracker() {
  const pathname = usePathname();

  const prevPathnameRef = useRef<string | null>(null); // ★追加

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

    const from_pathname = prevPathnameRef.current; // ★追加

    trackEvent({
      name: "screen_view",
      pathname,
      props: {
        ts: new Date().toISOString(),
        from_pathname, // ★追加：直前の画面
      },
    }).catch(() => {});

    // ★追加：送信後に「直前」を更新
    prevPathnameRef.current = pathname;

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
      if (active_ms < FLUSH_MIN_MS) return;

      trackEvent({
        name: "screen_dwell",
        pathname,
        props: {
          active_ms,
          idle_ms: Math.max(0, Date.now() - lastActivityRef.current),
          mounted_ms: Date.now() - mountedAtRef.current,
          // （任意）dwell側にも from_pathname を入れたいならここに入れてもOK
        },
      }).catch(() => {});
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
