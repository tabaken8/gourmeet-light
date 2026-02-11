"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { ChevronRight } from "lucide-react";

export type NotificationRow = {
  id: string;
  type: string; // "like" | "comment" | "reply" | "follow" | "post" ...
  created_at: string;
  read_at: string | null;
  actor: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  post: {
    id: string;
    place_id: string | null;
    place_name: string | null;
    place_address: string | null;
    image_urls: string[] | null;
    image_variants: any[] | null;
  } | null;
};

function actorName(a: NotificationRow["actor"]) {
  if (!a) return "だれか";
  return a.display_name ?? a.username ?? "だれか";
}

function thumbFromPost(p: NotificationRow["post"]): string | null {
  if (!p) return null;
  const v = p.image_variants;
  if (Array.isArray(v) && v.length > 0 && typeof v[0]?.thumb === "string") return v[0].thumb;
  const urls = p.image_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") return urls[0];
  return null;
}

function fmtRelativeJp(iso: string) {
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
  // JSTで今日/昨日/過去7日/それ以前
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

function messageFor(n: NotificationRow) {
  const name = actorName(n.actor);
  const place = n.post?.place_name ? `「${n.post.place_name}」` : "";
  switch (n.type) {
    case "follow":
      return `${name} があなたをフォローしました。`;
    case "like":
      return `${name} が ${place || "あなたの投稿"} にいいねしました。`;
    case "comment":
      return `${name} が ${place || "あなたの投稿"} にコメントしました。`;
    case "reply":
      return `${name} が返信しました。`;
    case "post":
      return `${name} が新しい投稿をしました。${place ? ` ${place}` : ""}`;
    default:
      return `${name} から通知があります。`;
  }
}

function mapsUrlFromPost(p: NotificationRow["post"]) {
  if (!p) return null;
  const mapUrl = p.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        p.place_name ?? "place"
      )}&query_place_id=${encodeURIComponent(p.place_id)}`
    : p.place_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place_address)}`
    : null;
  return mapUrl;
}

export default function NotificationsClient({ initial }: { initial: NotificationRow[] }) {
  const supabase = createClientComponentClient();
  const [rows, setRows] = useState<NotificationRow[]>(initial ?? []);

  const grouped = useMemo(() => {
    const m = new Map<string, NotificationRow[]>();
    for (const r of rows) {
      const b = dayBucket(r.created_at);
      const arr = m.get(b) ?? [];
      arr.push(r);
      m.set(b, arr);
    }
    const order = ["今日", "昨日", "過去7日間", "それ以前"];
    return order
      .filter((k) => m.has(k))
      .map((k) => ({ key: k, items: m.get(k)! }));
  }, [rows]);

  // ✅ 初回に未読をまとめて既読化（軽く）
  useEffect(() => {
    const unread = rows.filter((r) => !r.read_at).slice(0, 80);
    if (unread.length === 0) return;

    const ids = unread.map((r) => r.id);
    const nowIso = new Date().toISOString();

    // UI先行
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, read_at: nowIso } : r)));

    supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .in("id", ids)
      .then(({ error }) => {
        if (error) console.error("mark read error:", error.message);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows || rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[12px] text-slate-500">
        まだ通知はありません。
      </div>
    );
  }

  return (
    <div className="pb-8">
      {grouped.map((g) => (
        <section key={g.key} className="pt-4">
          {/* 見出し（IGっぽい） */}
          <div className="px-4 pb-2 text-[13px] font-semibold text-slate-900">{g.key}</div>

          <div className="divide-y divide-black/5 bg-white">
            {g.items.map((n) => {
              const a = n.actor;
              const msg = messageFor(n);
              const time = fmtRelativeJp(n.created_at);

              const avatar = a?.avatar_url ?? null;
              const initial = (actorName(a) || "U").slice(0, 1).toUpperCase();

              const postThumb = thumbFromPost(n.post);
              const postHref = n.post?.id ? `/posts/${encodeURIComponent(n.post.id)}` : null;

              const mapUrl = mapsUrlFromPost(n.post);

              // ✅ 行全体のリンク先：基本は投稿、なければプロフィール
              const rowHref =
                postHref ??
                (a?.id ? `/u/${encodeURIComponent(a.id)}` : "/notifications");

              const unread = false; // 既読化済み前提にしてる（未読ハイライトしたければ n.read_at を使う）

              return (
                <Link
                  key={n.id}
                  href={rowHref}
                  className={[
                    "flex items-center gap-3 px-4 py-3",
                    "active:bg-black/[.03] hover:bg-black/[.02]",
                    unread ? "bg-[#eef6ff]" : "",
                  ].join(" ")}
                >
                  {/* avatar */}
                  <div className="shrink-0">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar}
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
                      <span className="font-semibold">{actorName(a)}</span>{" "}
                      <span className="font-normal">{msg.replace(actorName(a), "").trim()}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{time}</div>

                    {/* ✅ post通知だけ “Maps” を小さく出す（IGの外部導線っぽく） */}
                    {n.type === "post" && mapUrl ? (
                      <div className="mt-1">
                        <a
                          href={mapUrl}
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Google Maps
                          <ChevronRight className="h-3 w-3 text-slate-400" />
                        </a>
                      </div>
                    ) : null}
                  </div>

                  {/* right */}
                  <div className="shrink-0">
                    {postThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={postThumb}
                        alt=""
                        className="h-11 w-11 rounded-xl object-cover bg-slate-200"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-11 w-11 rounded-xl bg-transparent" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
