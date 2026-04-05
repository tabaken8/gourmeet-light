"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

const LANG_OPTIONS = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
] as const;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("settings");

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-slate-400 dark:text-gray-500">
          <Globe size={18} />
        </span>
        <div className="text-[14px] font-medium text-slate-800 dark:text-gray-200">
          {t("language")}
        </div>
      </div>
      <select
        value={locale}
        onChange={handleChange}
        className="rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-white/[.06] px-3 py-1.5 text-[13px] text-slate-800 dark:text-gray-200 outline-none focus:border-orange-600 dark:focus:border-white/25"
      >
        {LANG_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
