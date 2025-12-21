"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCcw, Link2, Share2 } from "lucide-react";

type InviteCodeItem = {
  id: string;
  code: string;
  created_at: string;
  uses: number;
  max_uses: number;
  expires_at: string | null;
  redeemed_at: string | null;
};

function fmt(d: string) {
  const dt = new Date(d);
  return dt.toLocaleString("ja-JP");
}

/**
 * APIの返り値が以下いずれでも耐えるための正規化
 * - { items: InviteCodeItem[] }
 * - { item: InviteCodeItem }
 * - { current: InviteCodeItem | null }
 */
function normalizeItems(json: any): InviteCodeItem[] {
  const itemsFromItems = Array.isArray(json?.items) ? json.items : null;
  const single = json?.item ?? json?.current ?? null;

  let items: any[] = [];
  if (itemsFromItems) items = itemsFromItems;
  else if (single) items = [single];

  // undefined混入・型崩れを除去
  return items.filter(
    (x): x is InviteCodeItem =>
      !!x &&
      typeof x.id === "string" &&
      typeof x.code === "string" &&
      typeof x.created_at === "string"
  );
}

function buildInviteUrl(code: string) {
  // client componentなので window は使える想定（念のためガード）
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || "";
  return `${origin}/auth/signup?invite=${encodeURIComponent(code)}`;
}

export default function InviteCodeSection() {
  const [items, setItems] = useState<InviteCodeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const latest = useMemo(() => items?.[0] ?? null, [items]);

  async function reload() {
    setErr(null);
    try {
      const res = await fetch("/api/invite-codes", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? "Failed to load");
        setItems([]);
        return;
      }
      setItems(normalizeItems(json));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
      setItems([]);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function issue() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/invite-codes", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to issue");

      // item / current のどちらでも拾う
      const newItem: InviteCodeItem | null = (json?.item ?? json?.current) ?? null;

      if (!newItem || typeof newItem.code !== "string") {
        await reload();
        return;
      }

      setItems((prev) => {
        const filteredPrev = prev.filter((x) => x && typeof x.code === "string");
        const dedup = filteredPrev.filter((x) => x.id !== newItem.id);
        return [newItem, ...dedup];
      });
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string, kind?: "code" | "url") {
    await navigator.clipboard.writeText(text);

    if (kind === "url") {
      setCopiedUrl(text);
      window.setTimeout(() => setCopiedUrl((v) => (v === text ? null : v)), 1200);
      return;
    }

    setCopied(text);
    window.setTimeout(() => setCopied((v) => (v === text ? null : v)), 1200);
  }

  async function shareInvite(code: string) {
    const url = buildInviteUrl(code);

    // Web Share API（スマホで最強）
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as any).share({
          title: "Gourmeet 招待",
          text: "招待リンクから登録してね",
          url,
        });
        return;
      } catch {
        // キャンセル等は無視してOK
      }
    }

    // share不可ならURLコピーにフォールバック
    await copyText(url, "url");
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">招待コード</div>
          <div className="text-sm text-gray-500">友だちに共有して登録してもらう用</div>
        </div>

        <button
          onClick={issue}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          <RefreshCcw size={16} />
          発行する
        </button>
      </div>

      {err && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {latest && (
        <div className="mt-4 rounded-2xl border p-4">
          <div className="text-sm text-gray-500">最新のコード</div>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-mono text-xl tracking-widest">{latest.code}</div>

            {/* ✅ ボタン群（コードコピー / リンクコピー / 共有） */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => copyText(latest.code, "code")}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                title="招待コードをコピー"
              >
                <Copy size={16} />
                {copied === latest.code ? "コピーしました" : "コード"}
              </button>

              <button
                onClick={() => copyText(buildInviteUrl(latest.code), "url")}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                title="招待リンクをコピー"
              >
                <Link2 size={16} />
                {copiedUrl === buildInviteUrl(latest.code) ? "コピーしました" : "リンク"}
              </button>

              <button
                onClick={() => shareInvite(latest.code)}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                title="共有"
              >
                <Share2 size={16} />
                共有
              </button>
            </div>
          </div>

          {/* ✅ 生成されたリンクを軽く見せる（長いので折り返し） */}
          <div className="mt-3 rounded-xl bg-black/[.03] p-3">
            <div className="text-xs text-gray-500">招待リンク</div>
            <div className="mt-1 break-all text-xs text-gray-700">
              {buildInviteUrl(latest.code)}
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            発行: {fmt(latest.created_at)}
            {latest.expires_at ? ` / 期限: ${fmt(latest.expires_at)}` : ""}
            {" / "}
            {latest.uses}/{latest.max_uses} 回使用
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm font-medium">発行履歴</div>
        <button onClick={reload} className="text-sm text-gray-600 underline">
          更新
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-gray-500">まだ招待コードがありません。</div>
        ) : (
          items
            .filter((it) => it && typeof it.code === "string")
            .map((it) => {
              const url = buildInviteUrl(it.code);
              return (
                <div
                  key={it.id}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono tracking-widest">{it.code}</div>
                    <div className="text-xs text-gray-500">
                      {fmt(it.created_at)} / {it.uses}/{it.max_uses} 回
                      {it.redeemed_at ? " / 使用済み" : ""}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => copyText(it.code, "code")}
                      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                      title="コードをコピー"
                    >
                      <Copy size={16} />
                      {copied === it.code ? "OK" : "コード"}
                    </button>

                    <button
                      onClick={() => copyText(url, "url")}
                      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                      title="リンクをコピー"
                    >
                      <Link2 size={16} />
                      {copiedUrl === url ? "OK" : "リンク"}
                    </button>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
