"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Users, Bookmark, MapPin, ShieldCheck } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function GoogleMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.7 1.2 9.1 3.5l6.8-6.8C35.3 2.7 29.9 0 24 0 14.8 0 6.7 5.1 2.4 12.6l7.9 6.1C12.4 12.1 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.2-3.2-.5-4.7H24v9h12.3c-.5 2.7-2.1 5-4.5 6.5v5.4h7.3c4.3-4 6.8-9.9 6.8-16.2z"
      />
      <path
        fill="#FBBC04"
        d="M10.3 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6v-5.4H2.4c-1.6 3.2-2.4 6.9-2.4 10.9s.9 7.7 2.4 10.9l7.9-6.2z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.3-5.4c-2 1.4-4.6 2.3-7.9 2.3-6.2 0-11.6-3.6-14-8.8l-7.9 6.2C6.7 42.9 14.8 48 24 48z"
      />
    </svg>
  );
}

type ExploreCopy = {
  label: string;
  sub?: string;
};

function pickExploreCopy(seed: number): ExploreCopy {
  const variants: ExploreCopy[] = [
    { label: "ログインせずにまずはサクッと覗く", sub: "公開タイムラインへ" },
    { label: "ログインせずに体験してみる", sub: "ログインなしでOK" },
    { label: "ログインせずに今日のおすすめを見る", sub: "公開投稿から" },
    { label: "ログインせずに雰囲気だけ見てみる", sub: "公開タイムラインへ" },
    { label: "ログインせずに人気の投稿を見に行く", sub: "公開タイムラインへ" },
  ];
  return variants[Math.abs(seed) % variants.length];
}

type PitchItem = {
  icon?: "friends" | "bookmark" | "map" | "trust";
  title: string;
  body?: string;
};

function PitchIcon({ kind }: { kind?: PitchItem["icon"] }) {
  const cls = "h-4 w-4 shrink-0";
  switch (kind) {
    case "friends":
      return <Users className={`${cls} text-blue-700`} />;
    case "bookmark":
      return <Bookmark className={`${cls} text-pink-700`} />;
    case "map":
      return <MapPin className={`${cls} text-emerald-700`} />;
    case "trust":
      return <ShieldCheck className={`${cls} text-violet-700`} />;
    default:
      return <Sparkles className={`${cls} text-orange-700`} />;
  }
}

export default function LoginCard({
  title = "ログインが必要です",
  description = "投稿を見る・投稿する・フォロー・コレクションなどが使えるようになります。",
  nextPath,
  showDiscoverLink = true,

  // 既存：公開導線
  searchHref = "/search",
  exploreMode = "rotating", // "fixed" | "rotating"
  exploreFixedText = "体験してみる",

  // ✅ 追加：宣伝ブロック
  pitchTitle = "Gourmeetってどんなアプリ？",
  pitchSubtitle = "知らない人の★より、知り合いの「ここ良かった」が効く。",
  pitchItems,
  pitchNote = "ログインは数秒。無料で使えます。",
}: {
  title?: string;
  description?: string;
  nextPath?: string;
  showDiscoverLink?: boolean;

  searchHref?: string;
  exploreMode?: "fixed" | "rotating";
  exploreFixedText?: string;

  pitchTitle?: string;
  pitchSubtitle?: string;
  pitchItems?: PitchItem[];
  pitchNote?: string;
}) {
  const supabase = createClientComponentClient();

  const handleGoogleLogin = async () => {
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectTo = `${base}/auth/callback${
      nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""
    }`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error(error);
      alert("Googleログインに失敗しました: " + error.message);
    }
  };

  const emailLoginHref = nextPath
    ? `/auth/login?next=${encodeURIComponent(nextPath)}`
    : "/auth/login";

  const signupHref = nextPath
    ? `/auth/signup?next=${encodeURIComponent(nextPath)}`
    : "/auth/signup";

  // ✅ hydration-safe：初回は固定 → mount後に rotating を決める
  const fixedExplore: ExploreCopy = useMemo(() => {
    return { label: exploreFixedText, sub: "ログインなしでOK" };
  }, [exploreFixedText]);

  const [exploreCopy, setExploreCopy] = useState<ExploreCopy>(fixedExplore);

  useEffect(() => {
    if (exploreMode === "fixed") {
      setExploreCopy(fixedExplore);
      return;
    }
    // “日替わりっぽさ”はクライアント側でだけ決める（SSRとズレない）
    const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    setExploreCopy(pickExploreCopy(daySeed));
  }, [exploreMode, fixedExplore]);

  const effectivePitchItems: PitchItem[] =
    pitchItems && pitchItems.length > 0
      ? pitchItems
      : [
          {
            icon: "friends",
            title: "友だち/知り合いのおすすめが見える",
            body: "匿名レビューより信頼できる“近い距離の情報”を集める。",
          },
          {
            icon: "bookmark",
            title: "保存が資産になるコレクション",
            body: "行きたい店を、自分のルールで整理。",
          },
          {
            icon: "map",
            title: "地図で候補を即決",
            body: "近くの店をサッと比較できて、店選びが速い。",
          },
          {
            icon: "trust",
            title: "コミュニティが小さいほど効く",
            body: "身内の“当たり”が蓄積していく感じ。",
          },
        ];

  return (
    <div className="flex min-h-[44vh] items-center justify-center px-2">
      <div className="w-full max-w-md rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">{title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
          </div>

          <div className="ml-3 flex h-9 w-9 items-center justify-center rounded-full bg-orange-100">
            <GoogleMark className="h-5 w-5" />
          </div>
        </div>

        {/* ✅ Pitch / 宣伝 */}
        <div className="mt-4 rounded-2xl bg-black/[.03] p-4">
          <div className="flex items-start gap-2">
            <Sparkles size={18} className="mt-0.5 text-orange-700" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">{pitchTitle}</div>
              {pitchSubtitle ? (
                <div className="mt-1 text-xs leading-5 text-slate-600">{pitchSubtitle}</div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {effectivePitchItems.map((it, idx) => (
              <div key={idx} className="flex gap-2">
                <PitchIcon kind={it.icon} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800">{it.title}</div>
                  {it.body ? (
                    <div className="mt-0.5 text-[11px] leading-4 text-slate-600">{it.body}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {pitchNote ? <div className="mt-3 text-[11px] text-slate-500">{pitchNote}</div> : null}
        </div>

        {/* Actions */}
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-white text-sm font-medium text-slate-900 hover:bg-black/[.03]"
          >
            <GoogleMark className="h-[18px] w-[18px]" />
            Googleで続ける
          </button>

          <Link
            href={emailLoginHref}
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-orange-700 px-5 text-sm font-medium text-white hover:bg-orange-800"
          >
            メールでログイン
          </Link>

          <div className="mt-2 flex items-center justify-between gap-2">
            <Link href={signupHref} className="text-xs font-medium text-orange-700 hover:underline">
              アカウント作成
            </Link>

            {/* 公開を見る */}
            {showDiscoverLink ? (
              <Link
                href={searchHref}
                className="
                  inline-flex items-center gap-1.5
                  rounded-full border border-black/10 bg-black/[.02]
                  px-3 py-1.5 text-xs font-medium text-slate-800
                  hover:bg-black/[.04]
                "
              >
                <Sparkles size={14} className="text-orange-700" />
                <span>{exploreCopy.label}</span>
                {exploreCopy.sub ? (
                  <span className="hidden sm:inline text-[11px] text-slate-500">
                    {exploreCopy.sub}
                  </span>
                ) : null}
              </Link>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
