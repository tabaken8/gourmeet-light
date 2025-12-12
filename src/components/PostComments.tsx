"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  reply_to_comment_id: string | null;
  reply_to_user_id: string | null;
  profile: ProfileLite | null; // ✅ JOINせず後で合成
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

export default function PostComments({ postId, postUserId, meId }: Props) {
  const supabase = createClientComponentClient();

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

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
    setErrMsg(null);

    // 1) ✅ commentsだけ取る（JOINなし）
    const { data: cData, error: cErr } = await supabase
      .from("comments")
      .select(
        "id, post_id, user_id, body, created_at, reply_to_comment_id, reply_to_user_id"
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (cErr) {
      console.error("[comments select error]", cErr);
      setComments([]);
      setErrMsg(`comments select error: ${cErr.message}`);
      setLoading(false);
      return;
    }

    const raw = (cData ?? []) as Omit<CommentRow, "profile">[];

    // 2) ✅ その user_id 一覧で profiles を別クエリ（これも頑健）
    const userIds = Array.from(new Set(raw.map((r) => r.user_id)));
    let profileMap: Record<string, ProfileLite> = {};

    if (userIds.length) {
      const { data: pData, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      if (pErr) {
        // profiles 取れなくてもコメント本文は表示できるので「致命傷にしない」
        console.error("[profiles select error]", pErr);
        setErrMsg(`profiles select error: ${pErr.message}`);
      } else {
        for (const p of pData ?? []) {
          profileMap[p.id] = p as ProfileLite;
        }
      }
    }

    // 3) 合成
    const merged: CommentRow[] = raw.map((r) => ({
      ...r,
      profile: profileMap[r.user_id] ?? null,
    }));

    setComments(merged);
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
    setErrMsg(null);

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
      console.error("[comments insert error]", error);
      setErrMsg(`comments insert error: ${error.message}`);
      return;
    }

    setText("");
    setReplyTo(null);

    // ✅ 再取得（ここで確実に反映）
    await fetchComments();
  }

  return (
    <div className="space-y-3">
      {/* エラー表示（今後のデバッグが一瞬で終わる） */}
      {errMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errMsg}
        </div>
      )}

      {/* コメント一覧 */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-xs text-slate-400">コメントを読み込み中…</div>
        ) : comments.length === 0 ? (
          <div className="text-xs text-slate-400">まだコメントはありません。</div>
        ) : (
          comments.map((c) => {
            const name = c.profile?.display_name ?? "ユーザー";
            const avatar = c.profile?.avatar_url ?? null;
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
              placeholder={placeholder}
              rows={2}
              className="w-full resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />

            <div className="flex items-center justify-between">
              <div className="text-[11px] text-slate-400">
                {replyTo ? "" : ""}
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
    </div>
  );
}
