"use client";

import { useCallback, useEffect, useState } from "react";
import { ShoppingBag, Building2, Code2, FlaskConical, ShieldCheck } from "lucide-react";
import { API, apiGetPipeline } from "@/lib/api";

const TEAM = [
  { key: "PO", icon: ShoppingBag, role: "Product Owner Agent", desc: "Refina la visión en historias con criterios y DoR." },
  { key: "Architect", icon: Building2, role: "Architect Agent", desc: "Propone la arquitectura y firma los ADRs." },
  { key: "Developer", icon: Code2, role: "Developer Agent", desc: "Genera el código del sprint por módulo." },
  { key: "QA", icon: FlaskConical, role: "QA Agent", desc: "Ejecuta pruebas y valida los criterios de aceptación." },
  { key: "Security", icon: ShieldCheck, role: "Security Agent", desc: "Revisa seguridad básica (OWASP, secretos)." },
];

function statusOf(state: string | undefined): Record<string, "active" | "running" | "idle"> {
  const s = state || "";
  const m: Record<string, "active" | "running" | "idle"> = {
    PO: "idle", Architect: "idle", Developer: "idle", QA: "idle", Security: "idle",
  };
  if (["BACKLOG", "REFINEMENT", "NFR_CAPTURE", "PO_REVIEW"].includes(s)) m.PO = "active";
  if (["ARCHITECTURE_INCEPTION", "ARCHITECTURE_APPROVAL_PENDING"].includes(s)) m.Architect = "running";
  if (["READY_FOR_DEVELOPMENT", "DEVELOPMENT"].includes(s)) m.Developer = "running";
  if (s === "CODE_REVIEW") { m.Developer = "active"; m.Security = "running"; }
  if (s === "QA") m.QA = "running";
  return m;
}

const META: Record<string, { dot: string; label: string }> = {
  active: { dot: "bg-emerald-500", label: "Activo" },
  running: { dot: "bg-amber-500 animate-pulse", label: "En ejecución" },
  idle: { dot: "bg-neutral-300 dark:bg-neutral-600", label: "Esperando" },
};

export default function AgentsLivePanel({ projectKey }: { projectKey: string }) {
  const [state, setState] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const p = (await apiGetPipeline(projectKey)) as { current_state?: string };
      setState(p.current_state);
    } catch { /* despertando */ }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const poll = setInterval(() => void load(), 6000);
    let ws: WebSocket | null = null;
    try {
      const base = (process.env.NEXT_PUBLIC_WS_URL || API).replace(/^http/, "ws");
      ws = new WebSocket(`${base}/_svc/orchestrator/projects/${encodeURIComponent(projectKey)}/events/ws`);
      ws.onmessage = () => void load();
    } catch { /* noop */ }
    return () => { clearInterval(poll); try { ws?.close(); } catch { /* noop */ } };
  }, [load, projectKey]);

  const st = statusOf(state);

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-3">Equipo de agentes</h3>
      <div className="space-y-2.5">
        {TEAM.map((a) => {
          const s = st[a.key];
          const m = META[s];
          return (
            <div key={a.key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand/10 text-brand shrink-0">
                  <a.icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.role}</div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 shrink-0">
                  <span className={`w-2 h-2 rounded-full ${m.dot}`} /> {m.label}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-1.5">{a.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
