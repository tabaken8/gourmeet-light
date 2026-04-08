// src/app/(app)/profile/loading.tsx
function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 dark:bg-white/[.06] ${className}`} />;
}

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-transparent">
      <div className="mx-auto max-w-2xl px-4 py-6 md:py-10">
        {/* Avatar + name + bio */}
        <div className="flex items-start gap-4">
          <Pulse className="h-20 w-20 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Pulse className="h-5 w-36 rounded-full" />
            <Pulse className="h-3.5 w-24 rounded-full" />
            <Pulse className="h-3 w-full rounded-full" />
            <Pulse className="h-3 w-4/5 rounded-full" />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 mt-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="text-center space-y-1">
              <Pulse className="h-5 w-8 mx-auto rounded-full" />
              <Pulse className="h-2.5 w-12 rounded-full" />
            </div>
          ))}
        </div>

        {/* Edit button */}
        <Pulse className="h-9 w-full rounded-xl mt-5" />

        {/* Heatmap placeholder */}
        <Pulse className="h-[120px] w-full rounded-xl mt-6" />

        {/* Post grid */}
        <div className="grid grid-cols-3 gap-1 mt-6">
          {[...Array(9)].map((_, i) => (
            <Pulse key={i} className="w-full aspect-square rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
