export const dynamic = "force-dynamic";

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import ClientAuthNav from "../components/AuthNav";
import QueryProvider from "@/components/providers/QueryProvider";
import ThemeProvider from "@/components/providers/ThemeProvider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

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
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },                        // fallback for legacy browsers
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("footer");

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap" rel="stylesheet" />
      </head>
      {/* min-h は globals.css の body { min-height: 100dvh } に任せる */}
      <body className="bg-[#fffaf5] text-black/90 dark:bg-[#0b0c0f] dark:text-gray-200">
        {/* Prevent flash: apply dark class before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("gourmeet_theme");if(t==="light")return;if(t==="system"&&!window.matchMedia("(prefers-color-scheme: dark)").matches)return;document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
        <ThemeProvider>
        <QueryProvider>
          {/* PC用ヘッダー（モバイルでは非表示） */}
          <header className="hidden md:block border-b border-black/[.06] dark:border-white/[.08] bg-white/90 dark:bg-[#12131a]/90 backdrop-blur">
            <div className="mx-auto flex h-20 max-w-5xl items-center justify-between px-4">
              <Link href="/" className="flex items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.svg" alt="Gourmeet" className="h-16 w-auto" />
              </Link>
              <ClientAuthNav />
            </div>
          </header>

          <main className="w-full">{children}</main>

          <footer className="border-t border-black/[.06] dark:border-white/[.08] bg-white/70 dark:bg-[#12131a]/70 py-6 text-center text-xs text-black/60 dark:text-gray-400">
            <div className="mb-2 flex items-center justify-center gap-4">
              <Link href="/privacy" className="underline underline-offset-2">
                {t("privacy")}
              </Link>
              <span className="opacity-40">|</span>
              <Link href="/terms" className="underline underline-offset-2">
                {t("terms")}
              </Link>
            </div>

            <div>© 2025 Gourmeet co.ltd. All rights reserved.</div>
          </footer>
        </QueryProvider>
        </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
