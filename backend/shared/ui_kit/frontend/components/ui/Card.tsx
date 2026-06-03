import { cn } from "@/lib/cn";

/** Tarjeta base: rounded-2xl, borde claro, sombra suave, hover. Modo claro. */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Tarjeta de métrica: label + número grande + delta, con chip de icono en
 *  color de marca (tinte) — da color y jerarquía al dashboard. */
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
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-brand" />
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon ? (
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">{icon}</span>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {delta ? (
        <p className={cn("mt-1 text-sm font-medium", delta.positive ? "text-emerald-600" : "text-rose-600")}>
          {delta.value}
        </p>
      ) : hint ? (
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      ) : null}
    </Card>
  );
}

export default Card;
