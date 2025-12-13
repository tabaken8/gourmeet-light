// src/components/Sidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Bell,
  MessageCircle,
  Bookmark,
  UserRound,
  Plus,
  UserPlus,
  LogOut,
} from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function NavItem({
  href,
  label,
  icon: Icon,
  count,
  dot,
}: {
  href: string;
  label: string;
  icon: any;
  count?: number;
  dot?: boolean;
}) {
  return (
    <Link
      href={href}
      className="
        flex items-center gap-3 rounded-lg px-3 py-2 text-base
        hover:bg-gray-100
      "
    >
      <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
        <Icon size={22} />
        <span
          className={`
            absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center
            rounded-full bg-red-500 px-1 text-[11px] font-bold text-white
            ${count && count > 0 ? "visible" : "invisible"}
          `}
        >
          {count}
        </span>
        {dot && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
        )}
      </div>

      {/* ラベル：サイドバー hover で表示 */}
      <span
        className="
          overflow-hidden whitespace-nowrap
          max-w-0 opacity-0 translate-x-[-4px]
          transition-all duration-200
          group-hover:max-w-[180px] group-hover:opacity-100 group-hover:translate-x-0
        "
      >
        {label}
      </span>
    </Link>
  );
}

export default function Sidebar({ name }: { name?: string }) {
  const supabase = createClientComponentClient();
  const pathname = usePathname();

  const [notifCount, setNotifCount] = useState(0);
  const [dmCount, setDmCount] = useState(0);
  const [timelineDot, setTimelineDot] = useState(false);
  const [followReqCount, setFollowReqCount] = useState(0);

  // 初期件数を取得
  useEffect(() => {
    const fetchCounts = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

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
        .channel("sidebar-realtime")
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

  // /notifications や /follow-requests を開いたら既読処理
  useEffect(() => {
    if (pathname === "/notifications") {
      fetch("/api/notifications/read", { method: "POST" })
        .then(() => setNotifCount(0))
        .catch((err) =>
          console.error("Failed to mark notifications read:", err)
        );
    }

    if (pathname === "/follow-requests") {
      fetch("/api/follow-requests/read", { method: "POST" })
        .then(() => setFollowReqCount(0))
        .catch((err) =>
          console.error("Failed to mark follow-requests read:", err)
        );
    }
  }, [pathname]);

  return (
    <aside
      className="
        hidden md:flex flex-col justify-between
        h-screen border-r border-gray-200 bg-white
        fixed left-0 top-0
        px-3 py-6
        w-[72px] hover:w-[240px]
        transition-[width] duration-200
        group
      "
    >
      {/* ロゴ：ホバー時だけ表示 */}
      <div className="mb-6 px-1">
        <div
          className="
            text-xl font-bold tracking-tight
            overflow-hidden whitespace-nowrap
            max-w-0 opacity-0
            transition-all duration-200
            group-hover:max-w-[200px] group-hover:opacity-100
          "
        >
          Gourmeet
        </div>
      </div>

      <nav className="flex flex-col gap-2">
        <NavItem href="/timeline" label="ホーム" icon={Home} dot={timelineDot} />
        <NavItem href="/search" label="検索" icon={Search} />
        <NavItem
          href="/notifications"
          label="通知"
          icon={Bell}
          count={notifCount}
        />
        <NavItem
          href="/follow-requests"
          label="フォローリクエスト"
          icon={UserPlus}
          count={followReqCount}
        />
        <NavItem
          href="/messages"
          label="メッセージ(随時実装予定)"
          icon={MessageCircle}
          count={dmCount}
        />
        <NavItem href="/collection" label="コレクション" icon={Bookmark} />
        <NavItem href="/account" label="プロフィール" icon={UserRound} />

        {/* Postボタン：畳んでるときはアイコンだけ */}
        <Link
          href="/posts/new"
          className="
            mt-4 flex items-center justify-center gap-2
            rounded-full bg-orange-700 py-3 text-white font-semibold
            hover:bg-orange-800
          "
        >
          <Plus size={18} className="shrink-0" />
          <span
            className="
              overflow-hidden whitespace-nowrap
              max-w-0 opacity-0 translate-x-[-4px]
              transition-all duration-200
              group-hover:max-w-[140px] group-hover:opacity-100 group-hover:translate-x-0
            "
          >
            Post
          </span>
        </Link>
      </nav>

      {/* フッター：ホバーで詳細表示 */}
      <div className="mt-6 text-sm text-gray-600 px-1">
        <div
          className="
            truncate font-semibold
            overflow-hidden whitespace-nowrap
            max-w-0 opacity-0
            transition-all duration-200
            group-hover:max-w-[200px] group-hover:opacity-100
          "
        >
          {name}
        </div>

        <form action="/auth/logout" method="post">
          <button
            className="
              mt-2 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-100
              w-full
            "
          >
            <LogOut size={18} className="shrink-0" />
            <span
              className="
                overflow-hidden whitespace-nowrap
                max-w-0 opacity-0 translate-x-[-4px]
                transition-all duration-200
                group-hover:max-w-[140px] group-hover:opacity-100 group-hover:translate-x-0
              "
            >
              ログアウト
            </span>
          </button>
        </form>
      </div>
    </aside>
  );
}
