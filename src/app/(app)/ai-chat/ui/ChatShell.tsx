// app/ai-chat/ui/ChatShell.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ThreadRow = {
  id: string;
  title: string | null;
  created_at: string | null;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: any;
  created_at?: string | null;
  isTyping?: boolean;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatJST(iso: string) {
  const dt = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

async function typeText(args: {
  text: string;
  speedMs?: number;
  onUpdate: (partial: string) => void;
  shouldStop: () => boolean;
}) {
  const { text, speedMs = 14, onUpdate, shouldStop } = args;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (shouldStop()) return;
    out += text[i];
    onUpdate(out);

    const ch = text[i];
    const extra =
      ch === "。" || ch === "！" || ch === "？" || ch === "\n"
        ? 120
        : ch === "、"
        ? 60
        : 0;

    await sleep(speedMs + extra);
  }
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-slate-500">
      考え中
      <span className="inline-block w-2 animate-pulse">.</span>
      <span className="inline-block w-2 animate-pulse [animation-delay:120ms]">.</span>
      <span className="inline-block w-2 animate-pulse [animation-delay:240ms]">.</span>
    </span>
  );
}

function EmptyStateCard() {
  return (
    <div className="gm-card p-5">
      <div className="text-sm font-semibold text-slate-900">こんにちは！</div>
      <div className="mt-2 text-xs text-slate-600">
        自然な言葉でOKです。場所や好み（雰囲気・予算など）を入れると、より精度が上がります。
      </div>
      <div className="mt-3 inline-flex flex-wrap gap-2">
        <span className="gm-chip px-3 py-1 text-[11px] text-slate-700">
          例：渋谷で落ち着いた居酒屋
        </span>
        <span className="gm-chip px-3 py-1 text-[11px] text-slate-700">
          例：名古屋で中華そば
        </span>
        <span className="gm-chip px-3 py-1 text-[11px] text-slate-700">
          例：吉祥寺でカフェ、作業しやすい
        </span>
      </div>
    </div>
  );
}

function IconHamburger({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4 6.5h16M4 12h16M4 17.5h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClose({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M6.5 6.5l11 11M17.5 6.5l-11 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AvatarBot({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/favicon.ico"
      alt="Gourmeet"
      width={size}
      height={size}
      className="rounded-full bg-white border border-black/[.08] shadow-sm"
    />
  );
}

function AvatarYou({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-black text-white border border-black/10 shadow-sm flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="text-[11px] font-semibold">You</span>
    </div>
  );
}

export default function ChatShell() {
  const router = useRouter();
  const sp = useSearchParams();

  const initialThreadFromUrl = (sp.get("thread_id") ?? "").trim() || null;

  const [threadId, setThreadId] = useState<string | null>(initialThreadFromUrl);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [isSending, setIsSending] = useState(false);

  const runTokenRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (smooth = true) => {
    const el = bottomRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  };

  async function loadThreads() {
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/ai/threads", { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "スレッドの取得に失敗しました。");
      setThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch {
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }

  async function loadThreadMessages(tid: string) {
    if (!tid) return;
    const res = await fetch(`/api/ai/chat?thread_id=${encodeURIComponent(tid)}`, {
      method: "GET",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "チャット履歴の取得に失敗しました。");

    const rows = Array.isArray(data.messages) ? data.messages : [];
    const restored: ChatMsg[] = rows
      .filter((r: any) => r?.role === "user" || r?.role === "assistant")
      .map((r: any) => ({
        id: String(r.id ?? uid()),
        role: r.role,
        content: typeof r.content === "string" ? r.content : "",
        meta: r.meta ?? null,
        created_at: r.created_at ?? null,
        isTyping: false,
      }));

    setMsgs(restored);
    requestAnimationFrame(() => scrollToBottom(false));
  }

  useEffect(() => {
    loadThreads();

    if (initialThreadFromUrl) {
      loadThreadMessages(initialThreadFromUrl).catch(() => {
        setThreadId(null);
        router.replace("/ai-chat");
        setMsgs([]);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tid = (sp.get("thread_id") ?? "").trim() || null;
    if (tid === threadId) return;
    if (isSending) return;

    setThreadId(tid);
    if (tid) {
      loadThreadMessages(tid).catch(() => {});
    } else {
      setMsgs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // ドロワーが開いてる間は背景スクロールを止める（モバイル）
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const activeThread = threads.find((t) => t.id === threadId) ?? null;
  const activeTitle = (activeThread?.title ?? "").trim() || "新しいチャット";

  async function selectThread(tid: string) {
    if (!tid) return;
    runTokenRef.current++;

    setDrawerOpen(false);
    setThreadId(tid);
    router.replace(`/ai-chat?thread_id=${encodeURIComponent(tid)}`);
    await loadThreadMessages(tid);
  }

  function startNewChat() {
    runTokenRef.current++;
    setDrawerOpen(false);
    setThreadId(null);
    setMsgs([]);
    router.replace("/ai-chat");
    requestAnimationFrame(() => scrollToBottom(false));
  }

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    setIsSending(true);

    const myToken = ++runTokenRef.current;

    const userMsg: ChatMsg = { id: uid(), role: "user", content: text };
    const assistantMsgId = uid();

    setMsgs((prev) => [
      ...prev,
      userMsg,
      { id: assistantMsgId, role: "assistant", content: "", isTyping: true },
    ]);

    requestAnimationFrame(() => scrollToBottom(true));

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, threadId, maxResults: 4 }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "AIの応答取得に失敗しました。");

      if (!threadId && data.thread_id) {
        setThreadId(data.thread_id);
        router.replace(`/ai-chat?thread_id=${encodeURIComponent(data.thread_id)}`);
      }

      const assistantText = [
        data?.understood?.summary ? String(data.understood.summary).trim() : "",
        typeof data?.assistant_message === "string" ? data.assistant_message.trim() : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      setMsgs((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, meta: data, isTyping: true, content: "" } : m
        )
      );

      requestAnimationFrame(() => scrollToBottom(true));

      await typeText({
        text: assistantText || "おすすめをまとめました！",
        onUpdate: (partial) => {
          if (runTokenRef.current !== myToken) return;
          setMsgs((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: partial } : m))
          );
          requestAnimationFrame(() => scrollToBottom(false));
        },
        shouldStop: () => runTokenRef.current !== myToken,
      });

      setMsgs((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, isTyping: false } : m)));

      if (!threadsLoading) loadThreads();
    } catch (e: any) {
      const errText = e?.message || "エラーが発生しました。";
      setMsgs((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, isTyping: false, content: `申し訳ありません。${errText}` }
            : m
        )
      );
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }

  // ✅ ここが超重要：外枠を overflow-hidden にして「ページスクロール」を封じる
  const frameCls =
    "h-[calc(100dvh-140px)] md:h-[calc(100dvh-170px)] overflow-hidden overscroll-none";

  const ThreadList = useMemo(() => {
    return (
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="text-[11px] font-medium text-slate-500 px-1">チャット</div>

        {threadsLoading ? (
          <div className="mt-3 text-xs text-slate-500 px-1">読み込み中...</div>
        ) : threads.length === 0 ? (
          <div className="mt-3 text-xs text-slate-500 px-1">まだスレッドがありません。</div>
        ) : (
          <div className="mt-2 space-y-2">
            {threads.map((t) => {
              const title = (t.title ?? "").trim() || "（無題）";
              const when = t.created_at ? formatJST(t.created_at) : "";
              const isActive = t.id === threadId;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectThread(t.id)}
                  className={[
                    "w-full text-left gm-press",
                    "rounded-2xl border border-black/[.06]",
                    isActive
                      ? "bg-white/95 shadow-[0_6px_22px_rgba(0,0,0,0.06)]"
                      : "bg-white/70 hover:bg-white/85",
                    "px-3 py-2",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <AvatarBot size={18} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{when}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }, [threads, threadsLoading, threadId]);

  return (
    <div className={["w-full", frameCls].join(" ")}>
      <div className="h-full md:gm-surface md:p-3">
        <div className="h-full min-h-0 grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-3">
          {/* ===== Desktop Sidebar ===== */}
          <aside className="hidden md:block h-full min-h-0">
            <div className="h-full min-h-0 gm-card p-3 flex flex-col">
              <button
                type="button"
                onClick={startNewChat}
                className="gm-chip gm-press w-full px-3 py-2 text-sm font-semibold text-slate-900 bg-white/80 hover:bg-white"
              >
                ＋ 新しいチャット
              </button>

              {ThreadList}

              <div className="mt-3 pt-3 border-t border-black/[.06]">
                <div className="text-[11px] text-slate-500">
                  ヒント：場所（駅名/エリア）＋ジャンル＋雰囲気 で精度が上がります。
                </div>
              </div>
            </div>
          </aside>

          {/* ===== Mobile Drawer ===== */}
          <div
            className={[
              "md:hidden fixed inset-0 z-[60]",
              drawerOpen ? "pointer-events-auto" : "pointer-events-none",
            ].join(" ")}
            aria-hidden={!drawerOpen}
          >
            {/* backdrop */}
            <div
              className={[
                "absolute inset-0 bg-black/35 transition-opacity duration-200",
                drawerOpen ? "opacity-100" : "opacity-0",
              ].join(" ")}
              onClick={() => setDrawerOpen(false)}
            />

            {/* panel */}
            <div
              className={[
                "absolute inset-0",
                "bg-[#fffaf5]",
                "transition-transform duration-250 ease-out",
                drawerOpen ? "translate-x-0" : "-translate-x-full",
              ].join(" ")}
              role="dialog"
              aria-modal="true"
            >
              <div className="h-full min-h-0 flex flex-col">
                <div className="px-4 py-4 border-b border-black/[.06] bg-white/80 backdrop-blur flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="gm-chip gm-press h-9 w-9 grid place-items-center bg-white/85"
                    aria-label="閉じる"
                  >
                    <IconClose className="h-5 w-5 text-slate-800" />
                  </button>

                  <div className="flex items-center gap-2 min-w-0">
                    <AvatarBot size={22} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">チャット履歴</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        過去の会話にすぐ戻れます
                      </div>
                    </div>
                  </div>

                  <span className="flex-1" />

                  <button
                    type="button"
                    onClick={startNewChat}
                    className="gm-chip gm-press px-3 py-2 text-[11px] font-semibold text-slate-900 bg-white/85"
                  >
                    新規
                  </button>
                </div>

                <div className="px-3 pt-3">
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="gm-card gm-press w-full px-4 py-3 text-sm font-semibold text-slate-900 text-left"
                  >
                    ＋ 新しいチャット
                  </button>
                </div>

                <div className="px-3 pb-3 flex-1 min-h-0 overflow-y-auto">
                  {/* list */}
                  <div className="mt-3">{ThreadList}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== Main Chat ===== */}
          <section className="h-full min-h-0 gm-card flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-black/[.06] bg-white/70 backdrop-blur">
              <div className="flex items-center gap-3">
                {/* Mobile hamburger */}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="md:hidden gm-chip gm-press h-9 w-9 grid place-items-center bg-white/80"
                  aria-label="チャット履歴を開く"
                >
                  <IconHamburger className="h-5 w-5 text-slate-800" />
                </button>

                {/* “相手”アイコン（favicon） */}
                <div className="flex items-center gap-2 min-w-0">
                  <AvatarBot size={26} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{activeTitle}</div>
                    <div className="mt-1 text-[11px] text-slate-500 truncate">
                      Gourmeet AI と会話中
                    </div>
                  </div>
                </div>

                <span className="flex-1" />

                <button
                  type="button"
                  onClick={startNewChat}
                  className="gm-chip gm-press px-3 py-2 text-[11px] font-semibold text-slate-900 bg-white/80"
                >
                  新規
                </button>
              </div>
            </div>

            {/* Messages (ONLY scroll here) */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 md:px-4 py-4">
              <div className="space-y-4">
                {msgs.length === 0 ? <EmptyStateCard /> : null}

                {msgs.map((m) => {
                  const isUser = m.role === "user";
                  return (
                    <div key={m.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                      {/* ChatGPT風：assistantは左にアイコン、userは右にアイコン */}
                      {!isUser ? (
                        <div className="mr-2 mt-1 shrink-0">
                          <AvatarBot />
                        </div>
                      ) : null}

                      <div
                        className={[
                          "max-w-[92%] md:max-w-[78%]",
                          isUser
                            ? "rounded-2xl bg-black text-white px-4 py-3 text-sm leading-relaxed"
                            : "gm-card px-4 py-3 text-sm leading-relaxed text-slate-900",
                        ].join(" ")}
                      >
                        {!isUser && m.isTyping && !m.content ? (
                          <ThinkingDots />
                        ) : (
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        )}

                        {!isUser && m.meta?.results?.length ? (
                          <div className="mt-4 space-y-3">
                            {m.meta.results.map((r: any) => (
                              <ResultCard key={r.place_id} r={r} />
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {isUser ? (
                        <div className="ml-2 mt-1 shrink-0">
                          <AvatarYou />
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <div ref={bottomRef} />
              </div>
            </div>

            {/* Composer: bottom-fixed INSIDE the chat card (never scrolls) */}
            <div className="shrink-0 border-t border-black/[.06] bg-white/80 backdrop-blur p-3">
              <div className="gm-card px-3 py-3">
                <div className="flex gap-2 items-end">
                  <textarea
                    className="min-h-[48px] max-h-[160px] flex-1 resize-none rounded-2xl border border-black/[.08] bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none focus:border-orange-400"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="例：名古屋で中華そば。落ち着いた雰囲気で、できれば駅近。"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <button
                    className="gm-press rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                    onClick={send}
                    disabled={isSending || !input.trim()}
                  >
                    送信
                  </button>
                </div>

                <div className="mt-2 text-center text-[11px] text-slate-500">
                  Enterで送信 / Shift+Enterで改行
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ r }: { r: any }) {
  const evidences = Array.isArray(r.evidence_posts) ? r.evidence_posts : [];
  const top = evidences[0] ?? null;

  return (
    <div className="gm-card p-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{r.headline}</div>
        <div className="mt-1 text-xs text-slate-500">{r.subline}</div>
        <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{r.reason}</div>
      </div>

      {top && (
        <div className="mt-4 rounded-2xl border border-black/[.06] bg-white/70 p-3">
          <div className="flex gap-3">
            {top.image_thumb_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={top.image_thumb_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-white" />
            )}

            <div className="min-w-0 flex-1">
              {top.author_display_name ? (
                <div className="flex items-center gap-2">
                  {top.author_avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={top.author_avatar_url}
                      alt=""
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-white" />
                  )}
                  <div className="text-xs font-semibold text-slate-900">{top.author_display_name}</div>
                </div>
              ) : null}

              <div className="mt-1 text-xs text-slate-700">
                {top.content && top.content.trim() ? top.content.trim() : ""}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-500">
                  {top.recommend_score != null ? `おすすめ ${top.recommend_score}/10` : null}
                  {top.price_yen != null ? ` / ¥${top.price_yen}` : null}
                  {top.price_range ? ` / ${top.price_range}` : null}
                </div>

                <a
                  href={top.post_url}
                  className="gm-press rounded-xl bg-black px-3 py-2 text-[11px] font-semibold text-white"
                >
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
                  className="block rounded-xl border border-black/[.06] bg-white/80 px-3 py-2 text-xs text-slate-800 hover:bg-white"
                >
                  {p.author_display_name ? `${p.author_display_name}：` : ""}
                  {p.content && p.content.trim() ? p.content.trim() : ""}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
