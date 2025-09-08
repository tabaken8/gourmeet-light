"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Actor = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username?: string;
};

type Post = {
  id: string;
  content: string | null;
  image_urls: string[] | null;
  place_name: string | null;
  place_address: string | null;
  place_id: string | null;
};

type Notification = {
  id: string;
  type: "like" | "want";
  created_at: string;
  read: boolean;
  actor: Actor | null;
  post: Post | null;
};

export default function NotificationsPage() {
  const supabase = createClientComponentClient();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [justReadIds, setJustReadIds] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      // 通知を全部取得
      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
          id, type, created_at, read,
          actor:actor_id ( id, display_name, avatar_url, username ),
          post:post_id ( id, content, image_urls, place_name, place_address, place_id )
        `
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) return console.error(error);

      // 今未読だったものを保存
      const unreadIds = data?.filter((n) => !n.read).map((n) => n.id) ?? [];
      setJustReadIds(unreadIds);

      // 👇 型を Notification[] にキャスト
      setNotifs((data as unknown as Notification[]) ?? []);

      // DBを既読化（サーバーAPI経由）
      await fetch("/api/notifications/read", { method: "POST" });
    };

    load();
  }, [supabase]);

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold mb-4">通知</h1>

      {!notifs?.length && (
        <p className="text-sm text-gray-500">まだ通知はありません</p>
      )}

      {notifs?.map((n) => {
        const actor = n.actor;
        const post = n.post;

        const mapUrl = post?.place_id
          ? `https://www.google.com/maps/place/?q=place_id:${post.place_id}`
          : post?.place_address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              post.place_address
            )}`
          : null;

        return (
          <div
            key={n.id}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              justReadIds.includes(n.id) ? "bg-orange-50" : "bg-white"
            }`}
          >
            {/* アクター */}
            {actor && (
              <Link
                href={`/u/${actor.id}`}
                className="h-10 w-10 rounded-full overflow-hidden shrink-0"
              >
                {actor.avatar_url ? (
                  <img
                    src={actor.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gray-200">
                    {actor.display_name?.[0]?.toUpperCase() ?? "U"}
                  </div>
                )}
              </Link>
            )}

            {/* 本文 */}
            <div className="flex-1 text-sm space-y-1">
              <p>
                {actor ? (
                  <Link
                    href={`/u/${actor.id}`}
                    className="font-semibold hover:underline"
                  >
                    {actor.display_name ?? "ユーザー"}さん
                  </Link>
                ) : (
                  "誰か"
                )}{" "}
                {n.type === "like"
                  ? "があなたの投稿にいいねしました"
                  : "があなたの投稿を行きたい！しました"}
              </p>

              {/* 投稿プレビュー */}
              {post && (
                <div className="ml-1 flex items-center gap-2">
                  {post.image_urls?.[0] && (
                    <Link
                      href={`/posts/${post.id}`}
                      className="block h-14 w-14 rounded overflow-hidden shrink-0"
                    >
                      <img
                        src={post.image_urls[0]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </Link>
                  )}
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <Link
                      href={`/posts/${post.id}`}
                      className="block hover:underline text-orange-700"
                    >
                      投稿を見る
                    </Link>
                    {post.place_name && (
                      <div className="flex items-center gap-1 text-orange-700">
                        <MapPin size={12} />
                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {post.place_name}
                          </a>
                        ) : (
                          <span>{post.place_name}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-400">
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </main>
  );
}
