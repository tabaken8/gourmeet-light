// app/(app)/layout.tsx
export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import MobileHeaderNav from "@/components/MobileHeaderNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* PC: 左サイドバー（モバイルで誤って余白を取らないようにガード） */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile: 上ヘッダー（sticky） */}
      <MobileHeaderNav />

      <main
        className="
          w-full
          px-0 md:px-6
          pb-6 md:py-6
          pt-0 md:pt-6
          md:pl-[240px]
        "
      >
        {children}
      </main>
    </div>
  );
}
