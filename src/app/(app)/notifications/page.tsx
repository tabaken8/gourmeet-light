"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  MessageCircle,
  Heart,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Actor = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username?: string | null;
};

type Post = {
  id: string;
  content: string | null;
  image_urls: string[] | null;
  place_name: string | null;
  place_address: string | null;
  place_id: string | null;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
};

type NotificationType = "like" | "want" | "comment" | "reply" | "follow";

type Notification = {
  id: string;
  type: NotificationType;
  created_at: string;
  read: boolean;
  actor: Actor | null;
  post: Post | null;
  comment: Comment | null;
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

function labelForType(t: NotificationType) {
  switch (t) {
    case "like":
      return "があなたの投稿にいいねしました";
    case "want":
      return "があなたの投稿を行きたい！しました";
    case "comment":
      return "があなたの投稿にコメントしました";
    case "reply":
      return "があなたのコメントに返信しました";
    case "follow":
      return "があなたをフォローしました";
  }
}

function iconForType(t: NotificationType) {
  switch (t) {
    case "like":
      return <Heart size={14} className="text-rose-500" />;
    case "want":
      return <Sparkles size={14} className="text-orange-500" />;
    case "comment":
    case "reply":
      return <MessageCircle size={14} className="text-slate-500" />;
    case "follow":
      return <UserPlus size={14} className="text-sky-500" />;
  }
}

export default function NotificationsPage() {
  const supabase = createClientComponentClient();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [justReadIds, setJustReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const emptyText = useMemo(() => {
    if (loading) return "読み込み中…";
    return "まだ通知はありません";
  }, [loading]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // comment も join（comment_id が null の通知は comment=null）
      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
          id, type, created_at, read,
          actor:actor_id ( id, display_name, avatar_url, username ),
          post:post_id ( id, content, image_urls, place_name, place_address, place_id ),
          comment:comment_id ( id, body, created_at )
        `
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error(error);
        setNotifs([]);
        setLoading(false);
        return;
      }

      const unreadIds =
        data?.filter((n: any) => !n.read).map((n: any) => n.id) ?? [];
      setJustReadIds(unreadIds);

      setNotifs((data as unknown as Notification[]) ?? []);

      // DB を既読化（サーバーAPI経由）
      try {
        await fetch("/api/notifications/read", { method: "POST" });
      } catch (e) {
        console.warn("failed to mark notifications as read", e);
      }

      setLoading(false);
    };

    load();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">
        {/* ヘッダー */}
        <header className="mb-4">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            いいね・行きたい・コメントなど、あなたへの反応がここに届きます。
          </p>
        </header>

        {/* カード全体 */}
        <section className="overflow-hidden rounded-2xl border border-orange-100 bg-white/95 shadow-sm backdrop-blur">
          {/* 空状態 */}
          {!notifs?.length ? (
            <div className="flex min-h-[50vh] items-center justify-center px-4 pb-6 pt-6 text-xs text-slate-500">
              {emptyText}
            </div>
          ) : (
            <div className="flex flex-col">
              {notifs.map((n) => {
                const actor = n.actor;
                const post = n.post;

                const mapUrl = post?.place_id
                  ? `https://www.google.com/maps/place/?q=place_id:${post.place_id}`
                  : post?.place_address
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      post.place_address
                    )}`
                  : null;

                // ✅ 行き先：follow は相手プロフィールへ / 投稿系は投稿へ
                const href =
                  n.type === "follow" && actor?.id
                    ? `/u/${actor.id}`
                    : post?.id
                    ? `/posts/${post.id}`
                    : "/timeline";

                const actorName = actor?.display_name ?? "ユーザー";
                const actorAvatar = actor?.avatar_url ?? null;
                const initial = (actorName || "U").slice(0, 1).toUpperCase();

                // ✅ コメント通知なら本文を薄く小さくプレビュー
                const commentPreview =
                  (n.type === "comment" || n.type === "reply") && n.comment?.body
                    ? n.comment.body
                    : null;

                return (
                  <Link
                    key={n.id}
                    href={href}
                    className={[
                      "group flex gap-3 border-b border-orange-50 px-4 py-4 transition",
                      "hover:bg-orange-50/50",
                      justReadIds.includes(n.id) ? "bg-orange-50/70" : "bg-white",
                    ].join(" ")}
                  >
                    {/* アクターアイコン */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
                      {actorAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={actorAvatar}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        initial
                      )}
                    </div>

                    {/* 本文 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0">{iconForType(n.type)}</span>

                            <span className="truncate text-sm text-slate-800">
                              <span className="font-semibold">{actorName}</span>
                              <span className="text-slate-600">
                                {" "}
                                {labelForType(n.type)}
                              </span>
                            </span>
                          </div>

                          {/* ✅ コメントプレビュー（小さめ・薄め） */}
                          {commentPreview && (
                            <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                              &ldquo;{commentPreview}&rdquo;
                            </div>
                          )}

                          {/* ✅ 店舗名（ある場合） */}
                          {post?.place_name && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-orange-700">
                              <MapPin size={12} />
                              {mapUrl ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault(); // Link の遷移を止める
                                    e.stopPropagation(); // カードクリックも止める
                                    window.open(
                                      mapUrl,
                                      "_blank",
                                      "noopener,noreferrer"
                                    );
                                  }}
                                  className="truncate text-left hover:underline"
                                >
                                  {post.place_name}
                                </button>
                              ) : (
                                <span className="truncate">{post.place_name}</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 時刻 */}
                        <div className="shrink-0 text-[11px] text-slate-400">
                          {formatJST(n.created_at)}
                        </div>
                      </div>

                      {/* 投稿サムネ（follow通知はpostが無いので出ない） */}
                      {post?.image_urls?.[0] && (
                        <div className="mt-2">
                          <div className="h-14 w-14 overflow-hidden rounded-xl border border-orange-100 bg-orange-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={post.image_urls[0]}
                              alt=""
                              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
