// src/hooks/useNavBadges.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type NavBadges = {
  isAuthed: boolean;
  myId: string | null;

  avatarUrl: string | null;
  displayNameSafe: string;

  notifCount: number;
  dmCount: number;
  followReqCount: number;
  timelineDot: boolean;

  setTimelineDot: (v: boolean) => void;
  refresh: () => Promise<void>;
};

export function useNavBadges(initialName?: string): NavBadges {
  const supabase = createClientComponentClient();
  const pathname = usePathname();

  const [isAuthed, setIsAuthed] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  const [notifCount, setNotifCount] = useState(0);
  const [dmCount, setDmCount] = useState(0);
  const [followReqCount, setFollowReqCount] = useState(0);
  const [timelineDot, setTimelineDot] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>(initialName ?? "");

  const channelRef = useRef<any | null>(null);

  const displayNameSafe = useMemo(() => displayName ?? "", [displayName]);

  const refresh = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsAuthed(false);
      setMyId(null);

      setNotifCount(0);
      setDmCount(0);
      setFollowReqCount(0);
      setTimelineDot(false);

      setAvatarUrl(null);
      setDisplayName(initialName ?? "");
      return;
    }

    setIsAuthed(true);
    setMyId(user.id);

    // profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    const dn = profile?.display_name ?? user.email?.split("@")[0] ?? "User";
    setDisplayName(dn);
    setAvatarUrl(profile?.avatar_url ?? null);

    // counts
    const { count: notif } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setNotifCount(notif ?? 0);

    const { count: dms } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("read", false);
    setDmCount(dms ?? 0);

    const { count: followReq } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", user.id)
      .eq("status", "pending")
      .eq("request_read", false);
    setFollowReqCount(followReq ?? 0);
  };

  // 初期ロード
  useEffect(() => {
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime subscribe（ログイン時のみ）
  useEffect(() => {
    let alive = true;

    const setup = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive) return;

      // 未ログインなら購読しない
      if (!user) return;

      const my = user.id;

      // 既存チャンネルがあれば破棄
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel("nav-badges-realtime")

        // 🔔 notifications
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          (payload: any) => {
            if (payload?.new?.user_id === my && payload?.new?.read === false) {
              setNotifCount((p) => p + 1);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications" },
          (payload: any) => {
            if (
              payload?.new?.user_id === my &&
              payload?.old?.read === false &&
              payload?.new?.read === true
            ) {
              setNotifCount((p) => Math.max(p - 1, 0));
            }
          }
        )

        // 💬 messages
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload: any) => {
            if (payload?.new?.receiver_id === my && payload?.new?.read === false) {
              setDmCount((p) => p + 1);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          (payload: any) => {
            if (
              payload?.new?.receiver_id === my &&
              payload?.old?.read === false &&
              payload?.new?.read === true
            ) {
              setDmCount((p) => Math.max(p - 1, 0));
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
            const row = payload?.new;
            if (
              row?.followee_id === my &&
              row?.status === "pending" &&
              row?.request_read === false
            ) {
              setFollowReqCount((p) => p + 1);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "follows" },
          (payload: any) => {
            const oldRow = payload?.old;
            const newRow = payload?.new;
            if (!oldRow || !newRow) return;
            if (newRow.followee_id !== my) return;

            // 未読 → 既読
            if (
              oldRow.status === "pending" &&
              oldRow.request_read === false &&
              newRow.request_read === true
            ) {
              setFollowReqCount((p) => Math.max(p - 1, 0));
            }

            // pending 未読のまま accepted
            if (
              oldRow.status === "pending" &&
              oldRow.request_read === false &&
              newRow.status === "accepted"
            ) {
              setFollowReqCount((p) => Math.max(p - 1, 0));
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "follows" },
          (payload: any) => {
            const oldRow = payload?.old;
            if (
              oldRow?.followee_id === my &&
              oldRow?.status === "pending" &&
              oldRow?.request_read === false
            ) {
              setFollowReqCount((p) => Math.max(p - 1, 0));
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    };

    setup().catch(() => {});

    return () => {
      alive = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase]);

  // 既読処理（ページに入ったらバッジ落とす）
  useEffect(() => {
    if (pathname === "/notifications") {
      fetch("/api/notifications/read", { method: "POST" })
        .then(() => setNotifCount(0))
        .catch(() => {});
    }

    if (pathname === "/follow-requests") {
      fetch("/api/follow-requests/read", { method: "POST" })
        .then(() => setFollowReqCount(0))
        .catch(() => {});
    }

    if (pathname === "/timeline") {
      setTimelineDot(false);
    }
  }, [pathname]);

  return {
    isAuthed,
    myId,

    avatarUrl,
    displayNameSafe,

    notifCount,
    dmCount,
    followReqCount,
    timelineDot,

    setTimelineDot,
    refresh,
  };
}
