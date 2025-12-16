// src/components/MobileHeaderNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Bell,
  MessageCircle,
  UserPlus,
  Plus,
} from "lucide-react";
import { useNavBadges } from "@/hooks/useNavBadges";

function Badge({ count }: { count?: number }) {
  const show = !!count && count > 0;
  return (
    <span
      className={`
        absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center
        rounded-full bg-red-500 px-1 text-[11px] font-bold text-white
        ${show ? "visible" : "invisible"}
      `}
    >
      {count}
    </span>
  );
}

function Dot({ on }: { on?: boolean }) {
  if (!on) return null;
  return <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />;
}

function IconButton({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`
        relative inline-flex h-10 w-10 items-center justify-center rounded-full
        ${active ? "bg-black/[.06]" : "hover:bg-black/[.04]"}
      `}
    >
      {children}
    </Link>
  );
}

export default function MobileHeaderNav({ name }: { name?: string }) {
  const pathname = usePathname();
  const {
    avatarUrl,
    notifCount,
    dmCount,
    followReqCount,
    timelineDot,
    displayNameSafe,
  } = useNavBadges(name);

  const isActive = (p: string) => pathname === p;

  return (
    <div className="md:hidden">
      <header
        className="
          fixed left-0 right-0 top-0 z-50
          bg-white/80 backdrop-blur
          border-b border-black/[.06]
        "
      >
        <div className="h-14 px-3 flex items-center justify-between">
          {/* 左：ロゴ（小さく） */}
          <Link href="/timeline" className="text-[15px] font-bold tracking-tight">
            Gourmeet
          </Link>

          {/* 右：主要導線（省スペース） */}
          <div className="flex items-center gap-1">
            <IconButton href="/timeline" active={isActive("/timeline")}>
              <Home size={20} />
              <Dot on={timelineDot} />
            </IconButton>

            <IconButton href="/search" active={isActive("/search")}>
              <Search size={20} />
            </IconButton>

            {/* Post：常に目立つ丸 */}
            <Link
              href="/posts/new"
              className="
                relative inline-flex h-10 w-10 items-center justify-center
                rounded-full bg-orange-700 text-white
                active:scale-[0.99]
              "
              aria-label="投稿"
            >
              <Plus size={20} />
            </Link>

            <IconButton href="/notifications" active={isActive("/notifications")}>
              <Bell size={20} />
              <Badge count={notifCount} />
            </IconButton>

            {/* follow-requests / messages は好みで入れ替え可 */}
            <IconButton href="/follow-requests" active={isActive("/follow-requests")}>
              <UserPlus size={20} />
              <Badge count={followReqCount} />
            </IconButton>

            <IconButton href="/messages" active={isActive("/messages")}>
              <MessageCircle size={20} />
              <Badge count={dmCount} />
            </IconButton>

            <Link
              href="/account"
              className={`
                relative inline-flex h-10 w-10 items-center justify-center rounded-full
                ${isActive("/account") ? "bg-black/[.06]" : "hover:bg-black/[.04]"}
              `}
              aria-label={displayNameSafe || "プロフィール"}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayNameSafe || "profile"}
                  className="h-8 w-8 rounded-full object-cover bg-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-xs font-semibold text-slate-700">
                  {(displayNameSafe || "U").slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* 固定ヘッダーぶんの押し下げ */}
      <div className="h-14" />
    </div>
  );
}
