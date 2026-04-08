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

        {/* ── Splash screen: shows instantly before React hydrates ── */}
        <div
          id="gm-splash"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fffaf5",
            transition: "opacity .35s ease, visibility .35s ease",
          }}
        >
          <div style={{ textAlign: "center" }}>
            {/* Inline fork icon SVG - no external request */}
            <svg
              viewBox="0 0 512 512"
              width="64"
              height="64"
              style={{ margin: "0 auto 16px", animation: "gm-pulse 1.6s ease-in-out infinite" }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#22CCAA" />
                  <stop offset="100%" stopColor="#17A68A" />
                </linearGradient>
              </defs>
              <circle cx="256" cy="256" r="245" fill="none" stroke="#1DB9A0" strokeWidth="6" opacity=".25" />
              <g transform="translate(256,265) scale(1.7)">
                <g transform="rotate(-35)" fill="url(#sg)">
                  <path d="M-5,38C-6,68-5.5,100-4.5,125C-3.5,131 3.5,131 4.5,125C5.5,100 6,68 5,38Z" />
                  <path d="M-5,38C-6,30-8,22-11,14L-11,-2C-6,-7 6,-7 11,-2L11,14C8,22 6,30 5,38Z" />
                  <path d="M-11,-2C-12,-28-14.5,-58-16,-82C-16.5,-90-11,-90-10,-82C-9,-58-7.5,-28-7,-2Z" />
                  <path d="M-6,-3C-6,-30-6.5,-60-6.5,-84C-6.5,-92-1,-92-1,-84C-1,-60-1,-30-1,-3Z" />
                  <path d="M1,-3C1,-30 1,-60 1,-84C1,-92 6.5,-92 6.5,-84C6.5,-60 6,-30 6,-3Z" />
                  <path d="M7,-2C7.5,-28 9,-58 10,-82C11,-90 16.5,-90 16,-82C14.5,-58 12,-28 11,-2Z" />
                </g>
                <g transform="rotate(35)" fill="url(#sg)">
                  <path d="M-5,38C-6,68-5.5,100-4.5,125C-3.5,131 3.5,131 4.5,125C5.5,100 6,68 5,38Z" />
                  <path d="M-5,38C-6,30-8,22-11,14L-11,-2C-6,-7 6,-7 11,-2L11,14C8,22 6,30 5,38Z" />
                  <path d="M-11,-2C-12,-28-14.5,-58-16,-82C-16.5,-90-11,-90-10,-82C-9,-58-7.5,-28-7,-2Z" />
                  <path d="M-6,-3C-6,-30-6.5,-60-6.5,-84C-6.5,-92-1,-92-1,-84C-1,-60-1,-30-1,-3Z" />
                  <path d="M1,-3C1,-30 1,-60 1,-84C1,-92 6.5,-92 6.5,-84C6.5,-60 6,-30 6,-3Z" />
                  <path d="M7,-2C7.5,-28 9,-58 10,-82C11,-90 16.5,-90 16,-82C14.5,-58 12,-28 11,-2Z" />
                </g>
              </g>
            </svg>
            {/* Brand text */}
            <div
              style={{
                fontFamily: "'Pacifico','Dancing Script',cursive",
                fontSize: 26,
                lineHeight: 1,
                background: "linear-gradient(to right,#1DB9A0 0%,#6BAA44 35%,#C8882A 70%,#D06A28 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Gourmeet
            </div>
          </div>
        </div>
        {/* Dark-mode override + pulse animation + auto-hide once app mounts */}
        <style
          dangerouslySetInnerHTML={{
            __html: [
              `html.dark #gm-splash{background:#0b0c0f}`,
              `@keyframes gm-pulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}`,
            ].join(""),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.getElementById("gm-splash");if(!s)return;window.__gmHideSplash=function(){if(s.dataset.hidden)return;s.dataset.hidden="1";s.style.opacity="0";s.style.visibility="hidden";setTimeout(function(){try{s.remove()}catch(e){}},400)};setTimeout(function(){window.__gmHideSplash()},4000)})()`,
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
