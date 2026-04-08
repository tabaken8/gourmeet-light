"use client";

import { useEffect } from "react";

export default function SplashHide() {
  useEffect(() => {
    (window as any).__gmHideSplash?.();
  }, []);
  return null;
}
