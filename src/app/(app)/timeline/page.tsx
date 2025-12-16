// src/app/(app)/timeline/page.tsx
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import TimelineFeed from "@/components/TimelineFeed";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string };

export default async function TimelinePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const activeTab = sp?.tab === "discover" ? "discover" : "friends";

  // ✅ ログイン状態を取得して Feed に渡す（これが「ログインボタンが出る問題」の根本解決）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-4">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            Timeline
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            友達や公開ユーザーの “いま食べてるもの” を、ふわっと流し見する場所。
          </p>
        </header>

        <section className="rounded-2xl bg-white">
          <div className="px-1 pb-3">
            <div className="inline-flex w-full gap-1 rounded-full bg-slate-50 p-1 text-xs font-medium text-slate-600">
              <Link
                href="?tab=friends"
                className={[
                  "flex-1 rounded-full px-3 py-2 text-center transition",
                  activeTab === "friends"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-500 hover:text-orange-500",
                ].join(" ")}
              >
                フォロー中
              </Link>

              <Link
                href="?tab=discover"
                className={[
                  "flex-1 rounded-full px-3 py-2 text-center transition",
                  activeTab === "discover"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-500 hover:text-orange-500",
                ].join(" ")}
              >
                探す
              </Link>
            </div>

            <p className="mt-2 text-[11px] text-slate-500">
              {activeTab === "friends"
                ? "フォローしている人の投稿が流れます。"
                : "公開プロフィールのユーザーから、気になる人を見つけられます。"}
            </p>
          </div>

          {/* ✅ keyでタブ切替時にFeedを完全リセット */}
          <TimelineFeed
            key={activeTab}
            activeTab={activeTab}
            meId={user?.id ?? null}
          />
        </section>
      </div>
    </main>
  );
}
