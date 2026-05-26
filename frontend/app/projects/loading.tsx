import { SkeletonGrid } from "@/components/SkeletonCard";

export default function ProjectsLoading() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-brand/8 via-fuchsia-500/4 to-cyan-500/6 p-8 mb-7">
        <div className="h-8 w-48 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
        <div className="h-4 w-96 mt-3 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
      </div>
      <SkeletonGrid count={6} />
    </main>
  );
}
