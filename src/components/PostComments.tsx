"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type ProfileLite = {
  display_name: string | null;
  avatar_url: string | null;
};

// ✅ Supabase join は環境/リレーション次第で
// profiles: {..} | {..}[] | null のどれでも来うるので raw は広く受ける
type CommentRowRaw = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  reply_to_comment_id: string | null;
  reply_to_user_id: string | null;
  profiles?: ProfileLite | ProfileLite[] | null;
};

// ✅ UIでは常に「単体 or null」に揃える（ここが頑健）
type CommentRow = Omit<CommentRowRaw, "profiles"> & {
  profiles?: ProfileLite | null;
};

type Props = {
  postId: string;
  postUserId: string;
  meId: string | null;
};

function formatJST(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function normalizeProfile(p: CommentRowRaw["profiles"]): ProfileLite | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  // object
  return p;
}

function normalizeComments(rows: CommentRowRaw[]): CommentRow[] {
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    post_id: String(r.post_id),
    user_id: String(r.user_id),
    body: String(r.body ?? ""),
    created_at: String(r.created_at),
    reply_to_comment_id: (r.reply_to_comment_id ?? null) as string | null,
    reply_to_user_id: (r.reply_to_user_id ?? null) as string | null,
    profiles: normalizeProfile(r.profiles),
  }));
}

export default function PostComments({ postId, postUserId, meId }: Props) {
  const supabase = createClientComponentClient();

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [replyTo, setReplyTo] = useState<{
    commentId: string;
    userId: string;
    displayName: string;
  } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const meCanComment = !!meId;

  const placeholder = useMemo(() => {
    if (!meCanComment) return "ログインしてコメント…";
    if (replyTo) return `${replyTo.displayName} に返信…`;
    return "コメントを入力...";
  }, [meCanComment, replyTo]);

  async function fetchComments() {
    setLoading(true);

    const { data, error } = await supabase
      .from("comments")
      .select(
        `
        id,
        post_id,
        user_id,
        body,
        created_at,
        reply_to_comment_id,
        reply_to_user_id,
        profiles ( display_name, avatar_url )
      `
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[fetchComments]", error);
      setComments([]);
      setLoading(false);
      return;
    }

    // ✅ ここで必ず「単体 profiles」に正規化してから state に入れる
    setComments(normalizeComments((data ?? []) as unknown as CommentRowRaw[]));
    setLoading(false);
  }

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  async function submit() {
    if (!meId) return;

    const body = text.trim();
    if (!body) return;

    setSubmitting(true);

    const payload = {
      post_id: postId,
      user_id: meId,
      body,
      reply_to_comment_id: replyTo?.commentId ?? null,
      reply_to_user_id: replyTo?.userId ?? null,
    };

    const { error } = await supabase.from("comments").insert(payload);

    setSubmitting(false);

    if (error) {
      alert(error.message);
      return;
    }

    setText("");
    setReplyTo(null);
    await fetchComments();
  }

  return (
    <div className="space-y-3">
      {/* コメント一覧 */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-xs text-slate-400">コメントを読み込み中…</div>
        ) : comments.length === 0 ? (
          <div className="text-xs text-slate-400">まだコメントはありません。</div>
        ) : (
          comments.map((c) => {
            const prof = c.profiles ?? null;
            const name = prof?.display_name ?? "ユーザー";
            const avatar = prof?.avatar_url ?? null;
            const initial = (name || "U").slice(0, 1).toUpperCase();

            return (
              <div key={c.id} className="flex items-start gap-2">
                <Link
                  href={`/u/${c.user_id}`}
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200"
                >
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    initial
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/u/${c.user_id}`}
                      className="truncate text-xs font-medium text-slate-800 hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="text-[11px] text-slate-400">
                      {formatJST(c.created_at)}
                    </span>
                  </div>

                  <div className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">
                    {c.body}
                  </div>

                  {/* 返信ボタン：誰でも返信できる */}
                  {meId && (
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo({
                            commentId: c.id,
                            userId: c.user_id,
                            displayName: name,
                          });
                          requestAnimationFrame(() => inputRef.current?.focus());
                        }}
                        className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
                      >
                        返信
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 入力欄 */}
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
        {!meCanComment ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">{placeholder}</div>
            <Link
              href="/auth/login"
              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
            >
              ログイン
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {replyTo && (
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-2 py-1">
                <div className="text-[11px] text-slate-500">
                  返信先:{" "}
                  <span className="font-medium text-slate-700">
                    {replyTo.displayName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
                >
                  キャンセル
                </button>
              </div>
            )}

            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder} // ✅ 1文字入力で自然に消える
              rows={2}
              className="w-full resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />

            <div className="flex items-center justify-between">
              <div className="text-[11px] text-slate-400">
                {replyTo
                  ? "相手に通知されます"
                  : ""}
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || text.trim().length === 0}
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  submitting || text.trim().length === 0
                    ? "bg-slate-100 text-slate-400"
                    : "bg-slate-900 text-white hover:opacity-90",
                ].join(" ")}
              >
                {submitting ? "送信中…" : "送信"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-[10px] text-slate-400">

      </div>
    </div>
  );
}
