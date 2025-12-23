"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ClipboardPaste } from "lucide-react";

function normalizeInvite(raw: string) {
  return (raw || "").trim().replace(/\s+/g, "").toUpperCase();
}

function fmt(d: string) {
  try {
    return new Date(d).toLocaleString("ja-JP");
  } catch {
    return d;
  }
}

type CurrentReserved = {
  code: string;
  reserved_at: string | null;
  reserved_until: string | null;
  created_by: string | null;
} | null;

export default function ApplyInviteSection() {
  const [invite, setInvite] = useState("");
  const [current, setCurrent] = useState<CurrentReserved>(null);
  const [loading, setLoading] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const normalized = useMemo(() => normalizeInvite(invite), [invite]);

  async function reload(): Promise<CurrentReserved> {
    setErr(null);
    try {
      const res = await fetch("/api/invites/reserve", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? "Failed to load");
        return null;
      }
      const cur = (json?.current ?? null) as CurrentReserved;
      setCurrent(cur);
      return cur;
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
      return null;
    }
  }

  useEffect(() => {
    reload();

    const fromLs =
      typeof window !== "undefined"
        ? normalizeInvite(localStorage.getItem("pending_invite") || "")
        : "";
    if (fromLs && !normalizeInvite(invite)) setInvite(fromLs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pasteFromClipboard() {
    setErr(null);
    setMsg(null);
    setPasting(true);
    try {
      if (!navigator.clipboard?.readText) {
        setMsg("このブラウザでは貼り付けが使えません。手入力してください。");
        return;
      }
      const text = await navigator.clipboard.readText();
      const v = normalizeInvite(text);
      if (!v) {
        setMsg("クリップボードに招待コードが見つかりませんでした。");
        return;
      }
      setInvite(v);
      localStorage.setItem("pending_invite", v);
      setMsg("貼り付けました。");
      window.setTimeout(() => setMsg(null), 1200);
    } catch {
      setMsg("貼り付けに失敗しました。手入力してください。");
    } finally {
      setPasting(false);
    }
  }

  async function applyInvite() {
    const v = normalizeInvite(invite);
    if (!v) {
      setErr("招待コードを入力してください。");
      return;
    }

    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/invites/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: v }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(json?.error ?? "Failed");
        return;
      }

      const r = json?.result;

      if (!r?.ok) {
        const m = String(r?.message ?? "failed");

        if (m === "code_unavailable") {
          const cur = await reload();
          if (cur?.code && normalizeInvite(cur.code) === v) {
            localStorage.setItem("pending_invite", v);
            setErr(null);
            setMsg("すでに適用されています。");
            window.setTimeout(() => setMsg(null), 2000);
            return;
          }
        }

        const map: Record<string, string> = {
          expired_window: "登録から24時間を過ぎています（招待コードは適用できません）。",
          already_posted: "すでに投稿済みのため、招待コードは適用できません。",
          code_unavailable: "この招待コードは利用できません（使用済み/期限切れ/予約中の可能性）。",
          empty_code: "招待コードが空です。",
          not_authenticated: "ログインしてください。",
        };
        setErr(map[m] ?? `適用できませんでした: ${m}`);
        return;
      }

      localStorage.setItem("pending_invite", v);
      setMsg("招待コードを適用しました。初回投稿で招待ボーナスが確定します。");
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-bold">招待コードの適用</div>
          <div className="mt-1 text-sm text-gray-600">
            アカウント作成後 <span className="font-semibold">24時間以内</span> かつ{" "}
            <span className="font-semibold">未投稿</span> の場合のみ適用できます。
          </div>
        </div>

        <button
          type="button"
          onClick={() => reload()}
          className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold hover:bg-black/[.03]"
        >
          更新
        </button>
      </div>

      {err && <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {msg && (
        <div className="mt-3 rounded-2xl bg-black/[.03] p-3 text-sm text-gray-800">{msg}</div>
      )}

      <div className="mt-4 rounded-2xl border border-black/10 bg-black/[.02] p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">現在の状態</div>

        {current?.code ? (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800">適用中</div>
                <div className="mt-1 break-all font-mono text-lg tracking-widest">{current.code}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {current.reserved_until ? `有効期限: ${fmt(current.reserved_until)}` : ""}
                </div>
              </div>

              <button
                type="button"
                onClick={() => copy(current.code)}
                className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold hover:bg-black/[.03]"
              >
                <Copy className="mr-2 inline-block h-4 w-4" />
                {copied ? "コピーしました" : "コピー"}
              </button>
            </div>

            <p className="mt-2 text-xs text-gray-600">※ 初回投稿が完了した時点で、招待ボーナスが確定します。</p>
          </div>
        ) : (
          <div className="mt-2 text-sm text-gray-700">招待コードはまだ適用されていません。</div>
        )}
      </div>

      <div className="mt-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">招待コードを入力</span>
          <div className="flex gap-2">
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="例: ABCDEFGH12"
              autoComplete="off"
              inputMode="text"
              className="w-full rounded-xl border border-black/10 px-3 py-2 font-mono tracking-widest outline-none focus:border-orange-600"
            />
            <button
              type="button"
              onClick={pasteFromClipboard}
              disabled={pasting}
              className="shrink-0 rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold hover:bg-black/[.03] disabled:opacity-50"
              title="クリップボードから貼り付け"
            >
              <ClipboardPaste className="mr-1 inline-block h-4 w-4" />
              {pasting ? "…" : "貼り付け"}
            </button>
          </div>
        </label>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-600">入力は任意です。登録から24時間を過ぎると適用できません。</p>

          <button
            type="button"
            onClick={applyInvite}
            disabled={loading || !normalized}
            className={[
              "shrink-0 rounded-full px-5 py-2 text-sm font-semibold text-white transition",
              loading || !normalized
                ? "cursor-not-allowed bg-orange-700/60"
                : "bg-orange-700 hover:bg-orange-800",
            ].join(" ")}
          >
            {loading ? "適用中..." : "適用する"}
          </button>
        </div>
      </div>
    </section>
  );
}
