// src/components/Sidebar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Home,
  Compass,
  Bell,
  Bookmark,
  Plus,
  UserPlus,
  LogOut,
  UserRound,
  CircleDollarSign,
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
  iconClassName,
}: {
  href: string;
  label: string;
  icon?: any;
  count?: number;
  dot?: boolean;
  avatarUrl?: string | null;
  avatarAlt?: string;
  iconClassName?: string;
}) {
  return (
    <Link
      href={href}
      className="
        group
        flex items-center gap-3 rounded-lg px-3 py-2 text-base
        hover:bg-gray-100/80
        dark:hover:bg-white/[.06]
      "
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
          <Icon size={22} className={iconClassName} />
        ) : (
          <UserRound size={22} className="text-slate-700 dark:text-gray-400" />
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

/**
 * Gourmeet day_key（毎日4:00 JSTで切り替え）
 * - JSTで 00:00〜03:59 は「前日扱い」
 * - それ以外は「当日扱い」
 */
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

export default function Sidebar({ name }: { name?: string }) {
  const { isAuthed, avatarUrl, displayNameSafe, notifCount, followReqCount, timelineDot } =
    useNavBadges(name);

  const supabase = createClientComponentClient();
  const displayNameMemo = useMemo(() => displayNameSafe ?? "", [displayNameSafe]);

  const gate = (href: string, _allowGuest = false) => href;

  // ===== 投稿インセンティブ判定（初回 or 今日の+50未取得） =====
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
        // ① 投稿済みか
        const { count: postCount, error: postErr } = await supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid);

        if (cancelled) return;

        if (postErr) {
          console.error(postErr);
          setHasPosted(null);
        } else {
          setHasPosted((postCount ?? 0) > 0);
        }

        // ② 今日のdaily_post(+50)が付与済みか
        const { count: dailyCount, error: dailyErr } = await supabase
          .from("point_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("reason", "daily_post")
          .eq("day_key", dayKey);

        if (cancelled) return;

        if (dailyErr) {
          console.error(dailyErr);
          setDailyAwarded(null);
        } else {
          setDailyAwarded((dailyCount ?? 0) > 0);
        }
      } catch (e) {
        console.error(e);
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

  const showPromo = showFirstPostPromo || showDailyPromo;
  const promoPoints = showFirstPostPromo ? 550 : showDailyPromo ? 50 : 0;

  const promoText = showFirstPostPromo
    ? "初投稿で +550pt"
    : showDailyPromo
    ? "今日の投稿で +50pt"
    : "";

  const promoSub = showFirstPostPromo
    ? "いま投稿するとまとめて獲得できます"
    : showDailyPromo
    ? "1日1回のチャンス"
    : "";

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
        {/* メイン */}
        <NavItem
          href={gate(homeHref)}
          label="ホーム"
          icon={Home}
          dot={timelineDot}
          iconClassName="text-blue-600"
        />

        {/* ✅ 発見（People Map） */}
        <NavItem
          href={gate("/discover", true)}
          label="発見"
          icon={Compass}
          iconClassName="text-orange-700"
        />

        {/* ✅ map / ai-chat は隠す（今回は表示しない） */}

        <NavItem
          href={gate("/collection")}
          label="コレクション"
          icon={Bookmark}
          iconClassName="text-pink-600"
        />

        <NavItem
          href={gate("/points")}
          label="ポイント"
          icon={CircleDollarSign}
          iconClassName="text-amber-600"
        />

        {/* サブ（通知・フォロリク・設定） */}
        <div className="my-2 h-px bg-black/[.08] dark:bg-white/[.08]" />

        <NavItem
          href={gate("/notifications")}
          label="通知"
          icon={Bell}
          count={notifCount}
          iconClassName="text-violet-600"
        />

        <NavItem
          href={gate("/follow-requests")}
          label="フォローリクエスト"
          icon={UserPlus}
          count={followReqCount}
          iconClassName="text-sky-600"
        />

        <NavItem
          href={gate("/settings")}
          label="設定"
          icon={Settings}
          iconClassName="text-slate-700 dark:text-gray-400"
        />

        <NavItem
          href={gate("/profile")}
          label="プロフィール"
          avatarUrl={avatarUrl}
          avatarAlt={displayNameMemo}
        />

        {/* Post CTA */}
        <div className="mt-4 relative">
          <Link
            href={gate("/posts/new")}
            className={[
              "relative flex items-center justify-center gap-2 rounded-full py-3 font-semibold",
              "bg-orange-700 !text-white hover:bg-orange-800 transition",
              showPromo ? "ring-2 ring-orange-300 shadow-lg shadow-orange-200/70 animate-pulse" : "",
            ].join(" ")}
          >
            {showPromo && (
              <span
                className="pointer-events-none absolute -inset-2 rounded-full bg-orange-300/20 blur-md"
                aria-hidden="true"
              />
            )}

            <Plus size={18} className="shrink-0 relative" />

            <span
              className="
                relative
                overflow-hidden whitespace-nowrap
                max-w-0 opacity-0 translate-x-[-4px]
                transition-all duration-200
                group-hover:max-w-[140px] group-hover:opacity-100 group-hover:translate-x-0
              "
            >
              Post
            </span>

            {showPromo && (
              <span className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-orange-700 shadow-sm">
                +{promoPoints}
              </span>
            )}
          </Link>

          {/* ✅ ここが最優先修正：
              hoverで出す案内を "absolute overlay" にしてレイアウトを押さない */}
          {showPromo && (
            <div
              className="
                pointer-events-none
                absolute left-0 right-0 top-full mt-2
                opacity-0 translate-y-1
                transition-all duration-200
                group-hover:opacity-100 group-hover:translate-y-0
              "
            >
              <div className="rounded-xl border border-orange-100 dark:border-orange-900/40 bg-orange-50/70 dark:bg-orange-950/40 px-3 py-2 shadow-sm">
                <div className="text-[11px] font-semibold text-slate-900 dark:text-gray-100 truncate">🎁 {promoText}</div>
                <div className="text-[10px] text-slate-600 dark:text-gray-400 truncate">{promoSub}</div>

                {/* クリックできるようにしたいなら pointer-events を戻す */}
                <div className="mt-1 pointer-events-auto">
                  <Link
                    href={gate("/points")}
                    className="inline-flex rounded-full border border-orange-100 dark:border-orange-900/40 bg-white dark:bg-white/10 px-2 py-1 text-[10px] font-semibold text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-white/15"
                  >
                    ここからポイント残高を見る
                  </Link>
                </div>
              </div>
            </div>
          )}
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
            <LogOut size={18} className="shrink-0 text-rose-600" />
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
