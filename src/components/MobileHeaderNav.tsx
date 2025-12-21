"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Bell,
  UserPlus,
  Plus,
  MapPin,
  CircleDollarSign,
  Settings,
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
  ariaLabel,
  activeClassName,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
  activeClassName?: string; // ✅ active背景を各アイコンで変える
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`
        relative inline-flex h-11 w-11 items-center justify-center rounded-full
        transition-colors
        ${active ? activeClassName ?? "bg-black/[.06]" : "hover:bg-black/[.04]"}
      `}
    >
      {children}
    </Link>
  );
}

export default function MobileHeaderNav({ name }: { name?: string }) {
  const pathname = usePathname();
  const { avatarUrl, notifCount, followReqCount, timelineDot, displayNameSafe } =
    useNavBadges(name);

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  return (
    <div className="md:hidden">
      <header
        className="
          sticky top-0 z-50
          border-b border-black/[.06]
          bg-white/90 backdrop-blur
          pt-[env(safe-area-inset-top)]
        "
      >
        {/* 1段目：サブnav（ポイント/通知/フォロリク/アカウント） */}
        <div className="flex h-12 items-center justify-between px-3">
          <Link href="/timeline" className="text-[15px] font-bold tracking-tight">
            Gourmeet
          </Link>

          <div className="flex items-center gap-1">
            {/* Points */}
            <IconButton
              href="/points"
              active={isActive("/points")}
              ariaLabel="ポイント"
              activeClassName="bg-amber-100/70"
            >
              <CircleDollarSign size={20} className="text-amber-600" />
            </IconButton>

            {/* 通知 */}
            <IconButton
              href="/notifications"
              active={isActive("/notifications")}
              ariaLabel="通知"
              activeClassName="bg-violet-100/70"
            >
              <Bell size={20} className="text-violet-600" />
              <Badge count={notifCount} />
            </IconButton>

            {/* フォローリクエスト */}
            <IconButton
              href="/follow-requests"
              active={isActive("/follow-requests")}
              ariaLabel="フォローリクエスト"
              activeClassName="bg-sky-100/70"
            >
              <UserPlus size={20} className="text-sky-600" />
              <Badge count={followReqCount} />
            </IconButton>

            {/* Account */}
            <Link
              href="/account"
              className={`
                relative inline-flex h-10 w-10 items-center justify-center rounded-full
                transition-colors
                ${isActive("/account") ? "bg-slate-100" : "hover:bg-black/[.04]"}
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

        {/* 2段目：メインnav（右端=Settings） */}
        <div className="px-2 pb-2">
          <div className="flex items-center justify-between gap-1 rounded-2xl bg-black/[.03] px-2 py-1">
            <IconButton
              href="/timeline"
              active={isActive("/timeline")}
              ariaLabel="ホーム"
              activeClassName="bg-blue-100/70"
            >
              <Home size={20} className="text-blue-600" />
              <Dot on={timelineDot} />
            </IconButton>

            <IconButton
              href="/search"
              active={isActive("/search")}
              ariaLabel="検索"
              activeClassName="bg-slate-100"
            >
              <Search size={20} className="text-slate-700" />
            </IconButton>

            <Link
              href="/posts/new"
              className="
                relative inline-flex h-11 w-11 items-center justify-center
                rounded-full bg-orange-700 text-white
                active:scale-[0.99]
              "
              aria-label="投稿"
            >
              <Plus size={20} />
            </Link>

            <IconButton
              href="/map"
              active={isActive("/map")}
              ariaLabel="マップ"
              activeClassName="bg-emerald-100/70"
            >
              <MapPin size={20} className="text-emerald-700" />
            </IconButton>

            <IconButton
              href="/settings"
              active={isActive("/settings")}
              ariaLabel="設定"
              activeClassName="bg-slate-100"
            >
              <Settings size={20} className="text-slate-700" />
            </IconButton>
          </div>
        </div>
      </header>
    </div>
  );
}
