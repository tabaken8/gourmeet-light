// src/app/(app)/settings/loading.tsx
function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 dark:bg-white/[.06] ${className}`} />;
}

export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-6 md:pb-10">
      <Pulse className="h-5 w-20 rounded-full mb-6" />
      <div className="space-y-6">
        {[...Array(3)].map((_, s) => (
          <div key={s} className="space-y-1">
            <Pulse className="h-2.5 w-16 rounded-full mb-2" />
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <Pulse className="h-5 w-5 shrink-0 rounded" />
                <div className="flex-1 space-y-1">
                  <Pulse className="h-3.5 w-32 rounded-full" />
                  <Pulse className="h-2.5 w-48 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
