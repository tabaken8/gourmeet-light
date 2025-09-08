import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mini SNS", description: "Supabase + Next.js" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#fffaf5] text-black/90">
        <header className="border-b border-black/[.06] bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="font-semibold tracking-wide">Gourmeet</Link>

            <nav className="flex items-center gap-4 text-sm">
              {!user ? (
                <>
                  <Link className="hover:underline" href="/auth/login">ログイン</Link>
                  <Link className="inline-flex h-9 items-center rounded-full border border-orange-800 px-4 font-medium text-orange-900 hover:bg-orange-800 hover:text-white" href="/auth/signup">
                    会員登録
                  </Link>
                </>
              ) : (
                <>
                  <Link className="hover:underline" href="/account">アカウント</Link>
                  <form action="/auth/logout" method="post">
                    <button className="inline-flex h-9 items-center rounded-full border border-black/15 px-4 hover:bg-black/[.04]">
                      ログアウト
                    </button>
                  </form>
                </>
              )}
            </nav>

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
