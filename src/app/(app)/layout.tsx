// app/(app)/layout.tsx
export const dynamic = "force-dynamic";

import Sidebar from "@/components/Sidebar";
import MobileHeaderNav from "@/components/MobileHeaderNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* PC: 左サイドバー */}
      <Sidebar />

      {/* Mobile: 上ヘッダー（fixed / 2段） */}
      <MobileHeaderNav />

      <main
        className="
          min-h-screen w-full
          px-0 md:px-6
          py-6
          pt-[104px] md:pt-6
          md:pl-[240px]
        "
      >
        {children}
      </main>
    </div>
  );
}
