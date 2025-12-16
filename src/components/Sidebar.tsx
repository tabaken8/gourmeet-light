// src/components/Sidebar.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Bell,
  MessageCircle,
  Bookmark,
  Plus,
  UserPlus,
  LogOut,
  UserRound,
} from "lucide-react";

import { useNavBadges } from "@/hooks/useNavBadges";

function NavItem({
  href,
  label,
  icon: Icon,
  count,
  dot,
  avatarUrl,
  avatarAlt,
}: {
  href: string;
  label: string;
  icon?: any;
  count?: number;
  dot?: boolean;
  avatarUrl?: string | null;
  avatarAlt?: string;
}) {
  return (
    <Link
      href={href}
      className="
        flex items-center gap-3 rounded-lg px-3 py-2 text-base
        hover:bg-gray-100/80
      "
    >
      <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={avatarAlt ?? "profile"}
            className="h-6 w-6 rounded-full object-cover bg-slate-200"
            referrerPolicy="no-referrer"
          />
        ) : Icon ? (
          <Icon size={22} />
        ) : (
          <UserRound size={22} />
        )}

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
  const pathname = usePathname();

  const {
    avatarUrl,
    displayNameSafe,
    notifCount,
    dmCount,
    followReqCount,
    timelineDot,
  } = useNavBadges(name);

  const displayNameMemo = useMemo(() => displayNameSafe ?? "", [displayNameSafe]);

  return (
    <aside
      className="
        hidden md:flex flex-col justify-between
        h-screen
        fixed left-0 top-0
        px-3 py-6
        w-[72px] hover:w-[240px]
        transition-[width] duration-200
        group
        bg-white/80 backdrop-blur
        shadow-[0_0_40px_rgba(0,0,0,0.06)]
      "
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-r from-transparent to-white/80" />

      <div className="mb-6 px-1 relative">
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

      <nav className="flex flex-col gap-2 relative">
        <NavItem href="/timeline" label="ホーム" icon={Home} dot={timelineDot} />
        <NavItem href="/search" label="検索" icon={Search} />
        <NavItem href="/notifications" label="通知" icon={Bell} count={notifCount} />
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

        <NavItem
          href="/account"
          label="プロフィール"
          avatarUrl={avatarUrl}
          avatarAlt={displayNameMemo}
        />

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

      <div className="mt-6 text-sm text-gray-600 px-1 relative">
        <div
          className="
            truncate font-semibold
            overflow-hidden whitespace-nowrap
            max-w-0 opacity-0
            transition-all duration-200
            group-hover:max-w-[200px] group-hover:opacity-100
          "
        >
          {displayNameMemo}
        </div>

        <form action="/auth/logout" method="post">
          <button
            className="
              mt-2 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-100/80
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
