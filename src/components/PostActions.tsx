"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type PostActionsProps = {
  postId: string;
  postUserId: string;
  initialLiked: boolean;
  initialLikeCount: number;
  // 既存呼び出しと型互換のために残しておくが、使わない
  initialWanted?: boolean;
  initialBookmarked?: boolean;
  initialWantCount?: number;
  initialBookmarkCount?: number;
};

export default function PostActions({
  postId,
  postUserId,
  initialLiked,
  initialLikeCount,
}: PostActionsProps) {
  const supabase = createClientComponentClient();

  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [loading, setLoading] = useState(false);

  // props が変わった時に同期（SSR → CSR のズレ対策）
  useEffect(() => {
    setLiked(initialLiked);
    setLikeCount(initialLikeCount);
  }, [initialLiked, initialLikeCount]);

  const toggleLike = async () => {
    if (loading) return;
    setLoading(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error(sessionError);
      alert("ユーザー情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    const user = session?.user;
    if (!user) {
      alert("ログインが必要です");
      setLoading(false);
      return;
    }

    if (!liked) {
      // 楽観的更新（先にUIだけ反映）
      setLiked(true);
      setLikeCount((c) => c + 1);

      const { error } = await supabase.from("post_likes").insert({
        post_id: postId,
        user_id: user.id,
      });

      if (error && (error as any).code !== "23505") {
        console.error("like insert error:", error);
        // ロールバック
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        // 通知テーブルを使っているなら（mobile版と合わせて）
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
      // いいね解除
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));

      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);

      if (error) {
        console.error("like delete error:", error);
        // ロールバック
        setLiked(true);
        setLikeCount((c) => c + 1);
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleLike}
        disabled={loading}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-50 disabled:cursor-not-allowed"
        aria-label={liked ? "いいねを取り消す" : "いいね"}
      >
        <Heart
          className="h-5 w-5"
          fill={liked ? "currentColor" : "none"}
          strokeWidth={1.8}
        />
      </button>
      <span className="text-xs text-gray-600">{likeCount}</span>
    </div>
  );
}
