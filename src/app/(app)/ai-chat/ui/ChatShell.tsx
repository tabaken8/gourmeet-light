// app/ai-chat/ui/ChatShell.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Thread = {
  id: string;
  title: string | null;
  created_at: string | null;
};

type MsgRow = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  meta: any | null;
  created_at: string;
};

type EvidencePost = {
  post_id: string;
  post_url: string;
  created_at: string | null;
  content: string | null;
  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;
  image_thumb_url: string | null;

  author_display_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;

  is_following_author: boolean;
};

type ApiResult = {
  place_id: string;
  headline: string;
  subline: string;
  reason: string;
  match_score: number;

  primary_genre: string | null;
  genre_tags: string[] | null;
  distance_km: number | null;

  evidence_posts: EvidencePost[];
};

function fmtTime(ts?: string | null) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function clip(s: string, n = 140) {
  const t = (s ?? "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n) + "…";
}

export default function ChatShell() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  }

  async function loadThreads() {
    setLoadingThreads(true);
    try {
      const res = await fetch("/api/ai/threads", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setThreads(json.threads ?? []);
      if (!activeThreadId && (json.threads?.[0]?.id ?? null)) {
        setActiveThreadId(json.threads[0].id);
      }
    } catch {
      // noop
    } finally {
      setLoadingThreads(false);
    }
  }

  async function createNewThread() {
    try {
      const res = await fetch("/api/ai/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      const t: Thread = json.thread;
      setThreads((prev) => [t, ...prev]);
      setActiveThreadId(t.id);
      setMessages([]);
      setInput("");
    } catch {
      // noop
    }
  }

  async function loadMessages(threadId: string) {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/ai/chat?thread_id=${encodeURIComponent(threadId)}`, { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setMessages(json.messages ?? []);
      requestAnimationFrame(scrollToBottom);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    loadMessages(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  const activeTitle = useMemo(() => {
    const t = threads.find((x) => x.id === activeThreadId);
    return t?.title?.trim() || "新しいチャット";
  }, [threads, activeThreadId]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    if (!activeThreadId) {
      await createNewThread();
      // createNewThread が setActiveThreadId するので、次レンダで送るより “今” 送る方が楽：
      // ただ race を避けたいので、ここはワンテンポ遅らせる
      setTimeout(sendMessage, 0);
      return;
    }

    setSending(true);

    // optimistic user bubble
    const tempId = `tmp_${Date.now()}`;
    const optimistic: MsgRow = {
      id: tempId,
      role: "user",
      content: text,
      meta: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    requestAnimationFrame(scrollToBottom);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, message: text, maxResults: 4 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      // 直後にGETで整合取る（DBのid/created_atが欲しいので）
      await loadThreads();
      await loadMessages(json.thread_id);
    } catch {
      // rollback-ish: keep optimistic but add error assistant
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: "ごめん、いま回答が作れなかった。もう一回送ってみて。",
          meta: null,
          created_at: new Date().toISOString(),
        },
      ]);
      requestAnimationFrame(scrollToBottom);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-[calc(100vh-0px)] w-full bg-white">
      <div className="mx-auto flex h-full w-full max-w-6xl gap-0 border-x border-gray-100">
        {/* Sidebar */}
        <aside className="hidden w-[320px] shrink-0 border-r border-gray-100 bg-gray-50 md:flex md:flex-col">
          <div className="flex items-center justify-between gap-2 p-4">
            <div className="text-sm font-semibold">AIチャット</div>
            <button
              onClick={createNewThread}
              className="rounded-full bg-black px-3 py-2 text-xs font-medium text-white"
            >
              + 新規
            </button>
          </div>

          <div className="px-4 pb-2 text-xs text-gray-500">
            {loadingThreads ? "読み込み中…" : `${threads.length} 件`}
          </div>

          <div className="flex-1 overflow-auto p-2">
            {threads.map((t) => {
              const active = t.id === activeThreadId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveThreadId(t.id)}
                  className={[
                    "w-full rounded-xl px-3 py-3 text-left",
                    active ? "bg-white shadow-sm" : "hover:bg-white/70",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium text-gray-900">
                    {t.title?.trim() || "新しいチャット"}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">{fmtTime(t.created_at)}</div>
                </button>
              );
            })}

            {threads.length === 0 && !loadingThreads && (
              <div className="p-4 text-sm text-gray-500">まだチャットがありません</div>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{activeTitle}</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {loadingMessages ? "履歴を読み込み中…" : "投稿を根拠におすすめを返します"}
              </div>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={createNewThread}
                className="rounded-full bg-black px-3 py-2 text-xs font-medium text-white"
              >
                + 新規
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-4 py-4">
            <div className="mx-auto w-full max-w-2xl space-y-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 bg-white px-4 py-3">
            <div className="mx-auto flex w-full max-w-2xl gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="例：静かでデート向き、渋谷か恵比寿。ワインあると嬉しい。"
                className="w-full rounded-full border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                className="shrink-0 rounded-full bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {sending ? "…" : "送信"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: MsgRow }) {
  const isUser = msg.role === "user";
  const meta = msg.meta ?? null;

  const results: ApiResult[] | null = Array.isArray(meta?.results) ? (meta.results as ApiResult[]) : null;
  const understoodSummary = typeof meta?.understood?.summary === "string" ? meta.understood.summary : null;
  const assistantMessage = typeof meta?.assistant_message === "string" ? meta.assistant_message : null;

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-black text-white" : "bg-gray-100 text-gray-900",
        ].join(" ")}
      >
        {/* plain text */}
        {msg.content?.trim() ? <div className="whitespace-pre-wrap">{msg.content}</div> : null}

        {/* assistant meta rendering */}
        {!isUser && (understoodSummary || assistantMessage || results) && (
          <div className="mt-3 space-y-3">
            {understoodSummary && (
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800">
                {understoodSummary}
              </div>
            )}

            {assistantMessage && (
              <div className="text-xs text-gray-700">{assistantMessage}</div>
            )}

            {Array.isArray(results) && results.length > 0 && (
              <div className="space-y-3">
                {results.map((r) => (
                  <ResultCard key={r.place_id} r={r} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// app/ai-chat/ui/ChatShell.tsx
// ※ファイル全体は前回版でOK。差分として ResultCard の作者表示部分だけ置き換えてください。

// ...（中略）...

function ResultCard({ r }: { r: any }) {
  const evidences = Array.isArray(r.evidence_posts) ? r.evidence_posts : [];
  const top = evidences[0] ?? null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900">{r.headline}</div>
        <div className="mt-1 text-xs text-gray-500">{r.subline}</div>
        <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{r.reason}</div>
      </div>

      {top && (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex gap-3">
            {top.image_thumb_url ? (
              <img src={top.image_thumb_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-white" />
            )}

            <div className="min-w-0 flex-1">
              {/* ✅ ここが変更点：フォロー関係に関係なく表示する（自分はAPI側で除外済み） */}
              {top.author_display_name ? (
                <div className="flex items-center gap-2">
                  {top.author_avatar_url ? (
                    <img src={top.author_avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-white" />
                  )}
                  <div className="text-xs font-medium text-gray-900">{top.author_display_name}</div>
                </div>
              ) : null}

              <div className="mt-1 text-xs text-gray-700">
                {top.content && top.content.trim() ? top.content.trim() : "（コメントなし）"}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-[11px] text-gray-500">
                  {top.recommend_score != null ? `おすすめ ${top.recommend_score}/10` : null}
                  {top.price_yen != null ? ` / ¥${top.price_yen}` : null}
                  {top.price_range ? ` / ${top.price_range}` : null}
                </div>

                <a href={top.post_url} className="rounded-xl bg-black px-3 py-2 text-[11px] font-medium text-white">
                  投稿を見る
                </a>
              </div>
            </div>
          </div>

          {evidences.length > 1 && (
            <div className="mt-3 space-y-2">
              {evidences.slice(1).map((p: any) => (
                <a
                  key={p.post_id}
                  href={p.post_url}
                  className="block rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 hover:bg-gray-50"
                >
                  {p.author_display_name ? `${p.author_display_name}：` : ""}
                  {p.content && p.content.trim() ? p.content.trim() : "（コメントなし）"}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
