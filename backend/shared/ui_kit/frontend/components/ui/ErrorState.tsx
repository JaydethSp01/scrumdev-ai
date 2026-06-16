"use client";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

/** Estado de error amable: icono, título, mensaje y botón "Reintentar" (si hay onRetry).
 *  Modo claro, color de marca. Úsalo cuando una carga falla. */
export function ErrorState({
  title = "Algo salió mal",
  message = "No pudimos cargar la información. Intenta de nuevo.",
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm",
        className
      )}
    >
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-rose-100 text-rose-600">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export default ErrorState;
