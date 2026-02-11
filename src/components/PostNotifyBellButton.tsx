"use client";

import React, { useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Bell, BellOff } from "lucide-react";

export default function PostNotifyBellButton({
  targetUserId,
  canToggle,          // acceptedフォローならtrue
  initiallyEnabled,   // 初期状態（true/false）
  size = "md",
}: {
  targetUserId: string;
  canToggle: boolean;
  initiallyEnabled: boolean;
  size?: "sm" | "md";
}) {
  const supabase = createClientComponentClient();
  const [enabled, setEnabled] = useState<boolean>(!!initiallyEnabled);
  const [busy, setBusy] = useState(false);

  const ui = useMemo(() => {
    const base =
      "inline-flex items-center justify-center rounded-full border font-semibold transition select-none";
    const dim = size === "sm" ? "h-9 w-9" : "h-10 w-10";

    if (!canToggle) {
      return {
        className: `${base} ${dim} border-slate-200 bg-white text-slate-300`,
        title: "フォローしている人だけ通知をONにできます",
        Icon: BellOff,
      };
    }

    if (enabled) {
      return {
        className: `${base} ${dim} border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100`,
        title: "投稿通知：ON（クリックでOFF）",
        Icon: Bell,
      };
    }

    return {
      className: `${base} ${dim} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`,
      title: "投稿通知：OFF（クリックでON）",
      Icon: BellOff,
    };
  }, [enabled, canToggle, size]);

  const toggle = async () => {
    if (!canToggle || busy) return;

    setBusy(true);
    const next = !enabled;
    setEnabled(next); // optimistic

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message);
      const me = authData.user?.id;
      if (!me) throw new Error("not logged in");

      if (next) {
        // ON: upsert enabled=true（行が無くても作れる。RLSでacceptedフォロー必須）
        const { error } = await supabase
          .from("user_post_subscriptions")
          .upsert(
            { user_id: me, target_user_id: targetUserId, enabled: true },
            { onConflict: "user_id,target_user_id" }
          );
        if (error) throw new Error(error.message);
      } else {
        // OFF: update enabled=false（delete運用でもOKだが、ここはフラグにする）
        const { error } = await supabase
          .from("user_post_subscriptions")
          .update({ enabled: false })
          .eq("user_id", me)
          .eq("target_user_id", targetUserId);
        if (error) throw new Error(error.message);
      }
    } catch (e: any) {
      // rollback
      setEnabled((prev) => !prev);
      console.error("bell toggle error:", e?.message ?? e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={ui.className}
      title={ui.title}
      aria-pressed={canToggle ? enabled : undefined}
      disabled={!canToggle || busy}
    >
      <ui.Icon size={18} />
    </button>
  );
}
