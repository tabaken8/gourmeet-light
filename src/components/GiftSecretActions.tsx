"use client";

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

export default function GiftSecretActions({
  code,
  url,
}: {
  code?: string | null;
  url?: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((v) => (v === key ? null : v)), 1200);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {code ? (
        <button
          onClick={() => copyText(code, "code")}
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
        >
          <Copy size={16} />
          {copied === "code" ? "コピーしました" : "コードをコピー"}
        </button>
      ) : null}

      {url ? (
        <>
          <button
            onClick={() => copyText(url, "url")}
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
          >
            <Copy size={16} />
            {copied === "url" ? "コピーしました" : "リンクをコピー"}
          </button>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
          >
            <ExternalLink size={16} />
            リンクを開く
          </a>
        </>
      ) : null}
    </div>
  );
}
