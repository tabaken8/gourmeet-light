// src/components/PostsSkeleton.tsx
import React from "react";

function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 dark:bg-white/[.06] ${className}`} />;
}

/** 新フィードレイアウトに対応したスケルトン 1 件分 */
function PostCardSkeleton() {
  return (
    <div className="gm-feed-divider">
      {/* header: avatar + name + time + location */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-1.5">
        <Pulse className="h-8 w-8 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Pulse className="h-3 w-24 rounded-full" />
            <Pulse className="h-2.5 w-10 rounded-full" />
          </div>
          <div className="flex items-center gap-1">
            <Pulse className="h-2.5 w-2.5 rounded-full" />
            <Pulse className="h-2.5 w-20 rounded-full" />
          </div>
        </div>
      </div>

      {/* image placeholder — full width */}
      <Pulse className="w-full aspect-square" />

      {/* actions row */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-3">
          <Pulse className="h-5 w-5 rounded-full" />
          <Pulse className="h-3 w-24 rounded-full" />
        </div>
        <Pulse className="h-5 w-5 rounded" />
      </div>

      {/* meta: score + price */}
      <div className="flex items-center gap-2 px-3 pt-0.5">
        <Pulse className="h-2.5 w-20 rounded-full" />
        <Pulse className="h-2.5 w-12 rounded-full" />
      </div>

      {/* body text */}
      <div className="space-y-1.5 px-3 pt-1 pb-2">
        <Pulse className="h-3 w-full rounded-full" />
        <Pulse className="h-3 w-11/12 rounded-full" />
        <Pulse className="h-3 w-2/3 rounded-full" />
      </div>
    </div>
  );
}

export default function PostsSkeleton({
  count = 3,
}: {
  count?: number;
}) {
  return (
    <div className="flex flex-col items-stretch">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}
