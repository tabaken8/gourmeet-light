// src/components/PostsSkeleton.tsx
import React from "react";

function SkeletonLine({
  wClass = "w-full",
  hClass = "h-3",
}: {
  wClass?: string;
  hClass?: string;
}) {
  return (
    <div
      className={[
        "rounded-full bg-slate-200/80",
        "animate-pulse",
        wClass,
        hClass,
      ].join(" ")}
    />
  );
}

function SkeletonBlock({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-xl bg-slate-200/80",
        "animate-pulse",
        className,
      ].join(" ")}
    />
  );
}

function PostCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* header: avatar + name + meta */}
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonLine wClass="w-32" hClass="h-3.5" />
          <SkeletonLine wClass="w-44" hClass="h-3" />
        </div>
        <SkeletonBlock className="h-8 w-8 rounded-lg" />
      </div>

      {/* content */}
      <div className="mt-4 space-y-2">
        <SkeletonLine wClass="w-full" />
        <SkeletonLine wClass="w-11/12" />
        <SkeletonLine wClass="w-2/3" />
      </div>

      {/* place row */}
      <div className="mt-4 flex items-center gap-2">
        <SkeletonBlock className="h-4 w-4 rounded-md" />
        <SkeletonLine wClass="w-56" hClass="h-3" />
      </div>

      {/* images: 2x2 */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <SkeletonBlock className="aspect-square w-full rounded-xl" />
        <SkeletonBlock className="aspect-square w-full rounded-xl" />
        <SkeletonBlock className="aspect-square w-full rounded-xl" />
        <SkeletonBlock className="aspect-square w-full rounded-xl" />
      </div>

      {/* actions row */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-8 w-16 rounded-full" />
          <SkeletonBlock className="h-8 w-16 rounded-full" />
          <SkeletonBlock className="h-8 w-16 rounded-full" />
        </div>
        <SkeletonBlock className="h-8 w-20 rounded-full" />
      </div>
    </div>
  );
}

export default function PostsSkeleton({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}
