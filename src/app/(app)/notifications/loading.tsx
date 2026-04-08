// src/app/(app)/notifications/loading.tsx
function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 dark:bg-white/[.06] ${className}`} />;
}

export default function NotificationsLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-transparent">
      <div className="mx-auto max-w-2xl px-4 py-4 md:py-6">
        <Pulse className="h-5 w-24 rounded-full mb-4" />
        <div className="space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-3">
              <Pulse className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Pulse className="h-3.5 w-4/5 rounded-full" />
                <Pulse className="h-2.5 w-2/5 rounded-full" />
              </div>
              <Pulse className="h-10 w-10 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
