// src/components/Sidebar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Compass,
  Bell,
  Bookmark,
  Plus,
  UserPlus,
  LogOut,
  UserRound,
  Settings,
} from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { useNavBadges } from "@/hooks/useNavBadges";

function NavItem({
  href,
  label,
  icon: Icon,
  count,
  dot,
  avatarUrl,
  avatarAlt,
  active,
}: {
  href: string;
  label: string;
  icon?: any;
  count?: number;
  dot?: boolean;
  avatarUrl?: string | null;
  avatarAlt?: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group/item flex items-center gap-3 rounded-lg px-3 py-2 text-base transition-colors",
        active
          ? "bg-slate-200/70 dark:bg-white/10"
          : "hover:bg-gray-100/80 dark:hover:bg-white/[.06]",
      ].join(" ")}
    >
      <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={avatarAlt ?? "profile"}
            className="h-6 w-6 rounded-full object-cover bg-slate-200 dark:bg-white/10"
            referrerPolicy="no-referrer"
          />
        ) : Icon ? (
          <Icon
            size={22}
            className={active ? "text-slate-800 dark:text-gray-200" : "text-slate-500 dark:text-gray-400"}
          />
        ) : (
          <UserRound size={22} className="text-slate-500 dark:text-gray-400" />
        )}

        <span
          className={`
            absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center
            rounded-full bg-red-500 px-1 text-[11px] font-bold text-!white
            ${count && count > 0 ? "visible" : "invisible"}
          `}
        >
          {count}
        </span>

        {dot && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />}
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
  const { isAuthed, avatarUrl, displayNameSafe, notifCount, followReqCount, timelineDot } =
    useNavBadges(name);

  const supabase = createClientComponentClient();
  const displayNameMemo = useMemo(() => displayNameSafe ?? "", [displayNameSafe]);

  const gate = (href: string, _allowGuest = false) => href;

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  // ロゴ/ホームは friends tab に統一
  const homeHref = "/timeline?tab=friends";

  return (
    <aside
      className="
        hidden md:flex flex-col justify-between
        h-screen
        fixed left-0 top-0
        px-3 py-6
        w-[72px] hover:w-[260px]
        transition-[width] duration-200
        group
        bg-white/80 backdrop-blur
        shadow-[0_0_40px_rgba(0,0,0,0.06)]
        dark:bg-[#12131a]/90 dark:shadow-[0_0_40px_rgba(0,0,0,0.3)]
      "
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-r from-transparent to-white/80 dark:to-[#12131a]/90" />

      <div className="mb-6 px-1 relative">
        <div
          className="
            overflow-hidden whitespace-nowrap
            max-w-0 opacity-0
            transition-all duration-200
            group-hover:max-w-[220px] group-hover:opacity-100
          "
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mobile.svg" alt="Gourmeet" className="h-10 w-auto" />
        </div>
      </div>

      <nav className="flex flex-col gap-2 relative">
        <NavItem
          href={gate(homeHref)}
          label="ホーム"
          icon={Home}
          dot={timelineDot}
          active={isActive("/timeline")}
        />

        <NavItem
          href={gate("/search", true)}
          label="発見"
          icon={Compass}
          active={isActive("/search")}
        />

        <NavItem
          href={gate("/collection")}
          label="コレクション"
          icon={Bookmark}
          active={isActive("/collection")}
        />

        <div className="my-2 h-px bg-black/[.08] dark:bg-white/[.08]" />

        <NavItem
          href={gate("/notifications")}
          label="通知"
          icon={Bell}
          count={notifCount}
          active={isActive("/notifications")}
        />

        <NavItem
          href={gate("/follow-requests")}
          label="フォローリクエスト"
          icon={UserPlus}
          count={followReqCount}
          active={isActive("/follow-requests")}
        />

        <NavItem
          href={gate("/settings")}
          label="設定"
          icon={Settings}
          active={isActive("/settings")}
        />

        <NavItem
          href={gate("/profile")}
          label="プロフィール"
          avatarUrl={avatarUrl}
          avatarAlt={displayNameMemo}
          active={isActive("/profile")}
        />

        {/* Post CTA */}
        <div className="mt-4">
          <Link
            href={gate("/posts/new")}
            className="flex items-center justify-center gap-2 rounded-full py-3 font-semibold bg-orange-700 !text-white hover:bg-orange-800 transition"
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
        </div>
      </nav>

      <div className="mt-6 text-sm text-gray-600 dark:text-gray-400 px-1 relative">
        <div
          className="
            truncate font-semibold
            overflow-hidden whitespace-nowrap
            max-w-0 opacity-0
            transition-all duration-200
            group-hover:max-w-[220px] group-hover:opacity-100
          "
        >
          {displayNameMemo}
        </div>

        <form action="/auth/logout" method="post">
          <button
            className="
              mt-2 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-100/80 dark:hover:bg-white/[.06]
              w-full
            "
          >
            <LogOut size={18} className="shrink-0 text-slate-500 dark:text-gray-400" />
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
