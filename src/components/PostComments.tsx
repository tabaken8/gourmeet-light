// src/components/PostComments.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
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
  profile: ProfileLite | null;
  replyToProfile: ProfileLite | null; // ✅ 返信先プロフィール
};

type CommentLikeRow = {
  comment_id: string;
  user_id: string;
};

type Props = {
  postId: string;
  postUserId: string;
  meId: string | null;
  previewCount?: number; // ✅ タイムラインでは少なめに
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

export default function PostComments({
  postId,
  postUserId,
  meId,
  previewCount = 2,
}: Props) {
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

  const [expanded, setExpanded] = useState(false);

  // -------------------------
  // ✅ delete state
  // -------------------------
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteComment(commentId: string) {
    if (!meId) return;
    if (deletingId) return;

    setDeletingId(commentId);
    setErrMsg(null);

    try {
      // ✅ 自分のコメントだけ消せる想定（RLS/Policy はAPI側で担保）
      const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);

      // optimistic remove
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      // like map も掃除
      setLikeCountMap((m) => {
        const cp = { ...m };
        delete cp[commentId];
        return cp;
      });
      setLikedByMeMap((m) => {
        const cp = { ...m };
        delete cp[commentId];
        return cp;
      });
    } catch (e: any) {
      setErrMsg(e?.message ?? "削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  }

  // -------------------------
  // ✅ comment likes state
  // -------------------------
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});
  const [likedByMeMap, setLikedByMeMap] = useState<Record<string, boolean>>({});
  const [likeTogglingId, setLikeTogglingId] = useState<string | null>(null);

  async function fetchComments() {
    setLoading(true);
    setErrMsg(null);

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

    const raw = (cData ?? []) as Omit<CommentRow, "profile" | "replyToProfile">[];

    // ✅ user_id + reply_to_user_id の両方を profiles で引く
    const ids = Array.from(
      new Set(
        raw.flatMap((r) => [r.user_id, r.reply_to_user_id].filter(Boolean) as string[])
      )
    );

    let profileMap: Record<string, ProfileLite> = {};

    if (ids.length) {
      const { data: pData, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);

      if (pErr) {
        console.error("[profiles select error]", pErr);
        setErrMsg(`profiles select error: ${pErr.message}`);
      } else {
        for (const p of pData ?? []) profileMap[p.id] = p as ProfileLite;
      }
    }

    const merged: CommentRow[] = raw.map((r) => ({
      ...r,
      profile: profileMap[r.user_id] ?? null,
      replyToProfile: r.reply_to_user_id ? profileMap[r.reply_to_user_id] ?? null : null,
    }));

    setComments(merged);
    setLoading(false);

    // 取得し直したら「一旦たたむ」をデフォ
    setExpanded(false);

    // ✅ likes も同期
    await fetchCommentLikes(merged.map((x) => x.id));
  }

  async function fetchCommentLikes(commentIds: string[]) {
    // コメントが0なら初期化
    if (!commentIds.length) {
      setLikeCountMap({});
      setLikedByMeMap({});
      return;
    }

    // 👇 小規模想定なので、該当コメントの like 行を全部取って JS 集計（簡単&堅い）
    const { data, error } = await supabase
      .from("comment_likes")
      .select("comment_id, user_id")
      .in("comment_id", commentIds);

    if (error) {
      console.error("[comment_likes select error]", error);
      // likes はUI上必須じゃないので、エラー表示は控えめに
      return;
    }

    const rows = (data ?? []) as CommentLikeRow[];

    const countMap: Record<string, number> = {};
    const likedMap: Record<string, boolean> = {};

    for (const cid of commentIds) countMap[cid] = 0;

    for (const r of rows) {
      countMap[r.comment_id] = (countMap[r.comment_id] ?? 0) + 1;
      if (meId && r.user_id === meId) likedMap[r.comment_id] = true;
    }

    setLikeCountMap(countMap);
    setLikedByMeMap(likedMap);
  }

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  function mentionString(name: string) {
    return `@${name} `;
  }

  async function submit() {
    if (!meId) return;

    let body = text.trim();
    if (!body) return;

    // ✅ 返信なら先頭に @displayName を付ける
    if (replyTo) {
      const m = mentionString(replyTo.displayName).trim();
      if (!body.startsWith(m)) {
        body = `${mentionString(replyTo.displayName)}${body}`.trim();
      }
    }

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
    await fetchComments();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // -------------------------
  // ✅ toggle comment like
  // -------------------------
  async function toggleCommentLike(commentId: string) {
    if (!meId) return;
    if (likeTogglingId) return;

    const curLiked = !!likedByMeMap[commentId];
    const curCount = likeCountMap[commentId] ?? 0;

    setLikeTogglingId(commentId);

    if (!curLiked) {
      // optimistic ON
      setLikedByMeMap((m) => ({ ...m, [commentId]: true }));
      setLikeCountMap((m) => ({ ...m, [commentId]: (m[commentId] ?? 0) + 1 }));

      const { error } = await supabase.from("comment_likes").insert({
        comment_id: commentId,
        user_id: meId,
      });

      // 23505 = unique violation（連打等）
      if (error && (error as any).code !== "23505") {
        console.error("[comment_like insert error]", error);
        // rollback
        setLikedByMeMap((m) => ({ ...m, [commentId]: curLiked }));
        setLikeCountMap((m) => ({ ...m, [commentId]: curCount }));
      }
    } else {
      // optimistic OFF
      setLikedByMeMap((m) => ({ ...m, [commentId]: false }));
      setLikeCountMap((m) => ({ ...m, [commentId]: Math.max(0, (m[commentId] ?? 1) - 1) }));

      const { error } = await supabase
        .from("comment_likes")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", meId);

      if (error) {
        console.error("[comment_like delete error]", error);
        // rollback
        setLikedByMeMap((m) => ({ ...m, [commentId]: curLiked }));
        setLikeCountMap((m) => ({ ...m, [commentId]: curCount }));
      }
    }

    setLikeTogglingId(null);
  }

  // ------ コメント表示数（タイムラインで邪魔にならないように） ------
  const visibleComments = useMemo(() => {
    if (expanded) return comments;
    return comments.slice(0, previewCount);
  }, [comments, expanded, previewCount]);

  const hiddenCount = Math.max(comments.length - previewCount, 0);

  // ------ composer（軽い見た目、白統一） ------
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hasText = text.trim().length > 0;

  useEffect(() => {
    if (replyTo || hasText) setOpen(true);
  }, [replyTo, hasText]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(e.target as Node)) return;
      if (!replyTo && !hasText && !submitting) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [replyTo, hasText, submitting]);

  return (
    <div className="space-y-3">
      {errMsg && <div className="text-xs text-red-700">{errMsg}</div>}

      {/* コメント一覧 */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-xs text-slate-400">コメントを読み込み中…</div>
        ) : comments.length === 0 ? (
          <div className="text-xs text-slate-400">まだコメントはありません。</div>
        ) : (
          <>
            {visibleComments.map((c) => {
              const name = c.profile?.display_name ?? "ユーザー";
              const avatar = c.profile?.avatar_url ?? null;
              const initial = (name || "U").slice(0, 1).toUpperCase();
              const replyName = c.replyToProfile?.display_name ?? null;

              const isMine = !!(meId && c.user_id === meId);

              const liked = !!likedByMeMap[c.id];
              const likeCount = likeCountMap[c.id] ?? 0;
              const likeBusy = likeTogglingId === c.id;

              return (
                <div key={c.id} className="flex items-start gap-2">
                  <Link
                    href={`/u/${c.user_id}`}
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600"
                  >
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      initial
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    {/* ✅ name / time / delete (delete は時刻の右) */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        href={`/u/${c.user_id}`}
                        className="truncate text-xs font-medium text-slate-800 hover:underline"
                      >
                        {name}
                      </Link>

                      <span className="text-[11px] text-slate-400">{formatJST(c.created_at)}</span>

                      {isMine ? (
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          disabled={deletingId === c.id}
                          className="text-[11px] font-medium text-slate-400 hover:text-red-600 disabled:opacity-50"
                          aria-label="コメントを削除"
                          title="削除"
                        >
                          {deletingId === c.id ? "削除中…" : "削除"}
                        </button>
                      ) : null}
                    </div>

                    {/* ✅ 返信の文脈が分かるように表示 */}
                    {c.reply_to_user_id && replyName && (
                      <div className="mt-0.5 text-[12px] text-slate-500">
                        <Link href={`/u/${c.reply_to_user_id}`} className="hover:underline">
                          @{replyName}
                        </Link>{" "}
                        に返信
                      </div>
                    )}

                    <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{c.body}</div>

                    {/* actions row */}
                    {meId && (
                      <div className="mt-1 flex items-center gap-3">
                        {/* reply */}
                        <button
                          type="button"
                          onClick={() => {
                            const targetName = name;
                            setReplyTo({
                              commentId: c.id,
                              userId: c.user_id,
                              displayName: targetName,
                            });
                            setOpen(true);

                            // ✅ 自動メンション挿入（重複防止）
                            setText((prev) => {
                              const m = mentionString(targetName);
                              if (!prev.trim()) return m;
                              if (prev.startsWith(m)) return prev;
                              return `${m}${prev}`;
                            });

                            requestAnimationFrame(() => inputRef.current?.focus());
                          }}
                          className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
                        >
                          返信
                        </button>

                        {/* ✅ tiny heart like */}
                        <button
                          type="button"
                          onClick={() => toggleCommentLike(c.id)}
                          disabled={likeBusy}
                          className={[
                            "inline-flex items-center gap-1",
                            "text-[11px] font-medium",
                            liked ? "text-red-500" : "text-slate-400 hover:text-slate-600",
                            likeBusy ? "opacity-60" : "",
                          ].join(" ")}
                          aria-label={liked ? "コメントのいいねを取り消す" : "コメントにいいね"}
                          title={liked ? "いいね済み" : "いいね"}
                        >
                          <Heart
                            className="h-[13px] w-[13px]"
                            fill={liked ? "currentColor" : "none"}
                            strokeWidth={2}
                          />
                          {likeCount > 0 ? <span>{likeCount}</span> : null}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ✅ 詳細ボタン */}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                {expanded ? "コメントを折りたたむ" : `コメントをもっと見る（+${hiddenCount}）`}
              </button>
            )}
          </>
        )}
      </div>

      {/* composer */}
      {!meCanComment ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">{placeholder}</div>
          <Link
            href="/auth/login"
            className="rounded-full !bg-slate-900 px-3 py-1 text-xs font-medium !text-white hover:opacity-90"
          >
            ログイン
          </Link>
        </div>
      ) : (
        <div ref={wrapperRef} className="relative">
          {!open && (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="w-full text-left text-sm text-slate-500 hover:text-slate-700"
            >
              コメントを書く…
            </button>
          )}

          <div
            className={[
              "absolute left-0 right-0 z-10",
              "transition duration-150 ease-out will-change-transform",
              open
                ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                : "opacity-0 -translate-y-1 scale-[0.99] pointer-events-none",
            ].join(" ")}
            style={{ top: 0 }}
          >
            <div className="rounded-2xl bg-white shadow-md p-3">
              {replyTo && (
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    返信先:{" "}
                    <span className="font-medium text-slate-700">{replyTo.displayName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(null);
                    }}
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
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    if (!submitting && text.trim().length > 0) submit();
                  }
                  if (e.key === "Escape" && !replyTo && !hasText) {
                    setOpen(false);
                  }
                }}
                className="w-full resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />

              <div className="mt-2 flex items-center justify-between">
                <div className="text-[11px] text-slate-400">Cmd/Ctrl + Enter</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!replyTo && !hasText && !submitting) setOpen(false);
                    }}
                    className="rounded-full px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
                  >
                    閉じる
                  </button>
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
            </div>
          </div>

          {/* absolute分の高さ確保 */}
          <div className={open ? "h-[120px]" : "h-[20px]"} />
        </div>
      )}
    </div>
  );
}
