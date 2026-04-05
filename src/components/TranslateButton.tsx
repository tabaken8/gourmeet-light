// src/components/TranslateButton.tsx
"use client";

import { ReactNode, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";

/** Simple heuristic: detect dominant script in text */
function detectLang(text: string): string | null {
  let ja = 0, ko = 0, latin = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    // Hiragana / Katakana
    if ((cp >= 0x3040 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff)) { ja++; continue; }
    // CJK (shared, but if mixed with kana → ja)
    if (cp >= 0x4e00 && cp <= 0x9fff) { ja += 0.5; ko += 0.3; continue; }
    // Hangul
    if ((cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0x1100 && cp <= 0x11ff)) { ko++; continue; }
    // Latin letters
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) { latin++; continue; }
  }
  const total = ja + ko + latin;
  if (total === 0) return null;
  if (ja / total > 0.2) return "ja";
  if (ko / total > 0.2) return "ko";
  if (latin / total > 0.3) return "en";
  return null;
}

export default function TranslateButton({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("timeline");
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);

  const detectedLang = detectLang(text);
  // Hide button if the post is in the user's language
  const sameLanguage = detectedLang === locale;

  async function handleTranslate() {
    if (translated) {
      setShowTranslated((v) => !v);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target: locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Translation failed");
      setTranslated(data.translated);
      setShowTranslated(true);
    } catch (e: any) {
      setError(e?.message ?? "Translation failed");
    } finally {
      setLoading(false);
    }
  }

  if (!text?.trim() || sameLanguage) return <>{children}</>;

  return (
    <>
      {showTranslated && translated ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-gray-200 italic">
          {translated}
        </p>
      ) : (
        children
      )}

      <div className="mt-1.5">
        <button
          type="button"
          onClick={handleTranslate}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 transition"
        >
          <Languages size={13} />
          {loading
            ? t("translating")
            : showTranslated
            ? t("showOriginal")
            : t("translatePost")}
        </button>

        {error && (
          <p className="mt-1 text-[11px] text-red-500">{error}</p>
        )}
      </div>
    </>
  );
}
