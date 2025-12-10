// src/components/FollowButton.tsx
"use client";

import { useState, useTransition } from "react";

type FollowStatus = "none" | "following" | "requested";

type Props = {
  targetUserId: string;
  targetUsername?: string | null;
  initiallyFollowing: boolean;
  initiallyRequested?: boolean;
  className?: string;
};

export default function FollowButton({
  targetUserId,
  targetUsername,
  initiallyFollowing,
  initiallyRequested = false,
  className,
}: Props) {
  const [status, setStatus] = useState<FollowStatus>(() =>
    initiallyFollowing ? "following" : initiallyRequested ? "requested" : "none"
  );
  const [pending, startTransition] = useTransition();

  const doFollow = () => {
    if (status === "following" || status === "requested") return;

    startTransition(async () => {
      const prev = status;

      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetId: targetUserId,
          targetUsername: targetUsername ?? undefined,
        }),
      });

      if (!res.ok) {
        setStatus(prev);
        return;
      }

      try {
        const json = (await res.json()) as { status?: string };

        if (json.status === "accepted") {
          setStatus("following");
        } else if (json.status === "pending") {
          setStatus("requested");
        } else {
          // サーバーからよく分からない値が来たときのフォールバック
          setStatus("following");
        }
      } catch {
        setStatus("following");
      }
    });
  };

  // フォロー解除 or リクエスト取消
  const doCancelOrUnfollow = () => {
    if (status === "none") return;

    startTransition(async () => {
      const prev = status;

      const qs = new URLSearchParams(
        targetUsername
          ? { targetUsername }
          : { targetId: targetUserId }
      );

      const res = await fetch(`/api/follow?${qs.toString()}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setStatus(prev);
        return;
      }

      setStatus("none");
    });
  };

  if (status === "following") {
    return (
      <button
        type="button"
        onClick={doCancelOrUnfollow}
        disabled={pending}
        className={`rounded-full border border-slate-900 bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 ${className ?? ""}`}
        aria-pressed="true"
      >
        フォロー中
      </button>
    );
  }

  if (status === "requested") {
    return (
      <button
        type="button"
        onClick={doCancelOrUnfollow}
        disabled={pending}
        className={`rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 ${className ?? ""}`}
        aria-pressed="mixed"
      >
        リクエスト中
      </button>
    );
  }

  // status === "none"
  return (
    <button
      type="button"
      onClick={doFollow}
      disabled={pending}
      className={`rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium hover:bg-slate-900 hover:text-white disabled:opacity-50 ${className ?? ""}`}
      aria-pressed="false"
    >
      フォローする
    </button>
  );
}
