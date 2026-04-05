"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useTranslations } from "next-intl";

export default function DarkModeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("settings");

  const options = [
    { value: "light" as const, icon: Sun, label: t("light") },
    { value: "dark" as const, icon: Moon, label: t("dark") },
    { value: "system" as const, icon: Monitor, label: t("system") },
  ];

  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 p-1">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={[
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition",
            theme === value
              ? "bg-white dark:bg-[#2a2d35] text-slate-900 dark:text-gray-100 shadow-sm"
              : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300",
          ].join(" ")}
          aria-pressed={theme === value}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}
