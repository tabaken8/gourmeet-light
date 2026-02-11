"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Home,
  Search,
  Bell,
  UserPlus,
  Plus,
  MapPin,
  CircleDollarSign,
  MessagesSquare,
  Sparkles,
  Settings, // ✅ 追加
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

function AIChatIcon({ size = 20 }: { size?: number }) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <MessagesSquare size={size} className="text-orange-700" />
      <Sparkles
        size={Math.max(12, Math.floor(size * 0.58))}
        className="absolute -right-1 -top-1 text-orange-600"
      />
    </span>
  );
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
  children: ReactNode;
  ariaLabel?: string;
  activeClassName?: string;
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

function getGourmeetDayKey(now = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(dtf.formatToParts(now).map((p) => [p.type, p.value])) as any;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour);

  let day = new Date(Date.UTC(y, m - 1, d));
  if (h < 4) day = new Date(day.getTime() - 24 * 60 * 60 * 1000);

  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function MobileHeaderNav({ name }: { name?: string }) {
  const pathname = usePathname();
  const supabase = createClientComponentClient();

  const { isAuthed, avatarUrl, notifCount, followReqCount, timelineDot, displayNameSafe } =
    useNavBadges(name);

  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const gate = (href: string, allowGuest = false) => {
    if (allowGuest) return href;
    return isAuthed ? href : `/auth/required?next=${encodeURIComponent(href)}`;
  };

  const homeHref = "/timeline?tab=friends";

  const [uid, setUid] = useState<string | null>(null);
  const [hasPosted, setHasPosted] = useState<boolean | null>(null);
  const [dailyAwarded, setDailyAwarded] = useState<boolean | null>(null);

  const dayKey = useMemo(() => getGourmeetDayKey(new Date()), []);

  useEffect(() => {
    if (!isAuthed) {
      setUid(null);
      setHasPosted(null);
      setDailyAwarded(null);
      return;
    }
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase, isAuthed]);

  useEffect(() => {
    if (!isAuthed || !uid) {
      setHasPosted(null);
      setDailyAwarded(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { count: postCount } = await supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid);

        if (cancelled) return;
        setHasPosted((postCount ?? 0) > 0);

        const { count: dailyCount } = await supabase
          .from("point_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("reason", "daily_post")
          .eq("day_key", dayKey);

        if (cancelled) return;
        setDailyAwarded((dailyCount ?? 0) > 0);
      } catch (e) {
        if (!cancelled) {
          setHasPosted(null);
          setDailyAwarded(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, uid, isAuthed, dayKey]);

  const showFirstPostPromo = isAuthed && hasPosted === false;
  const showDailyPromo = isAuthed && hasPosted === true && dailyAwarded === false;

  const promoPoints = showFirstPostPromo ? 550 : showDailyPromo ? 50 : 0;
  const showPromo = promoPoints > 0;

  // ✅ fixed headerの高さ（だいたい2段で 12 + (px2 pb2) ≒ 104px）
  const headerHeight = 104;

  return (
    <div className="md:hidden">
      {/* ✅ spacer：fixedで本文が潜らないように */}
      <div style={{ height: `calc(${headerHeight}px + env(safe-area-inset-top))` }} />

      <header
        className="
          fixed left-0 right-0 top-0 z-50
          border-b border-black/[.06]
          bg-white/90 backdrop-blur
          pt-[env(safe-area-inset-top)]
        "
      >
        {/* 1段目 */}
        <div className="flex h-12 items-center justify-between px-3">
          <Link href={gate(homeHref)} className="text-[15px] font-bold tracking-tight">
            Gourmeet
          </Link>

          <div className="flex items-center gap-1">
            {/* Points */}
            <IconButton
              href={gate("/points")}
              active={isActive("/points")}
              ariaLabel="ポイント"
              activeClassName="bg-amber-100/70"
            >
              <CircleDollarSign size={20} className="text-amber-600" />
            </IconButton>

            {/* 通知 */}
            <IconButton
              href={gate("/notifications")}
              active={isActive("/notifications")}
              ariaLabel="通知"
              activeClassName="bg-violet-100/70"
            >
              <Bell size={20} className="text-violet-600" />
              <Badge count={notifCount} />
            </IconButton>

            {/* フォローリクエスト */}
            <IconButton
              href={gate("/follow-requests")}
              active={isActive("/follow-requests")}
              ariaLabel="フォローリクエスト"
              activeClassName="bg-sky-100/70"
            >
              <UserPlus size={20} className="text-sky-600" />
              <Badge count={followReqCount} />
            </IconButton>

            {/* ✅ Settings追加 */}
            <IconButton
              href={gate("/settings")}
              active={isActive("/settings")}
              ariaLabel="設定"
              activeClassName="bg-slate-100"
            >
              <Settings size={20} className="text-slate-700" />
            </IconButton>

            {/* Profile */}
            <Link
              href={gate("/profile")}
              className={`
                relative inline-flex h-10 w-10 items-center justify-center rounded-full
                transition-colors
                ${isActive("/profile") ? "bg-slate-100" : "hover:bg-black/[.04]"}
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

        {/* 2段目 */}
        <div className="px-2 pb-2">
          <div className="flex items-center justify-between gap-1 rounded-2xl bg-black/[.03] px-2 py-1">
            <IconButton
              href={gate(homeHref)}
              active={isActive("/timeline")}
              ariaLabel="ホーム"
              activeClassName="bg-blue-100/70"
            >
              <Home size={20} className="text-blue-600" />
              <Dot on={timelineDot} />
            </IconButton>

            <IconButton
              href={gate("/search", true)}
              active={isActive("/search")}
              ariaLabel="検索"
              activeClassName="bg-teal-100/70"
            >
              <Search size={20} className="text-teal-700" />
            </IconButton>

            <Link
              href={gate("/posts/new")}
              className={[
                "relative inline-flex h-11 w-11 items-center justify-center rounded-full",
                "bg-orange-700 text-white active:scale-[0.99] transition",
                showPromo ? "shadow-lg shadow-orange-200/70 ring-2 ring-orange-300 animate-pulse" : "",
              ].join(" ")}
              aria-label="投稿"
            >
              {showPromo && (
                <span
                  className="pointer-events-none absolute -inset-2 rounded-full bg-orange-300/20 blur-md"
                  aria-hidden="true"
                />
              )}
              <span className="relative">
                <Plus size={20} />
              </span>
              {showPromo && (
                <span className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-orange-700 shadow-sm">
                  +{promoPoints}
                </span>
              )}
            </Link>

            <IconButton
              href={gate("/map")}
              active={isActive("/map")}
              ariaLabel="マップ"
              activeClassName="bg-emerald-100/70"
            >
              <MapPin size={20} className="text-emerald-700" />
            </IconButton>

            <IconButton
              href={gate("/ai-chat")}
              active={isActive("/ai-chat")}
              ariaLabel="AI相談"
              activeClassName="bg-orange-100/70"
            >
              <AIChatIcon size={20} />
            </IconButton>
          </div>
        </div>
      </header>
    </div>
  );
}
