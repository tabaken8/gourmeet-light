// src/components/FollowButton.tsx
"use client";

import { useMemo, useState, useTransition } from "react";

type FollowStatus = "none" | "following" | "requested";

/**
 * ✅ 互換Props
 * - 旧: targetUserId / initiallyFollowing / initiallyRequested / className / targetUsername
 * - 新: targetId / initialFollowing / mode / size
 *
 * どっちで呼んでも動くようにしてある
 */
type Props = {
  // --- old style ---
  targetUserId?: string;
  targetUsername?: string | null;
  initiallyFollowing?: boolean;
  initiallyRequested?: boolean;

  // --- new style (timeline/suggestで使いたい) ---
  targetId?: string; // targetUserId の別名
  initialFollowing?: boolean; // initiallyFollowing の別名
  mode?: "follow" | "followback"; // ラベル用
  size?: "sm" | "md"; // 見た目用

  // common
  className?: string;
};

export default function FollowButton(props: Props) {
  // idの別名吸収
  const targetUserId = props.targetUserId ?? props.targetId ?? "";
  const targetUsername = props.targetUsername ?? null;

  // 初期状態の別名吸収
  const initiallyFollowing = props.initiallyFollowing ?? props.initialFollowing ?? false;
  const initiallyRequested = props.initiallyRequested ?? false;

  const mode = props.mode ?? "follow";
  const size = props.size ?? "sm";
  const className = props.className ?? "";

  if (!targetUserId && !targetUsername) {
    // devで早めに気づけるように
    console.error("FollowButton: targetUserId/targetId or targetUsername is required");
    return null;
  }

  const [status, setStatus] = useState<FollowStatus>(() =>
    initiallyFollowing ? "following" : initiallyRequested ? "requested" : "none"
  );
  const [pending, startTransition] = useTransition();

  const sizeCls = useMemo(() => {
    // 既存の px/py を size で揃える
    // md: timelineカード右上など想定 / sm: 小さめ
    if (size === "md") return "px-4 py-1.5 text-sm";
    return "px-3 py-1 text-[12px]";
  }, [size]);

  const doFollow = () => {
    if (status === "following" || status === "requested") return;

    startTransition(async () => {
      const prev = status;

      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetId: targetUserId || undefined,
          targetUsername: targetUsername ?? undefined,
        }),
      });

      if (!res.ok) {
        setStatus(prev);
        return;
      }

      try {
        const json = (await res.json()) as { status?: string };
        if (json.status === "accepted") setStatus("following");
        else if (json.status === "pending") setStatus("requested");
        else setStatus("following");
      } catch {
        setStatus("following");
      }
    });
  };

  const doCancelOrUnfollow = () => {
    if (status === "none") return;

    startTransition(async () => {
      const prev = status;

      const qs = new URLSearchParams(
        targetUsername ? { targetUsername } : { targetId: targetUserId }
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

  // ---- UI labels ----
  const followLabel = mode === "followback" ? "フォローバック" : "フォローする";

  /** --------------------------
   *  following
   * -------------------------- */
  if (status === "following") {
    return (
      <button
        type="button"
        onClick={doCancelOrUnfollow}
        disabled={pending}
        className={[
          "rounded-full border border-slate-300 bg-white font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50",
          sizeCls,
          className,
        ].join(" ")}
        aria-pressed="true"
      >
        フォロー中
      </button>
    );
  }

  /** --------------------------
   *  requested
   * -------------------------- */
  if (status === "requested") {
    return (
      <button
        type="button"
        onClick={doCancelOrUnfollow}
        disabled={pending}
        className={[
          "rounded-full border border-slate-400 bg-white font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50",
          sizeCls,
          className,
        ].join(" ")}
        aria-pressed="mixed"
      >
        リクエスト済み
      </button>
    );
  }

  /** --------------------------
   *  none
   * -------------------------- */
  return (
    <button
      type="button"
      onClick={doFollow}
      disabled={pending}
      className={[
        "rounded-full border border-slate-900 bg-slate-900 font-medium text-white hover:opacity-90 disabled:opacity-50",
        sizeCls,
        className,
      ].join(" ")}
      aria-pressed="false"
    >
      {followLabel}
    </button>
  );
}
