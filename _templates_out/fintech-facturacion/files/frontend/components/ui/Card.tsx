import { cn } from "@/lib/cn";

/** Tarjeta base: rounded-2xl, borde, sombra suave, hover. */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6 dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Tarjeta de métrica del dashboard: label pequeño + número grande + delta opcional. */
export function MetricCard({
  label,
  value,
  icon,
  delta,
  hint,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  delta?: { value: string; positive?: boolean };
  hint?: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        {icon ? <span className="text-brand">{icon}</span> : null}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {delta ? (
        <p className={cn("mt-1 text-sm font-medium", delta.positive ? "text-emerald-600" : "text-rose-600")}>
          {delta.value}
        </p>
      ) : hint ? (
        <p className="mt-1 text-sm text-neutral-500">{hint}</p>
      ) : null}
    </Card>
  );
}

export default Card;
