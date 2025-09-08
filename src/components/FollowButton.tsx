// src/components/FollowButton.tsx
"use client";

import { useState, useTransition } from "react";
import { supabase } from "@/lib/supabase/client";

type Props = {
  targetUserId: string;
  targetUsername?: string | null;
  initiallyFollowing: boolean;
  className?: string;
};

export default function FollowButton({
  targetUserId,
  targetUsername,
  initiallyFollowing,
  className,
}: Props) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [pending, startTransition] = useTransition();

  const doFollow = () => {
    startTransition(async () => {
      setFollowing(true); // 楽観反映
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetId: targetUserId,
          targetUsername: targetUsername ?? undefined,
        }),
      });
      if (!res.ok) setFollowing(false);
    });
  };

  const doUnfollow = () => {
    startTransition(async () => {
      setFollowing(false); // 楽観反映
      const qs = new URLSearchParams(
        targetUsername ? { targetUsername } : { targetId: targetUserId }
      );
      const res = await fetch(`/api/follow?${qs.toString()}`, { method: "DELETE" });
      if (!res.ok) setFollowing(true);
    });
  };

  if (following) {
    return (
      <button
        type="button"
        onClick={doUnfollow}
        disabled={pending}
        className={`rounded-lg border px-4 py-1.5 text-sm font-medium bg-black text-white hover:opacity-90 disabled:opacity-50 ${className ?? ""}`}
        aria-pressed="true"
      >
        フォロー中
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={doFollow}
      disabled={pending}
      className={`rounded-lg border px-4 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 ${className ?? ""}`}
      aria-pressed="false"
    >
      フォローする
    </button>
  );
}
