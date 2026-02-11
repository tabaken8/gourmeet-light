"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, MessageCircle, Heart, UserPlus } from "lucide-react";
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

function formatRelativeJp(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "たった今";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間`;
  const d = Math.floor(h / 24);
  return `${d}日`;
}

function dayBucket(iso: string) {
  // JSTで 今日/昨日/過去7日/それ以前
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = dtf.format(new Date());
  const d = dtf.format(new Date(iso));
  const todayDate = new Date(`${today}T00:00:00+09:00`).getTime();
  const curDate = new Date(`${d}T00:00:00+09:00`).getTime();
  const diffDays = Math.floor((todayDate - curDate) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  if (diffDays <= 7) return "過去7日間";
  return "それ以前";
}

function labelForType(t: NotificationType) {
  switch (t) {
    case "like":
      return "がいいねしました";
    case "want":
      return "が「行きたい！」しました";
    case "comment":
      return "がコメントしました";
    case "reply":
      return "が返信しました";
    case "follow":
      return "があなたをフォローしました";
  }
}

function iconForType(t: NotificationType) {
  // ✅ IG寄せ：アイコンは小さく控えめ（主役はテキスト）
  switch (t) {
    case "like":
      return <Heart size={14} className="text-rose-500" />;
    case "want":
      // wantは現状使ってないなら、後で削除しよう（今回はUIのみ）
      return <Heart size={14} className="text-orange-500" />;
    case "comment":
    case "reply":
      return <MessageCircle size={14} className="text-slate-500" />;
    case "follow":
      return <UserPlus size={14} className="text-sky-600" />;
  }
}

function getThumbUrl(post: Post | null) {
  if (!post?.image_urls?.length) return null;
  return post.image_urls[0] ?? null;
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
        .limit(80);

      if (error) {
        console.error(error);
        setNotifs([]);
        setLoading(false);
        return;
      }

      const unreadIds = data?.filter((n: any) => !n.read).map((n: any) => n.id) ?? [];
      setJustReadIds(unreadIds);
      setNotifs((data as unknown as Notification[]) ?? []);

      // 既読化（既存API）
      try {
        await fetch("/api/notifications/read", { method: "POST" });
      } catch (e) {
        console.warn("failed to mark notifications as read", e);
      }

      setLoading(false);
    };

    load();
  }, [supabase]);

  const grouped = useMemo(() => {
    const m = new Map<string, Notification[]>();
    for (const n of notifs) {
      const b = dayBucket(n.created_at);
      const arr = m.get(b) ?? [];
      arr.push(n);
      m.set(b, arr);
    }
    const order = ["今日", "昨日", "過去7日間", "それ以前"];
    return order.filter((k) => m.has(k)).map((k) => ({ key: k, items: m.get(k)! }));
  }, [notifs]);

  return (
    <main className="min-h-screen bg-[#fafafa] text-slate-900">
      <div className="mx-auto w-full max-w-2xl px-0 pb-24">
        {/* ✅ IGっぽい sticky top bar（カード感を消す） */}
        <div className="sticky top-0 z-20 border-b border-black/10 bg-white/90 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="flex h-12 items-center justify-between px-4">
            <h1 className="text-[16px] font-semibold tracking-tight">通知</h1>
            <Link
              href="/settings/notifications"
              className="text-[12px] font-semibold text-slate-500 hover:text-slate-700"
            >
              通知設定
            </Link>
          </div>
        </div>

        {/* ✅ 本体：白背景 + セクション見出し + 行リスト */}
        {!notifs?.length ? (
          <div className="flex min-h-[60vh] items-center justify-center px-4 text-[12px] text-slate-500">
            {emptyText}
          </div>
        ) : (
          <div className="pb-6">
            {grouped.map((g) => (
              <section key={g.key} className="pt-4">
                <div className="px-4 pb-2 text-[13px] font-semibold text-slate-900">{g.key}</div>

                <div className="divide-y divide-black/5 bg-white">
                  {g.items.map((n) => {
                    const actor = n.actor;
                    const post = n.post;

                    const mapUrl = post?.place_id
                      ? `https://www.google.com/maps/place/?q=place_id:${post.place_id}`
                      : post?.place_address
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          post.place_address
                        )}`
                      : null;

                    const href =
                      n.type === "follow" && actor?.id
                        ? `/u/${actor.id}`
                        : post?.id
                        ? `/posts/${post.id}`
                        : "/timeline";

                    const actorName = actor?.display_name ?? actor?.username ?? "ユーザー";
                    const actorAvatar = actor?.avatar_url ?? null;
                    const initial = (actorName || "U").slice(0, 1).toUpperCase();

                    const commentPreview =
                      (n.type === "comment" || n.type === "reply") && n.comment?.body
                        ? n.comment.body
                        : null;

                    const thumb = getThumbUrl(post);

                    // ✅ 未読の薄いハイライト（IGの「薄青」っぽいノリ）
                    const isJustRead = justReadIds.includes(n.id);

                    return (
                      <Link
                        key={n.id}
                        href={href}
                        className={[
                          "flex items-center gap-3 px-4 py-3",
                          "active:bg-black/[.03] hover:bg-black/[.02]",
                          isJustRead ? "bg-[#eef6ff]" : "bg-white",
                        ].join(" ")}
                      >
                        {/* avatar */}
                        <div className="shrink-0">
                          {actorAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={actorAvatar}
                              alt=""
                              className="h-10 w-10 rounded-full object-cover bg-slate-200"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-[12px] font-bold text-slate-700">
                              {initial}
                            </div>
                          )}
                        </div>

                        {/* text */}
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] leading-snug text-slate-900">
                            <span className="inline-flex items-center gap-1.5">
                              {iconForType(n.type)}
                              <span className="font-semibold">{actorName}</span>
                            </span>{" "}
                            <span className="text-slate-700">{labelForType(n.type)}</span>
                          </div>

                          {commentPreview ? (
                            <div className="mt-0.5 line-clamp-2 text-[12px] text-slate-500">
                              &ldquo;{commentPreview}&rdquo;
                            </div>
                          ) : null}

                          {post?.place_name ? (
                            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
                              <MapPin size={12} className="text-slate-400" />
                              {mapUrl ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.open(mapUrl, "_blank", "noopener,noreferrer");
                                  }}
                                  className="truncate text-left hover:underline"
                                >
                                  {post.place_name}
                                </button>
                              ) : (
                                <span className="truncate">{post.place_name}</span>
                              )}
                            </div>
                          ) : null}

                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {formatRelativeJp(n.created_at)}
                          </div>
                        </div>

                        {/* right: thumb（IGは右に置くのが肝） */}
                        <div className="shrink-0">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-11 w-11 rounded-xl object-cover bg-slate-200"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="h-11 w-11" />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
