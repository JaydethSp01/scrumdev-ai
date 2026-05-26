"use client";

export function SkeletonCard() {
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-950 overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-neutral-200 to-neutral-300 dark:from-neutral-800 dark:to-neutral-700 animate-pulse" />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
            <div className="h-3 w-1/4 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="h-12 bg-neutral-200 dark:bg-neutral-800 rounded-lg animate-pulse" />
          <div className="h-12 bg-neutral-200 dark:bg-neutral-800 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export default SkeletonCard;
