"use client";

import { useState } from "react";
import { Heart, MapPin, Bookmark } from "lucide-react";

type Props = {
  postId: string;
  postUserId: string; // 👈 投稿者のIDを追加
  initialLiked: boolean;
  initialWanted: boolean;
  initialBookmarked: boolean;
  initialLikeCount: number;
  initialWantCount: number;
  initialBookmarkCount: number;
};

export default function PostActions({
  postId,
  postUserId,
  initialLiked,
  initialWanted,
  initialBookmarked,
  initialLikeCount,
  initialWantCount,
  initialBookmarkCount,
}: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);

  const [wanted, setWanted] = useState(initialWanted);
  const [wantCount, setWantCount] = useState(initialWantCount);

  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [bookmarkCount, setBookmarkCount] = useState(initialBookmarkCount);

  const toggle = async (
    type: "like" | "want" | "bookmark",
    state: boolean,
    setState: (v: boolean) => void,
    count: number,
    setCount: (n: number) => void
  ) => {
    // フロント側で即時反映
    setState(!state);
    setCount(count + (state ? -1 : 1));

    try {
      // サーバーAPIを呼んでDB & 通知を更新
      await fetch(`/posts/${postId}/${type}/toggle`, {
        method: "POST",
        body: JSON.stringify({ postUserId }), // 👈 投稿者IDを送る
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex items-center gap-6 px-4 pb-3">
      {/* Like */}
      <button
        onClick={() => toggle("like", liked, setLiked, likeCount, setLikeCount)}
        className={`transition-transform hover:scale-110 ${
          liked ? "text-red-500" : "text-black/70"
        }`}
      >
        <Heart
          size={26}
          fill={liked ? "currentColor" : "none"}
          strokeWidth={liked ? 0 : 2}
        />
        <span className="ml-1 text-sm">{likeCount}</span>
      </button>

      {/* Want */}
      <button
        onClick={() => toggle("want", wanted, setWanted, wantCount, setWantCount)}
        className={`transition-transform hover:scale-110 ${
          wanted ? "text-blue-500" : "text-black/70"
        }`}
      >
        <MapPin
          size={26}
          fill={wanted ? "currentColor" : "none"}
          strokeWidth={wanted ? 0 : 2}
        />
        <span className="ml-1 text-sm">{wantCount}</span>
      </button>

      {/* Bookmark */}
      <button
        onClick={() =>
          toggle("bookmark", bookmarked, setBookmarked, bookmarkCount, setBookmarkCount)
        }
        className={`transition-transform hover:scale-110 ${
          bookmarked ? "text-yellow-500" : "text-black/70"
        }`}
      >
        <Bookmark
          size={26}
          fill={bookmarked ? "currentColor" : "none"}
          strokeWidth={bookmarked ? 0 : 2}
        />
        <span className="ml-1 text-sm">{bookmarkCount}</span>
      </button>
    </div>
  );
}
