import { cn } from "@/lib/cn";

/** Bloque de carga (shimmer). Úsalo mientras llegan los datos en vez de pantalla vacía. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200", className)} />;
}

/** Tarjeta de carga con varias líneas skeleton — placeholder de una Card real. */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-4 h-8 w-2/3" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-5/6" />
      <Skeleton className="mt-2 h-3 w-4/6" />
    </div>
  );
}

export default Skeleton;
