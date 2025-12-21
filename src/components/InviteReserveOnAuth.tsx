"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function normalizeInvite(raw: string) {
  return (raw || "").trim().replace(/\s+/g, "").toUpperCase();
}

export default function InviteReserveOnAuth() {
  const supabase = createClientComponentClient();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // ログインしてなければ何もしない（auth.uid() がない）
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) return;

      const code = normalizeInvite(localStorage.getItem("pending_invite") || "");
      if (!code) return;

      // 予約を何度も叩かない保険（同一codeで1回だけ）
      const last = localStorage.getItem("pending_invite_reserved");
      if (last === code) return;

      try {
        const res = await fetch("/api/invites/reserve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const json = await res.json().catch(() => ({}));

        // 成功扱いなら二重実行防止を入れる
        if (res.ok && (json?.ok ?? true)) {
          localStorage.setItem("pending_invite_reserved", code);
          // 以後のために pending_invite を消してもOK（好み）
          // localStorage.removeItem("pending_invite");
        } else {
          // 失敗でも、ユーザーのために pending_invite は残しておく（再試行できる）
          console.warn("reserve failed", json);
        }
      } catch (e) {
        console.warn("reserve failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return null;
}
