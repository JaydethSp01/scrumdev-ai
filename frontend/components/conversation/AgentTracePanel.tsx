"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingBag, Building2, Code2, FlaskConical, ShieldCheck, Bot,
  ChevronDown, CheckCircle2, AlertTriangle, XCircle, Loader2,
  ArrowRight, FileText, Clock, FolderOpen, FileCode2, Cpu,
} from "lucide-react";
import {
  API, apiGetAgentRuns, apiGetCode,
  type AgentRun, type AgentRunArtifact, type CodeFile,
} from "@/lib/api";
import OrchestrationStudio from "@/components/conversation/OrchestrationStudio";

// Texto legible para un artefacto producido por un agente.
function artifactLabel(a: AgentRunArtifact): string {
  const t = (a.type || "").toLowerCase();
  if (t === "backlog") return `${a.count ?? 0} historias`;
  if (t === "adr") return `${a.count ?? 0} ADRs`;
  if (t === "sprints") return "sprints planificados";
  if (t === "build") return a.sprint ? `código (sprint ${a.sprint})` : "código generado";
  if (t === "policy_check") return "revisión de políticas";
  if (t === "qa") return "pruebas / evidencia";
  if (t === "deploy") return `deploy → ${a.target || "staging"}`;
  return t || "artefacto";
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Identidad visual por agente (icono + color propio) ───────────────────────
type AgentTheme = {
  icon: typeof Bot;
  // clases tailwind para el "chip" del icono
  chip: string;
  // color de acento del borde / detalles
  ring: string;
  dot: string;
};

const THEMES: Record<string, AgentTheme> = {
  po: { icon: ShoppingBag, chip: "bg-violet-500/15 text-violet-400", ring: "border-violet-500/30", dot: "bg-violet-500" },
  architect: { icon: Building2, chip: "bg-sky-500/15 text-sky-400", ring: "border-sky-500/30", dot: "bg-sky-500" },
  developer: { icon: Code2, chip: "bg-emerald-500/15 text-emerald-400", ring: "border-emerald-500/30", dot: "bg-emerald-500" },
  qa: { icon: FlaskConical, chip: "bg-amber-500/15 text-amber-400", ring: "border-amber-500/30", dot: "bg-amber-500" },
  security: { icon: ShieldCheck, chip: "bg-rose-500/15 text-rose-400", ring: "border-rose-500/30", dot: "bg-rose-500" },
  default: { icon: Bot, chip: "bg-brand/15 text-brand", ring: "border-brand/30", dot: "bg-brand" },
};

// Normaliza nombres heterogéneos del backend ("po_agent", "PO", "Product Owner")
// a una de las claves de THEMES.
function themeKey(agent: string, role = ""): keyof typeof THEMES {
  const s = `${agent} ${role}`.toLowerCase();
  if (s.includes("po") || s.includes("product owner") || s.includes("owner")) return "po";
  if (s.includes("arch")) return "architect";
  if (s.includes("dev") || s.includes("engineer") && s.includes("software")) return "developer";
  if (s.includes("qa") || s.includes("test") || s.includes("quality")) return "qa";
  if (s.includes("sec")) return "security";
  return "default";
}

// Etiqueta legible del agente.
function agentLabel(agent: string): string {
  const map: Record<string, string> = {
    po: "Product Owner", po_agent: "Product Owner",
    architect: "Architect", architect_agent: "Architect",
    developer: "Developer", developer_agent: "Developer",
    qa: "QA", qa_agent: "QA",
    security: "Security", security_agent: "Security",
  };
  return map[agent.toLowerCase()] || agent.replace(/_agent$/i, "").replace(/_/g, " ");
}

// ── Helpers de estado ────────────────────────────────────────────────────────
function statusIcon(status: AgentRun["status"]) {
  if (status === "running") return <Loader2 size={13} className="text-amber-400 animate-spin" />;
  if (status === "failed") return <XCircle size={13} className="text-rose-400" />;
  return <CheckCircle2 size={13} className="text-emerald-400" />;
}

function statusGlyph(status: AgentRun["status"]) {
  if (status === "running") return "·";
  if (status === "failed") return "✗";
  return "✓";
}

function fmtDuration(ms?: number): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ""; }
}

// El orden "natural" del equipo, para que las tarjetas no salten al refrescar.
const ORDER = ["po", "architect", "developer", "qa", "security", "default"];

type Grouped = {
  key: string;
  label: string;
  role: string;
  theme: AgentTheme;
  runs: AgentRun[];
  status: AgentRun["status"] | "idle";
};

export default function AgentTracePanel({ projectKey }: { projectKey: string }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [studioOpen, setStudioOpen] = useState(false);
  // Drill-down: archivos REALES que generó el Developer Agent (lazy-load).
  const [files, setFiles] = useState<CodeFile[] | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const toggleFiles = useCallback(async () => {
    setFilesOpen((v) => !v);
    if (files === null && !filesLoading) {
      setFilesLoading(true);
      try { setFiles(await apiGetCode(projectKey)); }
      catch { setFiles([]); }
      finally { setFilesLoading(false); }
    }
  }, [files, filesLoading, projectKey]);

  const load = useCallback(async () => {
    try {
      const data = await apiGetAgentRuns(projectKey);
      setRuns(Array.isArray(data) ? data : []);
    } catch { /* degrada: deja lo último que había */ }
    finally { setLoaded(true); }
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

  // Agrupa por agente (normalizado) y deja siempre las 5 tarjetas del equipo,
  // aunque no hayan ejecutado nada todavía (estado vacío por agente).
  const groups = useMemo<Grouped[]>(() => {
    const byKey = new Map<string, Grouped>();

    // Siembra el equipo base para que cada agente tenga su tarjeta.
    const base: { key: string; label: string; role: string }[] = [
      { key: "po", label: "Product Owner", role: "Product Owner Agent" },
      { key: "architect", label: "Architect", role: "Architect Agent" },
      { key: "developer", label: "Developer", role: "Developer Agent" },
      { key: "qa", label: "QA", role: "QA Agent" },
      { key: "security", label: "Security", role: "Security Agent" },
    ];
    for (const b of base) {
      byKey.set(b.key, {
        key: b.key, label: b.label, role: b.role,
        theme: THEMES[b.key], runs: [], status: "idle",
      });
    }

    for (const r of runs) {
      const k = themeKey(r.agent, r.role);
      const g = byKey.get(k) || {
        key: k, label: agentLabel(r.agent), role: r.role || agentLabel(r.agent),
        theme: THEMES[k] || THEMES.default, runs: [], status: "idle" as Grouped["status"],
      };
      if (r.role && (g.role === "" || g.role.endsWith("Agent"))) g.role = r.role;
      g.runs.push(r);
      byKey.set(k, g);
    }

    // Orden interno de ejecuciones: más reciente primero.
    for (const g of byKey.values()) {
      g.runs.sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""));
      if (g.runs.some((r) => r.status === "running")) g.status = "running";
      else if (g.runs.some((r) => r.status === "failed")) g.status = "failed";
      else if (g.runs.length > 0) g.status = "done";
      else g.status = "idle";
    }

    return Array.from(byKey.values()).sort(
      (a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)
    );
  }, [runs]);

  const total = runs.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-wider text-neutral-400">Auditoría de agentes</h3>
        <span className="text-[10px] text-neutral-500">
          {total} {total === 1 ? "ejecución" : "ejecuciones"}
        </span>
      </div>

      {/* Entrada al studio de ORQUESTACIÓN en vivo (animado): ver cómo el
          orquestador llama a cada agente, cómo se pasan la info, sus archivos
          y el debug del despliegue. */}
      <button
        onClick={() => setStudioOpen(true)}
        className="group w-full mb-3 flex items-center gap-2.5 rounded-xl p-3 text-left text-white bg-gradient-to-r from-slate-900 to-indigo-900 hover:to-indigo-800 transition shadow-sm overflow-hidden relative"
      >
        <span className="absolute -right-6 -top-8 w-24 h-24 rounded-full bg-brand/30 blur-2xl group-hover:bg-brand/40 transition" />
        <span className="relative grid place-items-center w-8 h-8 rounded-lg bg-white/10 ring-1 ring-white/20">
          <Cpu size={16} className="text-brand-300" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold leading-tight">Ver orquestación en vivo</span>
          <span className="block text-[10.5px] text-white/55 truncate">cómo trabaja cada agente · archivos · debug del deploy</span>
        </span>
        <ArrowRight size={15} className="relative text-white/60 group-hover:translate-x-0.5 transition" />
      </button>
      {studioOpen && (
        <OrchestrationStudio projectKey={projectKey} onClose={() => setStudioOpen(false)} />
      )}

      {loaded && total === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-3 mb-3 text-[11px] text-neutral-500 flex items-center gap-2">
          <Bot size={14} className="shrink-0" />
          <span>Aún no hay acciones de agentes registradas en este proyecto. Inicia el ciclo para verlas aquí.</span>
        </div>
      )}

      <div className="space-y-2.5">
        {groups.map((g) => {
          const isOpen = !!open[g.key];
          const Icon = g.theme.icon;
          const empty = g.runs.length === 0;
          return (
            <div
              key={g.key}
              className={`rounded-xl border ${g.theme.ring} bg-white dark:bg-neutral-950 overflow-hidden`}
            >
              {/* Cabecera de la tarjeta del agente */}
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition"
              >
                <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${g.theme.chip}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{g.label}</div>
                  <div className="text-[11px] text-neutral-500 truncate">{g.role}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] tabular-nums text-neutral-500">
                    {g.runs.length}×
                  </span>
                  {g.status === "idle"
                    ? <span className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                    : g.status === "running"
                      ? <Loader2 size={13} className="text-amber-400 animate-spin" />
                      : g.status === "failed"
                        ? <AlertTriangle size={13} className="text-rose-400" />
                        : <CheckCircle2 size={13} className="text-emerald-400" />}
                  <ChevronDown
                    size={15}
                    className={`text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {/* Detalle expandido: timeline de ejecuciones */}
              {isOpen && (
                <div className="px-3 pb-3 border-t border-neutral-100 dark:border-neutral-900">
                  {empty ? (
                    <p className="text-[11px] text-neutral-500 py-3">
                      Aún no ha ejecutado nada en este proyecto.
                    </p>
                  ) : (
                    <ol className="mt-2 space-y-2.5">
                      {g.runs.map((r) => (
                        <li
                          key={r.id}
                          className="relative pl-4 border-l-2 border-neutral-200 dark:border-neutral-800"
                        >
                          <span className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ${g.theme.dot}`} />
                          {/* línea principal: acción + estado + duración */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[13px] font-medium leading-tight">
                                {statusIcon(r.status)}
                                <span className="truncate">{r.action}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-neutral-500">
                                <span className="px-1.5 py-px rounded bg-neutral-100 dark:bg-neutral-800/80 uppercase tracking-wide">
                                  {r.phase}
                                </span>
                                {r.started_at && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <Clock size={9} /> {fmtTime(r.started_at)}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-0.5">
                                  · {fmtDuration(r.duration_ms)}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`text-[11px] shrink-0 ${
                                r.status === "failed" ? "text-rose-400"
                                  : r.status === "running" ? "text-amber-400"
                                    : "text-emerald-400"
                              }`}
                              title={r.status}
                            >
                              {statusGlyph(r.status)}
                            </span>
                          </div>

                          {r.summary && (
                            <p className="mt-1 text-[11.5px] text-neutral-600 dark:text-neutral-300 leading-snug">
                              {r.summary}
                            </p>
                          )}

                          {/* input → output */}
                          {(r.input_summary || r.output_summary) && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-neutral-500">
                              <span className="min-w-0 flex-1 truncate rounded bg-neutral-50 dark:bg-neutral-900 px-1.5 py-1 border border-neutral-100 dark:border-neutral-800">
                                <span className="text-neutral-400">in:</span> {r.input_summary || "—"}
                              </span>
                              <ArrowRight size={11} className="shrink-0 text-neutral-400" />
                              <span className="min-w-0 flex-1 truncate rounded bg-neutral-50 dark:bg-neutral-900 px-1.5 py-1 border border-neutral-100 dark:border-neutral-800">
                                <span className="text-neutral-400">out:</span> {r.output_summary || "—"}
                              </span>
                            </div>
                          )}

                          {/* artefactos producidos */}
                          {r.artifacts && r.artifacts.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.artifacts.map((a, i) => (
                                <span
                                  key={`${r.id}-art-${i}`}
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                                >
                                  <FileText size={10} className="shrink-0 text-neutral-400" />
                                  <span className="truncate max-w-[170px]">{artifactLabel(a)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

                  {/* Developer Agent: ver los ARCHIVOS reales que generó */}
                  {g.key === "developer" && g.runs.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-900">
                      <button
                        onClick={toggleFiles}
                        className="flex items-center gap-1.5 text-[11.5px] font-medium text-brand hover:underline"
                      >
                        <FolderOpen size={13} />
                        {filesOpen ? "Ocultar" : "Ver"} archivos generados
                        {files && <span className="text-neutral-400">({files.length})</span>}
                        {filesLoading && <Loader2 size={12} className="animate-spin" />}
                      </button>
                      {filesOpen && files && (
                        files.length === 0 ? (
                          <p className="mt-2 text-[11px] text-neutral-500">
                            Aún no hay archivos generados (el código se produce en Desarrollo).
                          </p>
                        ) : (
                          <ul className="mt-2 max-h-64 overflow-y-auto space-y-0.5 pr-1">
                            {files.map((f) => (
                              <li
                                key={f.id || f.file_path}
                                className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300 py-0.5"
                                title={f.file_path}
                              >
                                <FileCode2 size={11} className="shrink-0 text-neutral-400" />
                                <span className="truncate flex-1 font-mono">{f.file_path}</span>
                                <span className="shrink-0 text-[10px] text-neutral-400 tabular-nums">{fmtBytes((f.content || "").length)}</span>
                              </li>
                            ))}
                          </ul>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
