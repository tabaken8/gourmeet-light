"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import TopLoader from "./TopLoader";

export default function TopLoaderProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  // route change "end" 判定：path or query が変わったら止める
  useEffect(() => {
    setActive(false);
  }, [pathname, searchParams]);

  // route change "start" 判定：Linkクリック時に開始（全体で拾う）
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest("a");
      if (!a) return;

      // 新規タブ/外部リンク/同一ページhash等は除外
      const href = a.getAttribute("href") || "";
      const isExternal = href.startsWith("http");
      const isHash = href.startsWith("#");
      const newTab = a.getAttribute("target") === "_blank";
      const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

      if (isExternal || isHash || newTab || modified) return;

      setActive(true);
    };

    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  return <TopLoader active={active} color="#f97316" height={2} />;
}
