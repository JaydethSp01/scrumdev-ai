"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import Button from "@/components/Button";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[projects] error:", error);
  }, [error]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={24} className="text-red-500 shrink-0" />
          <div className="flex-1">
            <h2 className="font-semibold">No pudimos cargar tus proyectos</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
              {error.message || "Error inesperado. Reintenta o vuelve al inicio."}
            </p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => reset()} leftIcon={<RotateCcw size={14} />}>
                Reintentar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
