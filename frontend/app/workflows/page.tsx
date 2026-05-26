"use client";

import { useState } from "react";
import { Activity, Heart } from "lucide-react";
import ServiceStatusGrid from "@/components/ServiceStatusGrid";

type HealthSnapshot = { ts: string; okCount: number; total: number };

export default function ServicesHealthPage() {
  const [history, setHistory] = useState<HealthSnapshot[]>([]);

  function onSnapshot(snap: HealthSnapshot) {
    setHistory((prev) => {
      const last = prev[0];
      if (last && last.okCount === snap.okCount && last.total === snap.total) return prev;
      return [snap, ...prev].slice(0, 10);
    });
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="flex items-center gap-3">
        <div className="grid place-items-center w-10 h-10 rounded-lg bg-brand/10 text-brand">
          <Heart size={18} />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Salud del sistema</h1>
          <p className="text-sm text-neutral-500">
            Estado en tiempo real de los servicios del backend ScrumDev AI.
          </p>
        </div>
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Servicios
        </h2>
        <ServiceStatusGrid pollIntervalMs={5000} onSnapshot={onSnapshot} />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-2">
          <Activity size={14} /> Histórico (últimas 10 lecturas)
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-neutral-500">Esperando primera lectura...</p>
        ) : (
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-800">
            {history.map((h, i) => {
              const pct = h.total ? Math.round((h.okCount / h.total) * 100) : 0;
              const tone =
                pct === 100
                  ? "bg-green-500"
                  : pct >= 60
                  ? "bg-yellow-500"
                  : "bg-red-500";
              return (
                <div key={i} className="p-3 text-sm flex items-center gap-3">
                  <span className="text-xs text-neutral-500 w-40 shrink-0">
                    {new Date(h.ts).toLocaleTimeString()}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className={`h-full ${tone} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-neutral-500 w-20 text-right">
                    {h.okCount}/{h.total} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
