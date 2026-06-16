"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";

export type Shipment = { id: string; driver: string; dest: string; status: "En tránsito" | "Entregado" | "Retrasado"; x: number; y: number };

const DEFAULT: Shipment[] = [
  { id: "E-1042", driver: "Pedro M.", dest: "Centro", status: "En tránsito", x: 120, y: 90 },
  { id: "E-1043", driver: "Lucía R.", dest: "Norte", status: "Entregado", x: 260, y: 60 },
  { id: "E-1044", driver: "Diego S.", dest: "Sur", status: "Retrasado", x: 180, y: 190 },
  { id: "E-1045", driver: "Ana T.", dest: "Este", status: "En tránsito", x: 320, y: 150 },
];
const tone = (s: string) => (s === "Entregado" ? "success" : s === "Retrasado" ? "danger" : "info");

/** Mapa en vivo de flota (estilo Onfleet): rutas + pines de vehículo sobre un
 *  mapa estilizado (SVG, sin librería) + lista de envíos. Módulo estrella logística. */
export function LiveMap({ shipments = DEFAULT }: { shipments?: Shipment[] }) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm lg:col-span-2">
        <svg viewBox="0 0 420 260" className="h-full w-full">
          {/* grid de calles */}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="260" stroke="#e2e8f0" strokeWidth="1" />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 50} x2="420" y2={i * 50} stroke="#e2e8f0" strokeWidth="1" />
          ))}
          {/* ruta */}
          <polyline points="40,220 120,90 260,60 320,150" fill="none" stroke="currentColor" className="text-brand" strokeWidth="2.5" strokeDasharray="6 5" strokeOpacity="0.7" />
          {/* pines */}
          {shipments.map((s) => (
            <g key={s.id} onClick={() => setSel(s.id)} role="button" tabIndex={0} aria-label={`Envío ${s.id} hacia ${s.dest}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(s.id); } }} className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
              <circle cx={s.x} cy={s.y} r={sel === s.id ? 11 : 8} className="text-brand" fill="currentColor" fillOpacity={sel === s.id ? 1 : 0.85} />
              <circle cx={s.x} cy={s.y} r="3" fill="white" />
            </g>
          ))}
        </svg>
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">● En vivo · {shipments.length} unidades</span>
      </div>
      <div className="space-y-2">
        {shipments.map((s) => (
          <button key={s.id} onClick={() => setSel(s.id)}
            className={cn("flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              sel === s.id ? "border-brand ring-2 ring-brand/20" : "border-slate-200 hover:bg-slate-50")}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{s.id} · {s.dest}</p>
              <p className="truncate text-xs text-slate-500">{s.driver}</p>
            </div>
            <Badge tone={tone(s.status)}>{s.status}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

export default LiveMap;
