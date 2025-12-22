// app/(app)/layout.tsx
export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import MobileHeaderNav from "@/components/MobileHeaderNav";
import InviteReserveOnAuth from "@/components/InviteReserveOnAuth";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen gm-bg">
      <InviteReserveOnAuth />

      <div className="hidden md:block">
        <Sidebar />
      </div>

      <MobileHeaderNav />

      <main className="w-full px-0 md:px-6 pb-6 md:py-6 pt-0 md:pt-6 md:pl-[240px]">
        {/* ここが “紙面” */}
        <div className="mx-auto max-w-5xl md:gm-surface">
          {children}
        </div>
      </main>
    </div>
  );
}
