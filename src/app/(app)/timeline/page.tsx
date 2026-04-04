// src/app/(app)/timeline/page.tsx
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import FriendsTimelineServer from "@/components/timeline/FriendsTimelineServer";
import DiscoverTimelineClient from "@/components/timeline/DiscoverTimelineClient";
import OptimisticPostCard from "@/components/timeline/OptimisticPostCard";
import PostsSkeleton from "@/components/PostsSkeleton";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string };

export default async function TimelinePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const activeTab = sp?.tab === "discover" ? "discover" : "friends";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoggedIn = !!user;

  return (
    <main className="min-h-screen text-slate-800 dark:text-gray-200 bg-white dark:bg-transparent">
      <div className="mx-auto w-full max-w-6xl px-2 py-3 md:px-6 md:py-6">
        <section className="rounded-2xl bg-white dark:bg-[#16181e]">
          <div className="flex border-b border-slate-100 dark:border-white/[.08]">
              <Link
                href="?tab=friends"
                className={[
                  "flex-1 py-2 text-center text-[13px] font-medium transition relative",
                  activeTab === "friends"
                    ? "text-slate-900 dark:text-gray-100"
                    : "text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300",
                ].join(" ")}
              >
                {"\u6700\u65B0"}
                {activeTab === "friends" && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full gm-brand-line" />}
              </Link>

              <Link
                href="?tab=discover"
                className={[
                  "flex-1 py-2 text-center text-[13px] font-medium transition relative",
                  activeTab === "discover"
                    ? "text-slate-900 dark:text-gray-100"
                    : "text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300",
                ].join(" ")}
              >
                {"\u767A\u898B"}
                {activeTab === "discover" && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full gm-brand-line" />}
              </Link>
          </div>

          {activeTab === "friends" ? (
            <Suspense fallback={<PostsSkeleton />}>
              {/* 投稿者本人にだけ: DBへの保存が完了するまで仮表示 */}
              <OptimisticPostCard />
              <FriendsTimelineServer meId={user?.id ?? null} />
            </Suspense>
          ) : (
            <Suspense fallback={<PostsSkeleton />}>
              <DiscoverTimelineClient meId={user?.id ?? null} />
            </Suspense>
          )}
        </section>
      </div>
    </main>
  );
}