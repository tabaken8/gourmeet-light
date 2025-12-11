// src/app/(app)/follow-requests/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import { Check, X, UserPlus } from "lucide-react";

type FollowRequestRow = {
  follower_id: string;
  created_at: string;
  request_read: boolean;
  follower: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
};

export default function FollowRequestsPage() {
  const supabase = createClientComponentClient();
  const [requests, setRequests] = useState<FollowRequestRow[]>([]);
  const [justReadIds, setJustReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // pending のフォローを follower のプロフィールと一緒に取得
      const { data, error } = await supabase
        .from("follows")
        .select(
          `
          follower_id,
          created_at,
          request_read,
          follower:follower_id (
            id,
            display_name,
            avatar_url,
            username
          )
        `
        )
        .eq("followee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as unknown as FollowRequestRow[];

      // いま未読だったものをハイライト用にメモ
      const unreadFollowerIds = rows
        .filter((r) => !r.request_read)
        .map((r) => r.follower_id);

      setJustReadIds(unreadFollowerIds);
      setRequests(rows);
      setLoading(false);

      // DB側で既読化（notifications と同じパターン）
      await fetch("/api/follow-requests/read", { method: "POST" }).catch(
        (err) => console.error("mark follow requests read failed", err)
      );
    };

    load();
  }, [supabase]);

  const handleApprove = async (followerId: string) => {
    const res = await fetch("/api/follow-requests/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ followerId }),
    });
    if (!res.ok) return;

    setRequests((prev) =>
      prev.filter((r) => r.follower_id !== followerId)
    );
  };

  const handleReject = async (followerId: string) => {
    const res = await fetch("/api/follow-requests/reject", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ followerId }),
    });
    if (!res.ok) return;

    setRequests((prev) =>
      prev.filter((r) => r.follower_id !== followerId)
    );
  };

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <header className="flex items-center gap-2 mb-2">
        <UserPlus className="text-orange-600" />
        <h1 className="text-2xl font-bold">フォローリクエスト</h1>
      </header>
      <p className="text-sm text-gray-600 mb-4">
        あなたをフォローしたいユーザーの一覧です。承認すると、あなたの非公開投稿も見られるようになります。
      </p>

      {loading && (
        <p className="text-sm text-gray-500">読み込み中...</p>
      )}

      {!loading && !requests.length && (
        <p className="text-sm text-gray-500">
          現在、フォローリクエストはありません。
        </p>
      )}

      {requests.map((r) => {
        const f = r.follower;
        const display =
          f?.display_name ?? (f?.username ? `@${f.username}` : "ユーザー");
        const initial = display[0]?.toUpperCase() ?? "U";

        return (
          <div
            key={r.follower_id}
            className={`flex items-center gap-3 rounded-lg border p-3 ${
              justReadIds.includes(r.follower_id)
                ? "bg-orange-50"
                : "bg-white"
            }`}
          >
            {/* アイコン */}
            <Link
              href={f ? `/u/${f.id}` : "#"}
              className="h-10 w-10 rounded-full overflow-hidden shrink-0 bg-gray-200 flex items-center justify-center"
            >
              {f?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm font-semibold">
                  {initial}
                </span>
              )}
            </Link>

            {/* 本文 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <Link
                  href={f ? `/u/${f.id}` : "#"}
                  className="font-semibold hover:underline"
                >
                  {display}
                </Link>{" "}
                さんからフォローリクエストが届いています。
              </p>
              {f?.username && (
                <p className="text-xs text-gray-500">@{f.username}</p>
              )}
              <p className="mt-1 text-[11px] text-gray-400">
                {new Date(r.created_at).toLocaleString()}
              </p>
            </div>

            {/* ボタン */}
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => handleApprove(r.follower_id)}
                className="inline-flex items-center gap-1 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800"
              >
                <Check size={14} />
                承認
              </button>
              <button
                type="button"
                onClick={() => handleReject(r.follower_id)}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
              >
                <X size={14} />
                削除
              </button>
            </div>
          </div>
        );
      })}
    </main>
  );
}
