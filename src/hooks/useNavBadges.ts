// src/hooks/useNavBadges.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function useNavBadges(initialName?: string) {
  const supabase = createClientComponentClient();
  const pathname = usePathname();

  const [notifCount, setNotifCount] = useState(0);
  const [dmCount, setDmCount] = useState(0);
  const [timelineDot, setTimelineDot] = useState(false);
  const [followReqCount, setFollowReqCount] = useState(0);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>(initialName ?? "");

  // 初期件数 + 自分のプロフィール（avatar等）を取得
  useEffect(() => {
    const fetchCounts = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 自分のプロフィール（アバター）
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      const dn = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
      setDisplayName(dn);
      setAvatarUrl(profile?.avatar_url ?? null);

      // 未読の通知
      const { count: notif } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      setNotifCount(notif ?? 0);

      // 未読のDM
      const { count: dms } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("read", false);
      setDmCount(dms ?? 0);

      // 未読のフォローリクエスト
      const { count: followReq } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("followee_id", user.id)
        .eq("status", "pending")
        .eq("request_read", false);
      setFollowReqCount(followReq ?? 0);

      // 起動直後はドット無し（必要ならここは消してOK）
      setTimelineDot(false);
    };

    fetchCounts();
  }, [supabase]);

  // Realtime 購読（通知 / DM / 投稿 / フォローリクエスト）
  useEffect(() => {
    let channel: any | null = null;
    let subscribed = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !subscribed) return;
      const myId = user.id;

      channel = supabase
        .channel("nav-badges-realtime")

        // 🔔 notifications
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          (payload: any) => {
            if (payload.new.user_id === myId && !payload.new.read) {
              setNotifCount((prev) => prev + 1);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications" },
          (payload: any) => {
            if (
              payload.new.user_id === myId &&
              payload.old.read === false &&
              payload.new.read === true
            ) {
              setNotifCount((prev) => Math.max(prev - 1, 0));
            }
          }
        )

        // 💬 messages
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload: any) => {
            if (payload.new.receiver_id === myId && !payload.new.read) {
              setDmCount((prev) => prev + 1);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          (payload: any) => {
            if (
              payload.new.receiver_id === myId &&
              payload.old.read === false &&
              payload.new.read === true
            ) {
              setDmCount((prev) => Math.max(prev - 1, 0));
            }
          }
        )

        // 📰 posts（誰かが投稿したらホームにドット）
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "posts" },
          () => setTimelineDot(true)
        )

        // 👥 follows（フォローリクエスト）
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "follows" },
          (payload: any) => {
            const row = payload.new;
            if (
              row.followee_id === myId &&
              row.status === "pending" &&
              row.request_read === false
            ) {
              setFollowReqCount((prev) => prev + 1);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "follows" },
          (payload: any) => {
            const oldRow = payload.old;
            const newRow = payload.new;
            if (newRow.followee_id !== myId) return;

            // 未読 → 既読
            if (
              oldRow.status === "pending" &&
              oldRow.request_read === false &&
              newRow.request_read === true
            ) {
              setFollowReqCount((prev) => Math.max(prev - 1, 0));
            }

            // pending 未読のまま accepted
            if (
              oldRow.status === "pending" &&
              oldRow.request_read === false &&
              newRow.status === "accepted"
            ) {
              setFollowReqCount((prev) => Math.max(prev - 1, 0));
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "follows" },
          (payload: any) => {
            const oldRow = payload.old;
            if (
              oldRow.followee_id === myId &&
              oldRow.status === "pending" &&
              oldRow.request_read === false
            ) {
              setFollowReqCount((prev) => Math.max(prev - 1, 0));
            }
          }
        )
        .subscribe();
    })();

    return () => {
      subscribed = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  // 既読処理（開いたらバッジを落とす）
  useEffect(() => {
    if (pathname === "/notifications") {
      fetch("/api/notifications/read", { method: "POST" })
        .then(() => setNotifCount(0))
        .catch((err) => console.error("Failed to mark notifications read:", err));
    }

    if (pathname === "/follow-requests") {
      fetch("/api/follow-requests/read", { method: "POST" })
        .then(() => setFollowReqCount(0))
        .catch((err) => console.error("Failed to mark follow-requests read:", err));
    }

    // ホームに来たらドット消す（好みで）
    if (pathname === "/timeline") {
      setTimelineDot(false);
    }
  }, [pathname]);

  const displayNameSafe = useMemo(() => displayName ?? "", [displayName]);

  return {
    avatarUrl,
    displayNameSafe,
    notifCount,
    dmCount,
    followReqCount,
    timelineDot,
    setTimelineDot,
  };
}
