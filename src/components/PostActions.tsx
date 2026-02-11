// src/components/PostActions.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { createPortal } from "react-dom";

export type LikerLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type LikerRow = LikerLite & {
  is_following?: boolean; // /api/posts/[id]/likers で付与（me -> liker）
};

type PostActionsProps = {
  postId: string;
  postUserId: string;

  initialLiked: boolean;
  initialLikeCount: number;

  // ✅ タイムラインで小さく出す「先頭likers」
  initialLikers?: LikerLite[];

  // ✅ 一覧モーダルで「あなた」「フォロー中」表示に使う
  meId?: string | null;

  // 既存互換（使わないが残す）
  initialWanted?: boolean;
  initialBookmarked?: boolean;
  initialWantCount?: number;
  initialBookmarkCount?: number;
};

function uniqById(arr: LikerLite[]) {
  const m = new Map<string, LikerLite>();
  for (const a of arr) if (a?.id) m.set(a.id, a);
  return Array.from(m.values());
}

function shallowSameLikers(a: LikerLite[] | undefined, b: LikerLite[] | undefined) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if ((aa[i]?.id ?? "") !== (bb[i]?.id ?? "")) return false;
  return true;
}

function AvatarBubble({ user, size = 18 }: { user: LikerLite; size?: number }) {
  const initial = (user.display_name ?? "U").slice(0, 1).toUpperCase();

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 ring-1 ring-white"
      style={{ width: size, height: size }}
      title={user.display_name ?? undefined}
    >
      {user.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar_url}
          alt=""
          width={size}
          height={size}
          className="block h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-[10px] font-semibold text-slate-600">{initial}</span>
      )}
    </span>
  );
}

/**
 * ✅ 画面固定のいいね一覧（Portal）
 * - 親のtransform等に引きずられない
 * - open中スクロールロック
 * - Escで閉じる
 */
function LikeListModal({
  open,
  onClose,
  postId,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  meId: string | null | undefined;
}) {
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LikerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // portal guard
  useEffect(() => setMounted(true), []);

  // body scroll lock + esc close
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // fetch likers
  useEffect(() => {
    if (!open) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/likers`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        setRows(Array.isArray(data?.likers) ? data.likers : []);
      } catch (e: any) {
        setError(e?.message ?? "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, postId]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((r) => (r.display_name ?? "").toLowerCase().includes(key));
  }, [rows, q]);

  if (!open || !mounted) return null;

  const ui = (
    <div className="fixed inset-0 z-[9999]">
      {/* backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
        aria-label="閉じる"
      />

      {/* center modal */}
      <div
        className="fixed left-1/2 top-1/2 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="text-sm font-semibold">いいね！</div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-black/10 bg-slate-50 px-3 py-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="検索"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-3 pb-5">
          {loading ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500">読み込み中...</div>
          ) : error ? (
            <div className="px-4 py-10 text-center text-xs text-red-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500">該当なし</div>
          ) : (
            filtered.map((u) => {
              const initial = (u.display_name ?? "U").slice(0, 1).toUpperCase();
              const isMe = !!(meId && u.id === meId);

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2 hover:bg-slate-50"
                >
                  <Link href={`/u/${u.id}`} className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-slate-200">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-11 w-11 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-slate-600">{initial}</span>
                      )}
                    </span>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {u.display_name ?? "ユーザー"}
                      </div>
                      <div className="truncate text-xs text-slate-500">@{u.id.slice(0, 10)}…</div>
                    </div>
                  </Link>

                  {/* 右：フォロー状態（表示のみ。実フォローは別で実装OK） */}
                  <div className="shrink-0">
                    {isMe ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        あなた
                      </span>
                    ) : u.is_following ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        フォロー中
                      </span>
                    ) : (
                      <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                        フォロー
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}

export default function PostActions({
  postId,
  postUserId,
  initialLiked,
  initialLikeCount,
  initialLikers = [],
  meId,
}: PostActionsProps) {
  const supabase = createClientComponentClient();

  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [likers, setLikers] = useState<LikerLite[]>(Array.isArray(initialLikers) ? initialLikers : []);
  const [loading, setLoading] = useState(false);
  const [openList, setOpenList] = useState(false);

  // ✅ 無限ループ対策：props変化時に「実際に変わったときだけ」同期
  const prevSyncKeyRef = useRef<string>("");
  useEffect(() => {
    const ids = (Array.isArray(initialLikers) ? initialLikers : []).map((x) => x?.id ?? "").join("|");
    const key = `${initialLiked ? 1 : 0}:${initialLikeCount}:${ids}`;
    if (prevSyncKeyRef.current === key) return;
    prevSyncKeyRef.current = key;

    setLiked(initialLiked);
    setLikeCount(initialLikeCount);

    // likers 同期は shallow 比較
    setLikers((prev) => {
      const next = Array.isArray(initialLikers) ? initialLikers : [];
      if (shallowSameLikers(prev, next)) return prev;
      return next;
    });
  }, [initialLiked, initialLikeCount, initialLikers]);

  const displayRow = useMemo(() => {
    const first = likers[0] ?? null;
    const restCount = Math.max(0, likeCount - (first ? 1 : 0));
    return { first, restCount };
  }, [likers, likeCount]);

  const openListSafely = () => {
    // ✅ 0〜1人しかいないのに「他」を出したくない時の保険
    if (likeCount <= 1) return;
    setOpenList(true);
  };

  const toggleLike = async () => {
    if (loading) return;
    setLoading(true);

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.error(authErr);
      alert("ユーザー情報の取得に失敗しました");
      setLoading(false);
      return;
    }
    const user = auth.user;
    if (!user) {
      alert("ログインが必要です");
      setLoading(false);
      return;
    }

    const meta = (user.user_metadata ?? {}) as any;
    const myLite: LikerLite = {
      id: user.id,
      display_name: meta?.display_name ?? user.email ?? "me",
      avatar_url: meta?.avatar_url ?? null,
    };

    if (!liked) {
      // optimistic ON
      setLiked(true);
      setLikeCount((c) => c + 1);
      setLikers((prev) => uniqById([myLite, ...prev]).slice(0, 3));

      const { error } = await supabase.from("post_likes").insert({
        post_id: postId,
        user_id: user.id,
      });

      if (error && (error as any).code !== "23505") {
        console.error("like insert error:", error);
        // rollback
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
        setLikers((prev) => prev.filter((x) => x.id !== user.id));
      } else {
        // 通知
        if (postUserId && postUserId !== user.id) {
          await supabase.from("notifications").insert({
            user_id: postUserId,
            actor_id: user.id,
            post_id: postId,
            type: "like",
            read: false,
          });
        }
      }
    } else {
      // optimistic OFF
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
      setLikers((prev) => prev.filter((x) => x.id !== user.id));

      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);

      if (error) {
        console.error("like delete error:", error);
        // rollback
        setLiked(true);
        setLikeCount((c) => c + 1);
        setLikers((prev) => uniqById([myLite, ...prev]).slice(0, 3));
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Heart */}
      <button
        type="button"
        onClick={toggleLike}
        disabled={loading}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-50 disabled:cursor-not-allowed"
        aria-label={liked ? "いいねを取り消す" : "いいね"}
      >
        <Heart className="h-5 w-5" fill={liked ? "currentColor" : "none"} strokeWidth={1.8} />
      </button>

      {/* Instagramっぽい行 */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {/* bubbles */}
          <div className="flex items-center">
            {likers.slice(0, 3).map((u, idx) => (
              <Link
                key={u.id}
                href={`/u/${u.id}`}
                className={["inline-flex", idx === 0 ? "" : "-ml-1.5"].join(" ")}
                aria-label={`${u.display_name ?? "ユーザー"}のプロフィールへ`}
                title={u.display_name ?? undefined}
              >
                <AvatarBubble user={u} size={18} />
              </Link>
            ))}
          </div>

          {/* text */}
          <div className="min-w-0 text-[12px] text-slate-700">
            {likeCount <= 0 ? (
              <span className="text-slate-400">いいね！</span>
            ) : (
              <span className="truncate">
                <span className="font-semibold">いいね！</span>{" "}
                {displayRow.first ? (
                  <>
                    <Link
                      href={`/u/${displayRow.first.id}`}
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {displayRow.first.display_name ?? "ユーザー"}
                    </Link>

                    {likeCount >= 2 ? (
                      <>
                        <span className="text-slate-500">、</span>
                        <button
                          type="button"
                          onClick={openListSafely}
                          className="font-semibold text-slate-900 hover:underline"
                        >
                          他
                        </button>
                      </>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenList(true)}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    {likeCount}人
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <LikeListModal open={openList} onClose={() => setOpenList(false)} postId={postId} meId={meId ?? null} />
    </div>
  );
}
