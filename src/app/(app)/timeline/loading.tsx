// src/app/(app)/timeline/loading.tsx
import PostsSkeleton from "@/components/PostsSkeleton";

export default function TimelineLoading() {
  return (
    <main className="min-h-screen text-slate-800 dark:text-gray-200 bg-white dark:bg-transparent">
      <div className="mx-auto w-full max-w-6xl px-2 py-3 md:px-6 md:py-6">
        <section className="rounded-2xl bg-white dark:bg-[#16181e]">
          <PostsSkeleton count={4} />
        </section>
      </div>
    </main>
  );
}
