"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type FollowStatus = "none" | "following" | "requested";

/**
 * ✅ 互換Props
 * - 旧: targetUserId / initiallyFollowing / initiallyRequested / className / targetUsername
 * - 新: targetId / initialFollowing / mode / size
 */
type Props = {
  // --- old style ---
  targetUserId?: string;
  targetUsername?: string | null;
  initiallyFollowing?: boolean;
  initiallyRequested?: boolean;

  // --- new style ---
  targetId?: string;
  initialFollowing?: boolean;
  mode?: "follow" | "followback";
  size?: "sm" | "md";

  // common
  className?: string;
};

export default function FollowButton(props: Props) {
  // ✅ alias吸収（Hooksより前にreturnしない）
  const targetUserId = (props.targetUserId ?? props.targetId ?? "").trim();
  const targetUsername = (props.targetUsername ?? null)?.trim() || null;

  const initiallyFollowing = props.initiallyFollowing ?? props.initialFollowing ?? false;
  const initiallyRequested = props.initiallyRequested ?? false;

  const mode = props.mode ?? "follow";
  const size = props.size ?? "sm";
  const className = props.className ?? "";

  const validTarget = Boolean(targetUserId || targetUsername);

  // ✅ Hooks（常に同じ順で呼ばれる）
  const initialStatus: FollowStatus = initiallyFollowing
    ? "following"
    : initiallyRequested
    ? "requested"
    : "none";

  const [status, setStatus] = useState<FollowStatus>(initialStatus);
  const [pending, startTransition] = useTransition();

  // props側がSSR→CSRでズレる時だけ追随（無限ループ回避：差分ある時だけ）
  useEffect(() => {
    if (status !== initialStatus) setStatus(initialStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiallyFollowing, initiallyRequested]); // initialStatusを直接入れると意図せず再計算が増えるので分解

  const sizeCls = useMemo(() => {
    if (size === "md") return "px-4 py-1.5 text-sm";
    return "px-3 py-1 text-[12px]";
  }, [size]);

  const followLabel = useMemo(
    () => (mode === "followback" ? "フォローバック" : "フォローする"),
    [mode]
  );

  const doFollow = () => {
    if (!validTarget) {
      console.error("FollowButton: targetUserId/targetId or targetUsername is required");
      return;
    }
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
    if (!validTarget) {
      console.error("FollowButton: targetUserId/targetId or targetUsername is required");
      return;
    }
    if (status === "none") return;

    startTransition(async () => {
      const prev = status;

      const qs = new URLSearchParams(
        targetUsername ? { targetUsername } : { targetId: targetUserId }
      );

      const res = await fetch(`/api/follow?${qs.toString()}`, { method: "DELETE" });

      if (!res.ok) {
        setStatus(prev);
        return;
      }

      setStatus("none");
    });
  };

  // --- UI ---
  const common = [
    "rounded-full border font-medium disabled:opacity-50",
    sizeCls,
    className,
  ].join(" ");

  if (status === "following") {
    return (
      <button
        type="button"
        onClick={doCancelOrUnfollow}
        disabled={pending || !validTarget}
        className={[
          common,
          "border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
        ].join(" ")}
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
        disabled={pending || !validTarget}
        className={[
          common,
          "border-slate-400 bg-white text-slate-800 hover:bg-slate-100",
        ].join(" ")}
        aria-pressed="mixed"
      >
        リクエスト済み
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={doFollow}
      disabled={pending || !validTarget}
      className={[
        common,
        "border-slate-900 bg-slate-900 text-white hover:opacity-90",
      ].join(" ")}
      aria-pressed="false"
      title={!validTarget ? "targetId（またはtargetUserId/targetUsername）が必要です" : undefined}
    >
      {followLabel}
    </button>
  );
}
