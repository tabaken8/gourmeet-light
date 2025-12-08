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
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-base hover:bg-gray-100"
    >
      <div className="relative w-6 h-6 flex items-center justify-center">
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
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500"></span>
        )}
      </div>
      <span>{label}</span>
    </Link>
  );
}

export default function Sidebar({ name }: { name: string }) {
  const supabase = createClientComponentClient();
  const pathname = usePathname();

  const [notifCount, setNotifCount] = useState(0);
  const [dmCount, setDmCount] = useState(0);
  const [timelineDot, setTimelineDot] = useState(false);

  // 初期件数を取得
  useEffect(() => {
    const fetchCounts = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

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

      setTimelineDot(false);
    };

    fetchCounts();
  }, [supabase]);

  // Realtime 購読
  useEffect(() => {
    const channel = supabase
      .channel("sidebar-realtime")
      // 🔔 notifications
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => setNotifCount((prev) => prev + 1)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload) => {
          if (payload.new.read) {
            setNotifCount((prev) => Math.max(prev - 1, 0));
          }
        }
      )
      // 💬 messages
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => setDmCount((prev) => prev + 1)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          if (payload.new.read) {
            setDmCount((prev) => Math.max(prev - 1, 0));
          }
        }
      )
      // 📰 posts
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        () => setTimelineDot(true)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // /notifications ページを開いたら既読処理
  useEffect(() => {
    if (pathname === "/notifications") {
      fetch("/api/notifications/read", { method: "POST" })
        .then(() => setNotifCount(0))
        .catch((err) =>
          console.error("Failed to mark notifications read:", err)
        );
    }
  }, [pathname]);

  return (
    <aside className="hidden md:flex flex-col justify-between w-[240px] h-screen border-r border-gray-200 bg-white px-4 py-6 fixed left-0 top-0">
      <div className="mb-6 text-xl font-bold tracking-tight">Gourmeet</div>

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
          href="/messages"
          label="メッセージ"
          icon={MessageCircle}
          count={dmCount}
        />
        <NavItem href="/collection" label="コレクション" icon={Bookmark} />
        <NavItem href="/account" label="プロフィール" icon={UserRound} />

        <Link
          href="/posts/new"
          className="mt-4 flex items-center justify-center gap-2 rounded-full bg-orange-700 py-3 text-white font-semibold hover:bg-orange-800"
        >
          <Plus size={18} />
          Post
        </Link>
      </nav>

      <div className="mt-6 text-sm text-gray-600">
        <div className="truncate font-semibold">{name}</div>
        <form action="/auth/logout" method="post">
          <button className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-100">
            ログアウト
          </button>
        </form>
      </div>
    </aside>
  );
}
