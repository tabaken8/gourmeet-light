// src/app/(app)/collection/loading.tsx
function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 dark:bg-white/[.06] ${className}`} />;
}

export default function CollectionLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-transparent">
      <div className="mx-auto max-w-5xl px-3 py-4 md:px-6 md:py-6">
        {/* Collection sidebar + content layout */}
        <div className="flex gap-4">
          {/* Sidebar */}
          <div className="hidden md:block w-[220px] shrink-0 space-y-2">
            <Pulse className="h-9 w-full rounded-lg" />
            {[...Array(4)].map((_, i) => (
              <Pulse key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>

          {/* Mobile: tab row */}
          <div className="md:hidden flex gap-2 mb-4 w-full">
            <Pulse className="h-8 w-24 rounded-full" />
            <Pulse className="h-8 w-20 rounded-full" />
            <Pulse className="h-8 w-28 rounded-full" />
          </div>
        </div>

        {/* Post cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-black/[.06] dark:border-white/[.08] overflow-hidden">
              <Pulse className="w-full aspect-[4/3]" />
              <div className="p-3 space-y-2">
                <Pulse className="h-4 w-3/4 rounded-full" />
                <Pulse className="h-3 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
