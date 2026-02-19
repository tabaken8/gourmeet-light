export const dynamic = "force-dynamic";

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import ClientAuthNav from "../components/AuthNav";

export const metadata: Metadata = {
  title: "Gourmeet",
  description: "友達のおすすめだけで選べる、新しいレストランアプリ。",
  metadataBase: new URL("https://gourmeet.jp"),
  openGraph: {
    title: "Gourmeet",
    description: "友達のおすすめだけで選べる、新しいレストランアプリ。",
    url: "https://gourmeet.jp",
    siteName: "Gourmeet",
    images: [{ url: "/ogp.png", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gourmeet",
    description: "友達のおすすめだけで選べる、新しいレストランアプリ。",
    images: ["/ogp.png"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      {/* min-h は globals.css の body { min-height: 100dvh } に任せる */}
      <body className="bg-[#fffaf5] text-black/90">
        {/* PC用ヘッダー（モバイルでは非表示） */}
        <header className="hidden md:block border-b border-black/[.06] bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="font-semibold tracking-wide">
              Gourmeet
            </Link>
            <ClientAuthNav />
          </div>
        </header>

        <main className="w-full">{children}</main>

        <footer className="border-t border-black/[.06] bg-white/70 py-6 text-center text-xs text-black/60">
          <div className="mb-2 flex items-center justify-center gap-4">
            <Link href="/privacy" className="underline underline-offset-2">
              プライバシーポリシー
            </Link>
            <span className="opacity-40">|</span>
            <Link href="/terms" className="underline underline-offset-2">
              利用規約
            </Link>
          </div>

          <div>© 2025 Gourmeet co.ltd. All rights reserved.</div>
        </footer>
      </body>
    </html>
  );
}
