import React from "react";
import Link from "next/link";
import {
  ChevronRight,
  User,
  LogOut,
  FileText,
  Scale,
  Bell,
  Palette,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import DarkModeToggle from "@/components/DarkModeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type Item = {
  title: string;
  desc?: string;
  href: string;
  icon: React.ReactNode;
  danger?: boolean;
};

function ItemRow({ title, desc, href, icon, danger }: Item) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-1 py-3 hover:bg-slate-50 dark:hover:bg-white/[.04] -mx-1 rounded-lg transition"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={danger ? "text-red-500" : "text-slate-400 dark:text-gray-500"}>{icon}</span>
        <div className="min-w-0">
          <div className={`text-[14px] font-medium ${danger ? "text-red-600" : "text-slate-800 dark:text-gray-200"}`}>{title}</div>
          {desc ? <div className="text-[12px] text-slate-400 dark:text-gray-500 mt-0.5">{desc}</div> : null}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-gray-600" />
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 px-1 pb-1">
      {children}
    </div>
  );
}

export default async function SettingsIndexPage() {
  const t = await getTranslations("settings");

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24 pt-6 md:pb-10">
      <h1 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-gray-100 mb-6">
        {t("title")}
      </h1>

      <div className="space-y-6">
        {/* アカウント */}
        <section>
          <SectionLabel>{t("account")}</SectionLabel>
          <div className="divide-y divide-slate-100 dark:divide-white/[.08]">
            <ItemRow
              title={t("account")}
              desc={t("accountDesc")}
              href="/settings/account"
              icon={<User size={18} />}
            />
            <ItemRow
              title={t("notifications")}
              desc={t("notificationsDesc")}
              href="/settings/notifications"
              icon={<Bell size={18} />}
            />
          </div>
        </section>

        {/* 外観 */}
        <section>
          <SectionLabel>{t("appearance")}</SectionLabel>
          <div className="flex items-center justify-between gap-3 px-1 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-slate-400 dark:text-gray-500"><Palette size={18} /></span>
              <div className="text-[14px] font-medium text-slate-800 dark:text-gray-200">{t("theme")}</div>
            </div>
            <DarkModeToggle />
          </div>
          <LanguageSwitcher />
        </section>

        {/* 規約 */}
        <section>
          <SectionLabel>{t("policies")}</SectionLabel>
          <div className="divide-y divide-slate-100 dark:divide-white/[.08]">
            <ItemRow
              title={t("privacyPolicy")}
              href="/legal/privacy"
              icon={<FileText size={18} />}
            />
            <ItemRow
              title={t("terms")}
              href="/legal/terms"
              icon={<Scale size={18} />}
            />
          </div>
        </section>

        {/* その他 */}
        <section>
          <div className="divide-y divide-slate-100 dark:divide-white/[.08]">
            <ItemRow
              title={t("logout")}
              href="/settings/logout"
              icon={<LogOut size={18} />}
              danger
            />
          </div>
        </section>
      </div>
    </main>
  );
}
