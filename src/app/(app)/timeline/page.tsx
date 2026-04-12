// src/app/(app)/timeline/page.tsx
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import FriendsTimelineServer from "@/components/timeline/FriendsTimelineServer";
import OptimisticPostCard from "@/components/timeline/OptimisticPostCard";
import PostsSkeleton from "@/components/PostsSkeleton";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen text-slate-800 dark:text-gray-200 bg-white dark:bg-transparent">
      <div className="mx-auto w-full max-w-6xl px-2 py-3 md:px-6 md:py-6">
        <Suspense fallback={<div className="overflow-hidden rounded-2xl bg-white dark:bg-[#16181e]"><PostsSkeleton /></div>}>
          {/* 投稿者本人にだけ: DBへの保存が完了するまで仮表示 */}
          <OptimisticPostCard />
          <FriendsTimelineServer meId={user?.id ?? null} />
        </Suspense>
      </div>
    </main>
  );
}
