// src/components/TranslateButton.tsx
"use client";

import { ReactNode, useState } from "react";
import { Languages } from "lucide-react";

export default function TranslateButton({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);

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
        body: JSON.stringify({ text, target: "en" }),
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

  if (!text?.trim()) return <>{children}</>;

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
            ? "Translating…"
            : showTranslated
            ? "Show original"
            : "Translate post"}
        </button>

        {error && (
          <p className="mt-1 text-[11px] text-red-500">{error}</p>
        )}
      </div>
    </>
  );
}
