// src/app/(app)/posts/[id]/loading.tsx
function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 dark:bg-white/[.06] ${className}`} />;
}

export default function PostDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl py-0 md:py-6">
      {/* Place header */}
      <div className="px-4 md:px-6 pt-5 pb-3 space-y-2.5">
        <Pulse className="h-6 w-3/5 rounded-full" />
        <div className="flex items-center gap-2">
          <Pulse className="h-3.5 w-24 rounded-full" />
          <Pulse className="h-3.5 w-32 rounded-full" />
        </div>
        <div className="flex items-baseline gap-3">
          <Pulse className="h-8 w-14 rounded-lg" />
          <Pulse className="h-3 w-20 rounded-full" />
          <Pulse className="h-3 w-28 rounded-full" />
        </div>
      </div>

      {/* Image placeholder */}
      <Pulse className="w-full aspect-square" />

      {/* Author row */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 pt-3 pb-3">
        <Pulse className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Pulse className="h-3.5 w-28 rounded-full" />
          <Pulse className="h-2.5 w-20 rounded-full" />
        </div>
      </div>

      {/* Content lines */}
      <div className="space-y-2 px-4 md:px-6 pb-5">
        <Pulse className="h-3.5 w-full rounded-full" />
        <Pulse className="h-3.5 w-11/12 rounded-full" />
        <Pulse className="h-3.5 w-4/5 rounded-full" />
        <Pulse className="h-3.5 w-2/3 rounded-full" />
      </div>

      {/* Details chips */}
      <div className="px-4 md:px-6 pb-5 space-y-3">
        <Pulse className="h-4 w-16 rounded-full" />
        <div className="flex flex-wrap gap-1.5">
          <Pulse className="h-7 w-20 rounded-full" />
          <Pulse className="h-7 w-24 rounded-full" />
          <Pulse className="h-7 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}
