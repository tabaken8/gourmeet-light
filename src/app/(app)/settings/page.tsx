import React from "react";
import Link from "next/link";
import {
  ChevronRight,
  User,
  LogOut,
  FileText,
  Scale,
  Bell,
} from "lucide-react";

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
      className="flex items-center justify-between gap-3 px-1 py-3 hover:bg-slate-50 -mx-1 rounded-lg transition"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={danger ? "text-red-500" : "text-slate-400"}>{icon}</span>
        <div className="min-w-0">
          <div className={`text-[14px] font-medium ${danger ? "text-red-600" : "text-slate-800"}`}>{title}</div>
          {desc ? <div className="text-[12px] text-slate-400 mt-0.5">{desc}</div> : null}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1 pb-1">
      {children}
    </div>
  );
}

export default function SettingsIndexPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24 pt-6 md:pb-10">
      <h1 className="text-[17px] font-semibold tracking-tight text-slate-900 mb-6">
        {"\u8A2D\u5B9A"}
      </h1>

      <div className="space-y-6">
        {/* アカウント */}
        <section>
          <SectionLabel>{"\u30A2\u30AB\u30A6\u30F3\u30C8"}</SectionLabel>
          <div className="divide-y divide-slate-100">
            <ItemRow
              title={"\u30A2\u30AB\u30A6\u30F3\u30C8"}
              desc={"\u30E6\u30FC\u30B6\u30FCID\u30FB\u30E1\u30FC\u30EB\u30FB\u516C\u958B\u8A2D\u5B9A"}
              href="/settings/account"
              icon={<User size={18} />}
            />
            <ItemRow
              title={"\u901A\u77E5\u8A2D\u5B9A"}
              desc={"\u30E1\u30FC\u30EB\u901A\u77E5\u30FB\u30D9\u30EB\u901A\u77E5"}
              href="/settings/notifications"
              icon={<Bell size={18} />}
            />
          </div>
        </section>

        {/* 規約 */}
        <section>
          <SectionLabel>{"\u898F\u7D04\u30FB\u30DD\u30EA\u30B7\u30FC"}</SectionLabel>
          <div className="divide-y divide-slate-100">
            <ItemRow
              title={"\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC\u30DD\u30EA\u30B7\u30FC"}
              href="/legal/privacy"
              icon={<FileText size={18} />}
            />
            <ItemRow
              title={"\u5229\u7528\u898F\u7D04"}
              href="/legal/terms"
              icon={<Scale size={18} />}
            />
          </div>
        </section>

        {/* その他 */}
        <section>
          <div className="divide-y divide-slate-100">
            <ItemRow
              title={"\u30ED\u30B0\u30A2\u30A6\u30C8"}
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
