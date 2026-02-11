"use client";

import * as React from "react";

export default function XSwitch({
  checked,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-[46px] shrink-0 items-center rounded-full border transition-all",
        "focus:outline-none focus:ring-2 focus:ring-orange-300/60",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        checked
          ? "bg-orange-500 border-orange-500"
          : "bg-slate-200/80 border-slate-300",
      ].join(" ")}
    >
      {/* Track highlight (subtle depth like X) */}
      <span
        className={[
          "absolute inset-0 rounded-full",
          checked ? "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
        ].join(" ")}
      />

      {/* Knob */}
      <span
        className={[
          "relative inline-block h-5 w-5 rounded-full bg-white",
          "shadow-[0_1px_2px_rgba(0,0,0,0.22)]",
          "transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          checked ? "translate-x-[22px]" : "translate-x-[4px]",
        ].join(" ")}
      />
    </button>
  );
}
