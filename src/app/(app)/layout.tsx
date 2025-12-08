export const dynamic = "force-dynamic";

import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full bg-[#ffffff]">
      {/* サイドバー（クライアントコンポーネント） */}
      <Sidebar />

      {/* メインコンテンツ */}
      <main className="flex-1 ml-[240px] min-h-screen px-6 py-6">
        {children}
      </main>
    </div>
  );
}
