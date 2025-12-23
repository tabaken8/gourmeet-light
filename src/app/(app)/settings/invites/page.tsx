import { Settings2 } from "lucide-react";
import ApplyInviteSection from "@/components/ApplyInviteSection";
import InviteCodeSection from "@/components/InviteCodeSection";

export default function InvitesSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 md:pb-10">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">招待</h1>
          <p className="mt-1 text-sm text-gray-600">
            招待コードの <span className="font-semibold">適用</span> と{" "}
            <span className="font-semibold">発行・共有</span> をまとめて管理します。
          </p>
        </div>
        <div className="mt-1 rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
          <Settings2 className="h-5 w-5 text-gray-700" />
        </div>
      </div>

      <div className="space-y-4">
        <ApplyInviteSection />
        <InviteCodeSection />
      </div>
    </main>
  );
}
