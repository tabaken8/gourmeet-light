// src/app/(app)/search/loading.tsx
function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 dark:bg-white/[.06] ${className}`} />;
}

export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-transparent">
      <div className="mx-auto w-full max-w-5xl px-3 py-3 md:px-6 md:py-6">
        {/* Search bar skeleton */}
        <div className="mb-4">
          <Pulse className="h-11 w-full rounded-xl" />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-5">
          <Pulse className="h-8 w-20 rounded-full" />
          <Pulse className="h-8 w-24 rounded-full" />
          <Pulse className="h-8 w-16 rounded-full" />
        </div>

        {/* Map placeholder */}
        <Pulse className="h-[280px] w-full rounded-2xl mb-5" />

        {/* People cards row */}
        <div className="flex gap-3 overflow-hidden mb-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="shrink-0 w-[140px]">
              <Pulse className="h-[140px] w-full rounded-xl" />
              <div className="mt-2 space-y-1.5 px-1">
                <Pulse className="h-3 w-20 rounded-full" />
                <Pulse className="h-2.5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
