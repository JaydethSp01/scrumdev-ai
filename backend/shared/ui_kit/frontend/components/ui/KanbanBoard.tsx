"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";

export type Deal = { id: string; title: string; contact: string; value: number; stage: string };

const DEFAULT_STAGES = ["Lead", "Calificado", "Propuesta", "Ganado"];
const DEFAULT_DEALS: Deal[] = [
  { id: "d1", title: "Acme Corp — Plan Pro", contact: "María López", value: 4800, stage: "Lead" },
  { id: "d2", title: "Globex — Anual", contact: "Juan Pérez", value: 12000, stage: "Lead" },
  { id: "d3", title: "Initech — Renovación", contact: "Ana Gómez", value: 7200, stage: "Calificado" },
  { id: "d4", title: "Umbrella — Enterprise", contact: "Carlos Ruiz", value: 26000, stage: "Propuesta" },
  { id: "d5", title: "Soylent — Starter", contact: "Lucía Díaz", value: 1900, stage: "Ganado" },
];

const money = (n: number) => "$" + n.toLocaleString("es");

/** Pipeline kanban de ventas (estilo Pipedrive/HubSpot): columnas por etapa,
 *  tarjetas de deal con valor y contacto, y movimiento entre etapas (← →).
 *  Drag-free para máxima robustez. El "módulo estrella" del CRM. */
export function KanbanBoard({
  stages = DEFAULT_STAGES,
  deals: initial = DEFAULT_DEALS,
}: {
  stages?: string[];
  deals?: Deal[];
}) {
  const [deals, setDeals] = useState<Deal[]>(initial);
  const move = (id: string, dir: number) =>
    setDeals((ds) =>
      ds.map((d) => {
        if (d.id !== id) return d;
        const i = Math.max(0, Math.min(stages.length - 1, stages.indexOf(d.stage) + dir));
        return { ...d, stage: stages[i] };
      })
    );
  const total = (st: string) => deals.filter((d) => d.stage === st).reduce((a, d) => a + d.value, 0);

  return (
    <div className="overflow-x-auto pb-2">
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(240px,1fr))` }}>
      {stages.map((st, si) => (
        <div key={st} className="rounded-2xl bg-slate-100/70 p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-slate-700">{st}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
              {money(total(st))}
            </span>
          </div>
          <div className="space-y-2">
            {deals.filter((d) => d.stage === st).map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">{d.title}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar name={d.contact} className="!h-7 !w-7 !text-xs" />
                  <span className="text-xs text-slate-500">{d.contact}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-brand">{money(d.value)}</span>
                  <div className="flex gap-1">
                    <button onClick={() => move(d.id, -1)} disabled={si === 0}
                      className="rounded-md border border-slate-200 px-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" aria-label="Atrás">←</button>
                    <button onClick={() => move(d.id, 1)} disabled={si === stages.length - 1}
                      className="rounded-md border border-slate-200 px-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" aria-label="Avanzar">→</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}

export default KanbanBoard;
