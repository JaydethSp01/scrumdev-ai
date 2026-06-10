"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Play, Lock } from "lucide-react";
import { API, apiGetPipeline } from "@/lib/api";

type Phase = {
  state: string; label: string; human_gate: boolean; gate_n?: number;
  status: "done" | "current" | "pending";
};
type PV = { current_state?: string; current_index?: number; total?: number; phases?: Phase[] };

// Agente activo según la fase (semáforo).
const AGENTS = ["PO", "Architect", "Developer", "QA", "Security"];
function agentStatus(state?: string): Record<string, "active" | "running" | "idle"> {
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

const DOT: Record<string, string> = {
  active: "bg-emerald-500", running: "bg-amber-500", idle: "bg-neutral-300 dark:bg-neutral-700",
};

export default function LiveContextPanel({ projectKey }: { projectKey: string }) {
  const [pv, setPv] = useState<PV | null>(null);

  const load = useCallback(async () => {
    try { setPv((await apiGetPipeline(projectKey)) as PV); } catch { /* despertando */ }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  // Tiempo real: WS de eventos + poll de respaldo.
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

  const gates = (pv?.phases || []).filter((p) => p.human_gate);
  const agents = agentStatus(pv?.current_state);

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider text-neutral-400">Pipeline · 6 gates</h3>
          {typeof pv?.current_index === "number" && (
            <span className="text-[10px] text-neutral-400">fase {(pv.current_index ?? 0) + 1}/{pv.total ?? 14}</span>
          )}
        </div>
        <ul className="space-y-1.5">
          {gates.map((g) => (
            <li key={g.state} className="flex items-center gap-2 text-sm">
              {g.status === "done" ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                : g.status === "current" ? <Play size={14} className="text-brand shrink-0" />
                : <Circle size={13} className="text-neutral-300 dark:text-neutral-700 shrink-0" />}
              <span className={g.status === "current" ? "font-medium text-brand" : g.status === "done" ? "text-neutral-500" : "text-neutral-400"}>
                {g.label}
              </span>
              {g.status === "current" && <Lock size={11} className="text-amber-500 ml-auto" />}
            </li>
          ))}
          {gates.length === 0 && <li className="text-xs text-neutral-400">Esperando el pipeline…</li>}
        </ul>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-2">Agentes</h3>
        <ul className="space-y-1.5">
          {AGENTS.map((a) => (
            <li key={a} className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[agents[a]]}`} />
              <span className="text-neutral-600 dark:text-neutral-300">{a}</span>
              <span className="text-[10px] text-neutral-400 ml-auto capitalize">{agents[a]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
