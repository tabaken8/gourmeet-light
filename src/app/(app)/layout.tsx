export const dynamic = "force-dynamic";

import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <Sidebar />
      <main className="min-h-screen w-full md:pl-[240px] px-4 md:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
