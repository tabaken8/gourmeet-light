import Link from "next/link";
import {
  ChevronRight,
  User,
  Shield,
  Gift,
  LogOut,
  FileText,
  Scale,
  Settings2,
} from "lucide-react";

type Item = {
  title: string;
  desc?: string;
  href: string;
  icon: React.ReactNode;
};

function ItemRow({ title, desc, href, icon }: Item) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-sm hover:bg-black/[.02]"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 rounded-xl border border-black/10 bg-white p-2">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          {desc ? <div className="mt-0.5 text-xs text-gray-600">{desc}</div> : null}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
    </Link>
  );
}

export default function SettingsIndexPage() {
  const account: Item[] = [
    {
      title: "アカウント",
      desc: "プロフィールや基本情報",
      href: "/settings/account",
      icon: <User className="h-5 w-5 text-gray-700" />,
    },
    {
      title: "アカウントのプライバシー",
      desc: "公開範囲やブロック等（仮）",
      href: "/settings/account/privacy",
      icon: <Shield className="h-5 w-5 text-gray-700" />,
    },
  ];

  const features: Item[] = [
    {
      title: "招待",
      desc: "招待コードの適用 / 発行・共有",
      href: "/settings/invites",
      icon: <Gift className="h-5 w-5 text-gray-700" />,
    },
    {
      title: "ポイント",
      desc: "ポイントや特典（仮）",
      href: "/points",
      icon: <Gift className="h-5 w-5 text-gray-700" />,
    },
  ];

  const legal: Item[] = [
    {
      title: "プライバシーポリシー",
      href: "/legal/privacy",
      icon: <FileText className="h-5 w-5 text-gray-700" />,
    },
    {
      title: "利用規約",
      href: "/legal/terms",
      icon: <Scale className="h-5 w-5 text-gray-700" />,
    },
  ];

  const danger: Item[] = [
    {
      title: "ログアウト",
      desc: "この端末からサインアウトします",
      href: "/settings/logout",
      icon: <LogOut className="h-5 w-5 text-gray-700" />,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 md:pb-10">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">設定</h1>
          <p className="mt-1 text-sm text-gray-600">アカウントやアプリの設定を管理します。</p>
        </div>
        <div className="mt-1 rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
          <Settings2 className="h-5 w-5 text-gray-700" />
        </div>
      </div>

      <section className="space-y-6">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            アカウント
          </div>
          <div className="space-y-2">{account.map((it) => <ItemRow key={it.href} {...it} />)}</div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            機能
          </div>
          <div className="space-y-2">{features.map((it) => <ItemRow key={it.href} {...it} />)}</div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            規約・ポリシー
          </div>
          <div className="space-y-2">{legal.map((it) => <ItemRow key={it.href} {...it} />)}</div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            その他
          </div>
          <div className="space-y-2">{danger.map((it) => <ItemRow key={it.href} {...it} />)}</div>
        </div>
      </section>
    </main>
  );
}
