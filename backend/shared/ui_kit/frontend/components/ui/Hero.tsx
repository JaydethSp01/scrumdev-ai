import { cn } from "@/lib/cn";
import { GenerativePattern } from "@/components/ui/GenerativePattern";

/** Banner de bienvenida premium: gradiente de marca, título grande, subtítulo y
 *  acción opcional. Da el "primer golpe de vista" tipo Linear/Vercel. */
export function Hero({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-brand bg-gradient-to-br from-brand-dark to-brand p-6 text-white shadow-lg sm:p-8",
        className
      )}
    >
      <GenerativePattern seed={title} />
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-xl text-white/85">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

export default Hero;
