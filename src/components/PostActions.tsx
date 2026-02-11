"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export type LikerLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type LikerRow = LikerLite & {
  is_following?: boolean; // me -> liker
};

type PostActionsProps = {
  postId: string;
  postUserId: string;

  initialLiked: boolean;
  initialLikeCount: number;

  // ✅ タイムラインで先頭だけ見せる用（最大3）
  initialLikers?: LikerLite[];

  // ✅ 一覧で「あなた」「フォロー中」判定
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

function idsKey(arr: LikerLite[] | undefined) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "";
  return arr
    .map((x) => x?.id)
    .filter(Boolean)
    .join("|");
}

function AvatarBubble({
  user,
  size = 18,
  className = "",
}: {
  user: LikerLite;
  size?: number;
  className?: string;
}) {
  const initial = (user.display_name ?? "U").slice(0, 1).toUpperCase();

  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 ring-1 ring-white",
        className,
      ].join(" ")}
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
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LikerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
        aria-label="閉じる"
      />

      {/* bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
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

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-black/10 bg-slate-50 px-3 py-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="検索"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">読み込み中...</div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-xs text-red-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">該当なし</div>
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

  const [liked, setLiked] = useState<boolean>(initialLiked);
  const [likeCount, setLikeCount] = useState<number>(initialLikeCount);
  const [likers, setLikers] = useState<LikerLite[]>(initialLikers);
  const [loading, setLoading] = useState(false);
  const [openList, setOpenList] = useState(false);

  // ✅ 無限ループ対策：参照が毎回変わる配列を deps にして setState しない
  const incomingKey = useMemo(() => idsKey(initialLikers), [initialLikers]);
  const lastSyncRef = useRef<string>("");

  useEffect(() => {
    const key = `${initialLiked ? 1 : 0}::${initialLikeCount}::${incomingKey}`;
    if (lastSyncRef.current === key) return;
    lastSyncRef.current = key;

    // 値が変わっている時だけ同期
    setLiked((cur) => (cur !== initialLiked ? initialLiked : cur));
    setLikeCount((cur) => (cur !== initialLikeCount ? initialLikeCount : cur));

    const nextLikers = initialLikers ?? [];
    setLikers((cur) => {
      const curKey = idsKey(cur);
      const nextKey = idsKey(nextLikers);
      return curKey !== nextKey ? nextLikers : cur;
    });
  }, [initialLiked, initialLikeCount, incomingKey, initialLikers]);

  const displayRow = useMemo(() => {
    const first = likers[0] ?? null;
    const showOthers = likeCount >= 2; // ✅ 2人以上の時だけ「他」を見せる
    return { first, showOthers };
  }, [likers, likeCount]);

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

    const myLite: LikerLite = {
      id: user.id,
      display_name: (user.user_metadata as any)?.display_name ?? user.email ?? "me",
      avatar_url: (user.user_metadata as any)?.avatar_url ?? null,
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

  const bubbleUsers = useMemo(() => likers.slice(0, 3), [likers]);

  return (
    <div className="flex items-center gap-3">
      {/* heart */}
      <button
        type="button"
        onClick={toggleLike}
        disabled={loading}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-50 disabled:cursor-not-allowed"
        aria-label={liked ? "いいねを取り消す" : "いいね"}
      >
        <Heart className="h-5 w-5" fill={liked ? "currentColor" : "none"} strokeWidth={1.8} />
      </button>

      {/* instagram line */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {/* bubbles */}
          <div className="flex items-center">
            {bubbleUsers.map((u, idx) => (
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
{/* text */}
<div className="min-w-0 text-[12px] text-slate-700">
  {likeCount <= 0 ? null : (
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

          {displayRow.showOthers ? (
            <>
              <span className="text-slate-500">、</span>
              <button
                type="button"
                onClick={() => setOpenList(true)}
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

      <LikeListModal open={openList} onClose={() => setOpenList(false)} postId={postId} meId={meId} />
    </div>
  );
}
