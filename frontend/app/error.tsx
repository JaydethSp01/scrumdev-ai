"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import Button from "@/components/Button";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ScrumDev AI] root error:", error);
  }, [error]);

  return (
    <main className="min-h-[60vh] grid place-items-center px-6">
      <div className="text-center max-w-md">
        <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-red-500/10 text-red-500">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-2xl font-semibold mt-4">Algo salio mal</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
          {error.message || "Error inesperado en la aplicacion."}
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono text-neutral-500 mt-2">ID: {error.digest}</p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => reset()} leftIcon={<RotateCcw size={14} />}>
            Reintentar
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>
            Volver al inicio
          </Button>
        </div>
      </div>
    </main>
  );
}
