export const dynamic = "force-dynamic";

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import ClientAuthNav from "../components/ClientAuthNav";

export const metadata: Metadata = {
  title: "Gourmeet",
  description: "Find great restaurants recommended by trusted friends",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#fffaf5] text-black/90">
        {/* 共通ヘッダー（ログイン・ログアウトは ClientAuthNav が処理） */}
        <header className="border-b border-black/[.06] bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="font-semibold tracking-wide">
              Gourmeet
            </Link>

            {/* ユーザー情報をクライアントで取得 */}
            <ClientAuthNav />
          </div>
        </header>

        <main className="py-10">
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </main>

        <footer className="border-t border-black/[.06] py-6 text-center text-xs text-black/60">
          © 2025 Gourmeet co.ltd. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
