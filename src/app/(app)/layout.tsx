// app/(app)/layout.tsx
export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import MobileHeaderNav from "@/components/MobileHeaderNav";
import InviteReserveOnAuth from "@/components/InviteReserveOnAuth";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import TopLoaderProvider from "@/components/TopLoaderProvider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // ✅ ページ全体の背景はここ（外側）に付ける
    <div className="min-h-screen bg-[#fffaf5]">
      <TopLoaderProvider />

      <InviteReserveOnAuth />
      <AnalyticsTracker />

      <div className="hidden md:block">
        <Sidebar />
      </div>

      <MobileHeaderNav />

      <main className="w-full px-0 md:px-6 pb-6 md:py-6 pt-0 md:pt-6 md:pl-[240px]">
        {/* ✅ 中央は幅だけ担当（背景を付けない） */}
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
