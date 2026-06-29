"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  X, Cpu, ShoppingBag, Building2, Code2, FlaskConical, ShieldCheck,
  CalendarRange, Rocket, Bot, CheckCircle2, Loader2, AlertTriangle,
  FileCode2, FileText, Layers, ChevronRight, Activity, ExternalLink,
  Image as ImageIcon, CornerDownRight, MinusCircle, XCircle, ScrollText,
  Monitor, RefreshCw, GitBranch, Server, ShieldAlert, Wrench,
} from "lucide-react";
import {
  apiGetOrchestration, apiGetCode, apiGetRefinement, apiGetAdrs, apiGetDeployPreview,
  apiGetBacklog, apiRepairDeploy, apiExecutiveSummary,
  type Orchestration, type OrchestrationStep, type CodeFile, type RefinementStory,
  type AdrItem, type DeployPreview, type BacklogItem,
} from "@/lib/api";

// ── Identidad por agente ─────────────────────────────────────────────────────
type Theme = { icon: typeof Bot; grad: string; ring: string; text: string; soft: string };
const THEMES: Record<string, Theme> = {
  po:        { icon: ShoppingBag,  grad: "from-violet-500 to-fuchsia-500", ring: "ring-violet-400/40",  text: "text-violet-400",  soft: "bg-violet-500/10" },
  architect: { icon: Building2,    grad: "from-sky-500 to-cyan-500",       ring: "ring-sky-400/40",     text: "text-sky-400",     soft: "bg-sky-500/10" },
  scrum:     { icon: CalendarRange,grad: "from-amber-500 to-orange-500",   ring: "ring-amber-400/40",   text: "text-amber-400",   soft: "bg-amber-500/10" },
  developer: { icon: Code2,        grad: "from-emerald-500 to-teal-500",   ring: "ring-emerald-400/40", text: "text-emerald-400", soft: "bg-emerald-500/10" },
  review:    { icon: ShieldCheck,  grad: "from-rose-500 to-pink-500",      ring: "ring-rose-400/40",    text: "text-rose-400",    soft: "bg-rose-500/10" },
  qa:        { icon: FlaskConical, grad: "from-yellow-500 to-amber-500",   ring: "ring-yellow-400/40",  text: "text-yellow-400",  soft: "bg-yellow-500/10" },
  devops:    { icon: Rocket,       grad: "from-indigo-500 to-blue-500",    ring: "ring-indigo-400/40",  text: "text-indigo-400",  soft: "bg-indigo-500/10" },
  default:   { icon: Bot,          grad: "from-brand to-brand-dark",       ring: "ring-brand/40",       text: "text-brand",       soft: "bg-brand/10" },
};
function themeOf(agent: string, role = ""): Theme {
  const s = `${agent} ${role}`.toLowerCase();
  if (s.includes("product owner") || s.startsWith("po")) return THEMES.po;
  if (s.includes("arch")) return THEMES.architect;
  if (s.includes("scrum")) return THEMES.scrum;
  if (s.includes("develop")) return THEMES.developer;
  if (s.includes("review") || s.includes("security")) return THEMES.review;
  if (s.includes("qa")) return THEMES.qa;
  if (s.includes("devops") || s.includes("deploy") || s.includes("release")) return THEMES.devops;
  return THEMES.default;
}
// Cómo describir el handoff (qué le pasa un agente al siguiente).
function handoffLabel(from: string): string {
  const f = from.toLowerCase();
  if (f.includes("po") || f.includes("owner")) return "entregó el backlog →";
  if (f.includes("arch")) return "entregó la arquitectura →";
  if (f.includes("scrum")) return "entregó el plan de sprints →";
  if (f.includes("develop")) return "entregó el código →";
  if (f.includes("review")) return "entregó la revisión →";
  if (f.includes("qa")) return "entregó la evidencia →";
  return "pasó la posta →";
}
// POR QUÉ el orquestador activa a ESTE agente ahora (la lógica del flujo Scrum,
// que es FIJO y gateado por el Taller 3 — esto solo lo hace explícito en la traza).
function whyScrum(agent: string, role = ""): string {
  const s = `${agent} ${role}`.toLowerCase();
  if (/owner|^po\b|\bpo\b/.test(s))
    return "el ciclo Scrum arranca por el backlog: traducir la visión en historias priorizadas (DoR).";
  if (/scrum/.test(s))
    return "con el backlog refinado, toca planificar: armar el sprint con las historias listas.";
  if (/arch/.test(s))
    return "antes de codificar se define la arquitectura sobre las historias + requisitos no funcionales.";
  if (/develop|dev\b/.test(s))
    return "con el sprint y la arquitectura definidos, se implementan las historias del sprint.";
  if (/review/.test(s))
    return "código terminado → revisión de patrones, políticas y seguridad antes de integrar.";
  if (/qa|quality|test/.test(s))
    return "revisado → QA valida contra los criterios de aceptación (Definition of Done).";
  if (/devops|deploy|release/.test(s))
    return "validado → se publica a staging para que el PO apruebe el release.";
  return "siguiente paso del flujo Scrum gateado.";
}
function fmtDur(ms?: number | null): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
const cleanName = (n?: string | null) => (n || "").replace(/ Agent$/i, "").trim();
const fullUrl = (u?: string | null) => (!u ? null : u.startsWith("http") ? u : `https://${u}`);

// Reloj en vivo: cuánto lleva corriendo un paso (feedback constante).
function Elapsed({ since }: { since?: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  const ms = Date.now() - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return <span className="tabular-nums">{fmtDur(ms)}</span>;
}

// Estado normalizado de un paso → clasificación visual.
function stepKind(status: string): "running" | "error" | "skipped" | "done" {
  if (status === "running") return "running";
  if (status === "error" || status === "failed") return "error";
  if (status === "skipped") return "skipped";
  return "done";
}

export default function OrchestrationStudio({
  projectKey, onClose,
}: { projectKey: string; onClose: () => void }) {
  const [data, setData] = useState<Orchestration | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openStep, setOpenStep] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiGetOrchestration(projectKey);
    if (d) setData(d);
    setLoaded(true);
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);
  // cerrar con ESC
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const steps = data?.steps || [];
  const deploy = data?.deploy;
  const active = data?.active_agent || null;

  // Actividad EN VIVO: qué se está haciendo AHORA (para que el cliente sepa dónde va
  // en generaciones largas y no se estrese). Todo deriva de pasos persistidos en DB,
  // así que un reload re-hidrata el mismo estado: no se pierde nada.
  const runningStep = useMemo(
    () => [...steps].reverse().find((s) => s.status === "running") || null, [steps]);
  const filesDone = useMemo(
    () => steps.filter((s) => s.status === "done" &&
      /\.(tsx|ts|jsx|js|py)\b/.test(s.output_summary || "")).length, [steps]);

  // equipo único en orden de aparición (para el rail)
  const team = useMemo(() => {
    const rank = { running: 3, error: 2, done: 1, skipped: 0 } as const;
    const seen = new Map<string, { agent: string; role: string; status: "running" | "error" | "skipped" | "done" }>();
    for (const s of steps) {
      const cur = seen.get(s.agent);
      const k = stepKind(s.status);
      // running siempre gana; si no, conserva el de mayor severidad.
      const next = !cur ? k : (rank[k] >= rank[cur.status] ? k : cur.status);
      seen.set(s.agent, { agent: s.agent, role: s.role, status: next });
    }
    return Array.from(seen.values());
  }, [steps]);

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-slate-950/75 backdrop-blur-md p-0 sm:p-3 md:p-4 animate-[fade_.2s_ease]">
      <style jsx global>{`
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes flowline { 0% { background-position: 0 0 } 100% { background-position: 0 18px } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 0 0 rgba(91,108,255,.5) } 50% { box-shadow: 0 0 0 9px rgba(91,108,255,0) } }
        .os-flowline { background-image: linear-gradient(180deg, currentColor 55%, transparent 55%); background-size: 2px 11px; animation: flowline 1s linear infinite; }
        .os-glow { animation: glow 1.8s ease-in-out infinite; }
        .os-grid { background-image: radial-gradient(circle at 1px 1px, rgba(91,108,255,.07) 1px, transparent 0); background-size: 22px 22px; }
      `}</style>

      <div className="relative w-full max-w-[95rem] h-full sm:h-[96vh] rounded-none sm:rounded-3xl overflow-hidden bg-neutral-950 shadow-[0_30px_90px_-20px_rgba(0,0,0,.7)] ring-1 ring-neutral-800 flex flex-col">
        {/* ── Header ── */}
        <header className="relative shrink-0 px-6 py-5 bg-gradient-to-br from-indigo-950 via-slate-900 to-brand-900 text-white overflow-hidden">
          <div className="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-brand/40 blur-3xl" />
          <div className="absolute left-1/3 -bottom-20 w-72 h-40 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/20">
              <Cpu size={20} className="text-brand-300" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
                Orquestación en vivo
                {active && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {active} trabajando
                  </span>
                )}
              </h2>
              <p className="text-[12px] text-white/60 truncate">
                El orquestador coordina al equipo de agentes · fase actual:{" "}
                <span className="text-white/90 font-medium">{data?.current_label || data?.current_state || "—"}</span>
              </p>
            </div>
            <button onClick={onClose} aria-label="Cerrar"
              className="grid place-items-center w-9 h-9 rounded-lg hover:bg-white/10 transition">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[270px_1fr]">
          {/* ── Rail del equipo ── */}
          <aside className="hidden lg:flex flex-col gap-1.5 p-4 border-r border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 flex items-center gap-1.5">
              <Activity size={11} /> Equipo
            </p>
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-slate-900 text-white">
              <span className="grid place-items-center w-7 h-7 rounded-lg bg-white/10"><Cpu size={14} /></span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold leading-tight">Orquestador</div>
                <div className="text-[10px] text-white/50">máquina de estados</div>
              </div>
            </div>
            <div className="ml-3.5 my-0.5 h-3 w-px text-neutral-600 os-flowline" />
            {team.length === 0 && (
              <p className="text-[11px] text-neutral-500 px-2">Aún no hay agentes en acción. Inicia el ciclo.</p>
            )}
            {team.map((m) => {
              const th = themeOf(m.agent, m.role);
              const Icon = th.icon;
              const running = m.status === "running";
              return (
                <button key={m.agent}
                  onClick={() => {
                    const s = [...steps].reverse().find((x) => x.agent === m.agent);
                    if (s) setOpenStep(s.id);
                  }}
                  className={`group flex items-center gap-2.5 px-2 py-2 rounded-xl text-left transition hover:bg-neutral-800 border ${running ? "border-transparent ring-2 " + th.ring + " bg-neutral-800 os-glow" : m.status === "error" ? "border-rose-500/40 bg-rose-500/10 ring-1 ring-rose-500/30" : m.status === "skipped" ? "border-neutral-800/70 bg-neutral-900/40 opacity-70" : "border-neutral-800/70 bg-neutral-900/60"}`}>
                  <span className={`grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br ${th.grad} text-white shrink-0`}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium leading-tight truncate">{m.agent.replace(/ Agent$/i, "")}</div>
                    <div className="text-[10px] text-neutral-500 truncate">{m.role}</div>
                  </div>
                  {running ? <Loader2 size={13} className="text-emerald-500 animate-spin" />
                    : m.status === "error" ? <AlertTriangle size={13} className="text-rose-500" />
                    : m.status === "skipped" ? <MinusCircle size={13} className="text-neutral-500" />
                    : <CheckCircle2 size={13} className="text-emerald-500" />}
                </button>
              );
            })}
          </aside>

          {/* ── Registro de orquestación (flujo) ── */}
          <main className="min-h-0 overflow-y-auto p-5 sm:p-7 bg-gradient-to-b from-neutral-900/40 to-neutral-950 os-grid">
            {/* Actividad EN VIVO: qué hace AHORA + progreso (reload-safe) */}
            <LiveActivity data={data} runningStep={runningStep} filesDone={filesDone}
              deploy={deploy} projectKey={projectKey} />

            {/* Mockup REAL: la app desplegada, en vivo */}
            <LivePreview projectKey={projectKey} deploy={deploy} />

            {/* Debug del despliegue (cuando aplica) */}
            {deploy && deploy.state && (
              <DeployDebug deploy={deploy} projectKey={projectKey} />
            )}

            {/* Tablero del sprint: dónde va cada historia (Backlog → En progreso → Hecho) */}
            <SprintBoard projectKey={projectKey} state={data?.current_state} />

            <p className="text-[10.5px] uppercase tracking-[0.14em] text-neutral-500 mb-4 flex items-center gap-1.5 font-medium">
              <Activity size={12} className="text-brand" /> Registro de orquestación · cómo se pasan la información
            </p>

            {loaded && steps.length === 0 && (
              <div className="mx-auto max-w-md mt-8 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-10 text-center shadow-sm">
                <span className="mx-auto mb-3 grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white os-glow">
                  <Cpu size={26} />
                </span>
                <p className="text-[15px] font-semibold text-neutral-100">El equipo aún no arranca</p>
                <p className="mt-1.5 text-[12.5px] text-neutral-500 leading-relaxed">
                  Cuando inicies el ciclo verás aquí, paso a paso y en vivo, cómo el orquestador
                  llama a cada agente y cómo se pasan el trabajo entre ellos.
                </p>
              </div>
            )}

            <ol className="relative">
              {steps.map((s, i) => (
                <Fragment key={s.id}>
                  {/* relay del orquestador: hace VISIBLE que él coordina el handoff */}
                  <OrchestratorRelay prev={steps[i - 1]} cur={s} first={i === 0} />
                  <StepCard
                    step={s}
                    index={i}
                    isLast={i === steps.length - 1}
                    open={openStep === s.id}
                    onToggle={() => setOpenStep(openStep === s.id ? null : s.id)}
                    projectKey={projectKey}
                  />
                </Fragment>
              ))}
            </ol>
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Actividad EN VIVO ─────────────────────────────────────────────────────────
// Banner prominente y tranquilizador: dice QUÉ se está haciendo AHORA, con progreso,
// para que en generaciones largas el cliente sepa dónde va y no se estrese. Como todo
// sale de pasos persistidos en DB, recargar la página NO pierde nada (se re-hidrata).
function LiveActivity({
  data, runningStep, filesDone, deploy, projectKey,
}: {
  data: Orchestration | null;
  runningStep: OrchestrationStep | null;
  filesDone: number;
  deploy?: Orchestration["deploy"];
  projectKey: string;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const loadSummary = async () => {
    if (loadingSummary) return;
    setLoadingSummary(true);
    try {
      const r = await apiExecutiveSummary(projectKey);
      setSummary(r.summary || "No pude generar el resumen ahora.");
    } finally {
      setLoadingSummary(false);
    }
  };
  if (!data) return null;
  const state = data.current_state || "";
  const isReleased = state === "RELEASED";
  const isGate = !!data.is_gate;
  const deployActive = !!deploy && !!deploy.state &&
    !/done|released|degraded/i.test(deploy.state);

  // Determinar el mensaje + progreso según en qué punto va el flujo.
  let icon = <Loader2 size={16} className="animate-spin text-brand" />;
  let title = data.current_label || state || "En progreso";
  let detail = "";
  let pct: number | null = null;
  let tone = "from-brand/15 via-neutral-900/60 to-neutral-950 border-brand/25";

  if (deployActive) {
    title = "Publicando tu app";
    detail = deploy?.phase_label || "Compilando y desplegando…";
    pct = typeof deploy?.phase_pct === "number" ? deploy!.phase_pct! : null;
    tone = "from-indigo-500/15 via-neutral-900/60 to-neutral-950 border-indigo-400/25";
  } else if (runningStep) {
    title = `Orquestador → ${cleanName(runningStep.agent)}`;
    const handed = runningStep.input_summary
      ? `le pasó: ${runningStep.input_summary}. ` : "";
    let doing = runningStep.output_summary || runningStep.action || "procesando…";
    if (/develop/i.test(runningStep.agent + runningStep.role) && filesDone > 0)
      doing = `generando código · ${filesDone} archivo${filesDone === 1 ? "" : "s"} listos · ${doing}`;
    detail = `${handed}Ahora ${cleanName(runningStep.agent)} está: ${doing}`;
    tone = "from-emerald-500/12 via-neutral-900/60 to-neutral-950 border-emerald-400/25";
  } else if (isGate) {
    icon = <ShieldAlert size={16} className="text-amber-400" />;
    title = "Esperando tu aprobación";
    detail = data.current_label || "Revisa y aprueba para continuar el flujo Scrum.";
    tone = "from-amber-500/12 via-neutral-900/60 to-neutral-950 border-amber-400/25";
  } else if (isReleased) {
    icon = <CheckCircle2 size={16} className="text-emerald-400" />;
    title = "Ciclo completado";
    detail = "La app está publicada. Revisa el mockup en vivo abajo.";
    tone = "from-emerald-500/12 via-neutral-900/60 to-neutral-950 border-emerald-400/25";
  }

  return (
    <div className={`mb-5 rounded-2xl border bg-gradient-to-br ${tone} px-4 py-3.5`}>
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/5 ring-1 ring-white/10 shrink-0">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-neutral-100">{title}</span>
            {runningStep?.started_at && !deployActive && (
              <span className="text-[10.5px] tabular-nums text-neutral-500 inline-flex items-center gap-1">
                <Loader2 size={9} className="animate-spin" /><Elapsed since={runningStep.started_at} />
              </span>
            )}
            <span className="ml-auto text-[10px] px-1.5 py-px rounded-full bg-white/5 text-neutral-400 ring-1 ring-white/10">
              {state.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-neutral-400 leading-snug line-clamp-2">{detail}</p>
          {pct != null && (
            <div className="mt-2 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-indigo-400 transition-all duration-700"
                style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
            </div>
          )}
        </div>
      </div>
      {!isReleased && (
        <p className="mt-2 text-[10px] text-neutral-500 flex items-center gap-1.5">
          <RefreshCw size={10} /> Puedes recargar o cerrar esta página sin perder el progreso — todo se guarda en el servidor.
        </p>
      )}
      {/* Resumen ejecutivo para el cliente (solo al terminar) */}
      {isReleased && (
        <div className="mt-3">
          {!summary ? (
            <button onClick={loadSummary} disabled={loadingSummary}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-1.5 rounded-lg bg-white/5 text-neutral-200 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-60 transition">
              {loadingSummary ? <Loader2 size={12} className="animate-spin" /> : <ScrollText size={12} />}
              {loadingSummary ? "Generando…" : "Resumen para el cliente"}
            </button>
          ) : (
            <div className="rounded-lg bg-neutral-900/70 border border-neutral-800 p-3">
              <div className="text-[9px] uppercase tracking-wide text-neutral-500 mb-1 flex items-center gap-1">
                <ScrollText size={10} className="text-brand" /> Resumen para el cliente
              </div>
              <p className="text-[12px] text-neutral-200 leading-relaxed">{summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mockup REAL: la app desplegada en vivo (iframe + enlaces) ─────────────────
function LivePreview({
  projectKey, deploy,
}: { projectKey: string; deploy?: Orchestration["deploy"] }) {
  const [pv, setPv] = useState<DeployPreview | null>(null);
  const [embed, setEmbed] = useState(false);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    try { setPv(await apiGetDeployPreview(projectKey)); } catch { /* noop */ }
  }, [projectKey]);
  useEffect(() => { void load(); }, [load]);
  // Refresca el estado del deploy mientras "calienta" / sigue desplegando.
  useEffect(() => {
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const url = fullUrl(pv?.vercel_url || deploy?.vercel_url || deploy?.url);
  const gitUrl = fullUrl(pv?.github_url || deploy?.git_url);
  const apiUrl = fullUrl(deploy?.api_url);
  if (!url) return null;

  const gateOk = pv?.gate_ok !== false;
  const warming = !!pv?.backend_warming;
  const e2eFails = pv?.e2e_fails || deploy?.e2e_fails || [];

  return (
    <div className="mb-5 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-neutral-900/60 to-neutral-950 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white shrink-0">
          <Monitor size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight flex items-center gap-2">
            App en vivo · el mockup real
            {gateOk
              ? <span className="text-[10px] px-1.5 py-px rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30">build gate ✓</span>
              : <span className="text-[10px] px-1.5 py-px rounded-full bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30">gate falló</span>}
            {warming && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-px rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
                <Loader2 size={9} className="animate-spin" /> backend calentando
              </span>
            )}
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-emerald-400/90 hover:underline truncate inline-block max-w-full">
            {url.replace(/^https?:\/\//, "")}
          </a>
        </div>
        <button onClick={() => { setEmbed((v) => !v); setNonce((n) => n + 1); }}
          className="shrink-0 inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 transition">
          <Monitor size={13} /> {embed ? "Ocultar" : "Ver app embebida"}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg bg-white/5 text-white ring-1 ring-white/15 hover:bg-white/10 transition">
          <ExternalLink size={13} /> Abrir
        </a>
      </div>

      {/* enlaces de soporte */}
      <div className="px-4 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-neutral-400">
        {gitUrl && (
          <a href={gitUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-neutral-200">
            <GitBranch size={11} /> repositorio
          </a>
        )}
        {apiUrl && (
          <a href={apiUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-neutral-200">
            <Server size={11} /> API
          </a>
        )}
        <span className="inline-flex items-center gap-1">estado vercel: <span className="text-neutral-200">{pv?.state || deploy?.state || "—"}</span></span>
      </div>

      {/* fallos e2e si los hay */}
      {!gateOk && e2eFails.length > 0 && (
        <ul className="px-4 pb-2 space-y-0.5">
          {e2eFails.slice(0, 5).map((f, i) => (
            <li key={i} className="text-[11px] text-rose-300 flex items-start gap-1"><span>•</span>{f}</li>
          ))}
        </ul>
      )}

      {embed && (
        <div className="relative border-t border-emerald-500/20 bg-black">
          <div className="absolute right-2 top-2 z-10 flex gap-1.5">
            <button onClick={() => setNonce((n) => n + 1)}
              className="grid place-items-center w-7 h-7 rounded-md bg-black/60 text-white/80 ring-1 ring-white/15 hover:text-white" title="Recargar">
              <RefreshCw size={13} />
            </button>
          </div>
          <iframe
            key={nonce}
            src={url}
            title="App desplegada en vivo"
            className="w-full h-[60vh] bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            loading="lazy"
          />
          <p className="px-4 py-2 text-[10.5px] text-neutral-500">
            ¿No carga? Algunos despliegues bloquean el embebido por seguridad — usa “Abrir” para verlo en una pestaña nueva.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Barra de debug del despliegue ────────────────────────────────────────────
function DeployDebug({
  deploy, projectKey,
}: { deploy: NonNullable<Orchestration["deploy"]>; projectKey: string }) {
  const [repairing, setRepairing] = useState(false);
  const failed = deploy.state === "gate_failed" || deploy.state === "error" || deploy.state === "done_degraded";
  const done = deploy.state === "done";
  const isRepairing = deploy.state === "repairing" || repairing;
  const hasE2eFails = Array.isArray(deploy.e2e_fails) && deploy.e2e_fails.length > 0;
  const canRepair = (failed || hasE2eFails) && !isRepairing;
  const pct = Math.max(5, Math.min(100, deploy.phase_pct ?? (done ? 100 : 20)));
  const onRepair = async () => {
    setRepairing(true);
    await apiRepairDeploy(projectKey);
    // el polling de /orchestration mostrará el progreso (repairing -> building -> done)
  };
  return (
    <div className={`mb-5 rounded-2xl border p-4 ${failed ? "border-rose-500/30 bg-rose-500/10" : done ? "border-emerald-500/30 bg-emerald-500/10" : "border-indigo-500/30 bg-indigo-500/10"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`grid place-items-center w-7 h-7 rounded-lg text-white bg-gradient-to-br ${failed ? "from-rose-500 to-pink-500" : "from-indigo-500 to-blue-500"}`}>
          <Rocket size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight">DevOps Agent · Despliegue</div>
          <div className="text-[11px] text-neutral-400 truncate">{deploy.phase_label || deploy.state}</div>
        </div>
        {!failed && !done && <Loader2 size={14} className="text-indigo-500 animate-spin" />}
        {done && <CheckCircle2 size={15} className="text-emerald-500" />}
        {failed && <AlertTriangle size={15} className="text-rose-500" />}
      </div>
      <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden ring-1 ring-white/5">
        <div className={`h-full rounded-full transition-all duration-700 ${failed ? "bg-rose-500" : "bg-gradient-to-r from-indigo-500 to-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
      {/* dónde se quedó / resultado */}
      {failed && (
        <p className="mt-2 text-[11.5px] text-rose-300">
          ⚠ Se detuvo aquí: {deploy.error || "el build local falló y NO se subió nada (deploy abortado, sin romper la nube)."}
        </p>
      )}
      {deploy.gate_detail && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 ring-1 ring-white/5 p-2.5 text-[10.5px] leading-relaxed text-neutral-300 whitespace-pre-wrap break-words">
          {deploy.gate_detail}
        </pre>
      )}
      {Array.isArray(deploy.e2e_fails) && deploy.e2e_fails.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {deploy.e2e_fails.slice(0, 4).map((f, i) => (
            <li key={i} className="text-[11px] text-amber-300 flex items-start gap-1"><span>•</span>{f}</li>
          ))}
        </ul>
      )}
      {/* Botón CORREGIR: la IA arregla el código de la app y redespliega sola */}
      {(canRepair || isRepairing) && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {isRepairing ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-300">
              <Loader2 size={13} className="animate-spin" />
              {deploy.phase_label || "Reparando con IA y redesplegando…"}
            </span>
          ) : (
            <>
              <button onClick={onRepair}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition">
                <Wrench size={13} /> Corregir con IA
              </button>
              <span className="text-[10.5px] text-neutral-500">
                La IA analiza el fallo, corrige el código de tu app y la vuelve a publicar.
              </span>
            </>
          )}
        </div>
      )}
      {/* feedback cuando la reparación terminó OK */}
      {done && deploy.repair_summary && (
        <p className="mt-2 text-[11px] text-emerald-300 flex items-start gap-1.5">
          <CheckCircle2 size={12} className="mt-0.5 shrink-0" /> Reparado: {deploy.repair_summary}
        </p>
      )}
      {done && deploy.url && (
        <a href={deploy.url.startsWith("http") ? deploy.url : `https://${deploy.url}`} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-400 hover:underline">
          <ExternalLink size={12} /> Abrir la app publicada
        </a>
      )}
    </div>
  );
}

// ── Tarjeta de paso (un agente en el flujo) ──────────────────────────────────
// ── Sprint board (tablero Scrum) ──────────────────────────────────────────────
// Vista Backlog → En progreso → Hecho con las historias del PO. El orden del flujo
// es el de Taller 3 (fijo); esto SOLO visualiza dónde va cada historia en el sprint.
const DEV_STATES = ["DEVELOPMENT", "CODE_REVIEW", "QA", "PO_REVIEW", "RELEASE_APPROVAL",
  "STAGING_DEPLOYMENT", "PRODUCTION_DEPLOYMENT"];
function SprintBoard({ projectKey, state }: { projectKey: string; state?: string | null }) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [open, setOpen] = useState(true);
  const load = useCallback(async () => {
    try { setItems(await apiGetBacklog(projectKey)); } catch { /* noop */ }
  }, [projectKey]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 6000); return () => clearInterval(t); }, [load]);
  if (items.length === 0) return null;

  const inDev = DEV_STATES.includes(state || "");
  const released = state === "RELEASED";
  const colOf = (s: BacklogItem): 0 | 1 | 2 => {
    const st = (s.status || "").toLowerCase();
    if (st === "done" || released) return 2;
    if (inDev) return 1;
    return 0;
  };
  const cols: { key: string; label: string; tint: string }[] = [
    { key: "todo", label: "Backlog", tint: "text-neutral-400" },
    { key: "doing", label: "En progreso", tint: "text-amber-400" },
    { key: "done", label: "Hecho", tint: "text-emerald-400" },
  ];
  const buckets: BacklogItem[][] = [[], [], []];
  for (const s of items) buckets[colOf(s)].push(s);

  return (
    <div className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-neutral-900">
        <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
          <Layers size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-neutral-100">Tablero del sprint</div>
          <div className="text-[10.5px] text-neutral-500">
            {items.length} historias · {buckets[2].length} hechas · {buckets[1].length} en curso
          </div>
        </div>
        <ChevronRight size={15} className={`text-neutral-600 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 pt-0">
          {cols.map((c, ci) => (
            <div key={c.key} className="rounded-xl bg-neutral-950/60 border border-neutral-800/70 p-2.5">
              <div className={`flex items-center justify-between text-[10.5px] uppercase tracking-wide font-medium mb-2 ${c.tint}`}>
                <span>{c.label}</span>
                <span className="text-neutral-600">{buckets[ci].length}</span>
              </div>
              <div className="space-y-1.5">
                {buckets[ci].length === 0 && (
                  <p className="text-[10.5px] text-neutral-600 px-1 py-2">—</p>
                )}
                {buckets[ci].map((s) => (
                  <div key={s.id} className="rounded-lg bg-neutral-900 border border-neutral-800 px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      {s.story_key && (
                        <span className="text-[9px] font-mono px-1 py-px rounded bg-neutral-800 text-neutral-400 shrink-0">{s.story_key}</span>
                      )}
                      {ci === 2 ? <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                        : ci === 1 ? <Loader2 size={11} className="text-amber-500 shrink-0" /> : null}
                    </div>
                    <div className="mt-1 text-[11.5px] text-neutral-200 leading-snug line-clamp-2">{s.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[9.5px] text-neutral-500">
                      {typeof s.story_points === "number" && <span>{s.story_points} pts</span>}
                      {s.priority && <span className="capitalize">· {s.priority}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Comunicación completa de un agente ────────────────────────────────────────
// Trazabilidad TOTAL: muestra el mensaje COMPLETO que el orquestador le pasó al
// agente y la respuesta/producción completa (no solo el resumen) -> "ver a
// profundidad cómo se comunican". Solo aparece si hay contenido más rico que el
// resumen (input_full/output_full distintos del summary).
function AgentComms({ step }: { step: OrchestrationStep }) {
  const [open, setOpen] = useState(false);
  const inFull = (step.input_full || "").trim();
  const outFull = (step.output_full || "").trim();
  const richer =
    (inFull && inFull !== (step.input_summary || "").trim()) ||
    (outFull && outFull !== (step.output_summary || "").trim());
  if (!richer) return null;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-neutral-900/60">
        <ScrollText size={12} className="text-brand" />
        <span className="text-[10.5px] font-medium text-neutral-300">Comunicación completa</span>
        <span className="text-[9.5px] text-neutral-600">· cómo se comunican</span>
        <ChevronRight size={13} className={`ml-auto text-neutral-600 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {inFull && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-neutral-500 mb-1 flex items-center gap-1">
                <CornerDownRight size={10} className="text-sky-400" /> mensaje recibido (del orquestador)
              </div>
              <pre className="text-[10.5px] leading-relaxed text-neutral-300 whitespace-pre-wrap break-words max-h-64 overflow-y-auto rounded-md bg-neutral-900 border border-neutral-800 p-2 font-mono">
                {inFull}
              </pre>
            </div>
          )}
          {outFull && (
            <div>
              <div className="text-[9px] uppercase tracking-wide text-neutral-500 mb-1 flex items-center gap-1">
                <CornerDownRight size={10} className="text-emerald-400" /> respuesta / producción del agente
              </div>
              <pre className="text-[10.5px] leading-relaxed text-neutral-300 whitespace-pre-wrap break-words max-h-64 overflow-y-auto rounded-md bg-neutral-900 border border-neutral-800 p-2 font-mono">
                {outFull}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Relay del orquestador ─────────────────────────────────────────────────────
// Hace VISIBLE el rol del orquestador (el hub del diagrama): entre cada agente,
// muestra que ÉL recibe la salida del anterior, arma el contexto y ACTIVA al
// siguiente. Así la traza no es una lista de agentes sueltos sino el flujo real
// Chat → Orquestador → agente → Orquestador → agente…
function OrchestratorRelay({
  prev, cur, first,
}: { prev?: OrchestrationStep; cur: OrchestrationStep; first?: boolean }) {
  const toTh = themeOf(cur.agent, cur.role);
  const fromTh = prev ? themeOf(prev.agent, prev.role) : null;
  return (
    <li className="relative pl-10 list-none" style={{ animation: "fade .3s ease both" }}>
      {/* conector hacia el agente que activa */}
      <span className="absolute left-[18px] top-9 bottom-0 w-px bg-neutral-800" />
      <span className="absolute left-0 top-1 grid place-items-center w-9 h-9 rounded-xl bg-slate-900 text-white ring-1 ring-white/10">
        <Cpu size={15} className="text-brand" />
      </span>
      <div className="mb-3 rounded-xl border border-slate-700/40 bg-slate-900/50 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
          <span>Orquestador</span>
          <span className="text-[10px] font-normal text-neutral-500">· coordina el handoff</span>
        </div>
        <div className="mt-1 space-y-0.5 text-[11px] text-neutral-400">
          {first ? (
            <p className="inline-flex flex-wrap items-center gap-1">
              Recibió la <span className="text-neutral-200">visión del producto</span> desde el
              <span className="font-medium text-sky-300">Chat</span>.
            </p>
          ) : prev ? (
            <p className="inline-flex flex-wrap items-center gap-1">
              Recibió de
              <span className={`font-medium ${fromTh!.text}`}>{cleanName(prev.agent)}</span>:
              <span className="text-neutral-300">{prev.output_summary || prev.action}</span>
            </p>
          ) : null}
          <p className="inline-flex flex-wrap items-center gap-1">
            <CornerDownRight size={11} className="text-brand" /> Activa a
            <span className={`font-medium ${toTh.text}`}>{cleanName(cur.agent)}</span>
            con <span className="text-neutral-300">{cur.input_summary || "el contexto del paso anterior"}</span>
          </p>
          <p className="text-[10.5px] text-neutral-500 italic pl-[15px]">
            ¿por qué? {whyScrum(cur.agent, cur.role)}
          </p>
        </div>
      </div>
    </li>
  );
}

function StepCard({
  step, index, isLast, open, onToggle, projectKey,
}: {
  step: OrchestrationStep; index: number; isLast: boolean;
  open: boolean; onToggle: () => void; projectKey: string;
}) {
  const th = themeOf(step.agent, step.role);
  const Icon = th.icon;
  const kind = stepKind(step.status);
  const running = kind === "running";
  const failed = kind === "error";
  const skipped = kind === "skipped";
  const isDev = /develop/i.test(step.agent + step.role);
  const isPO = /product owner|^po/i.test(step.agent + " " + step.role);
  const isQA = /\bqa\b|quality|test/i.test(step.agent + " " + step.role);
  const isArch = /arch/i.test(step.agent + " " + step.role);

  return (
    <li className="relative pl-10" style={{ animation: `rise .35s ease both`, animationDelay: `${Math.min(index, 12) * 45}ms` }}>
      {/* línea conectora animada */}
      {!isLast && (
        <span className={`absolute left-[18px] top-9 bottom-0 w-px ${running ? th.text + " os-flowline" : "bg-neutral-800"}`} />
      )}
      {/* nodo */}
      <span className={`absolute left-0 top-1 grid place-items-center w-9 h-9 rounded-xl text-white bg-gradient-to-br ${th.grad} ${running ? "os-glow" : ""} ${failed ? "ring-2 ring-rose-500/60" : ""} ${skipped ? "opacity-50 grayscale" : ""}`}>
        <Icon size={16} />
      </span>

      <div className={`mb-4 rounded-2xl border transition ${failed ? "border-rose-500/40 bg-rose-500/10 ring-1 ring-rose-500/25" : skipped ? "border-neutral-800/60 bg-neutral-900/40 opacity-75" : open ? `border-transparent ring-1 ${th.ring} ${th.soft} shadow-sm` : "border-neutral-800 bg-neutral-900/70 hover:border-neutral-700 hover:bg-neutral-900"}`}>
        <button onClick={onToggle} className="w-full text-left px-4 py-3.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">{cleanName(step.agent)}</span>
              <span className={`text-[10px] px-1.5 py-px rounded ${th.soft} ${th.text} font-medium`}>{step.phase}</span>
              {running ? <Loader2 size={12} className="text-emerald-500 animate-spin" />
                : failed ? <XCircle size={12} className="text-rose-500" />
                : skipped ? <MinusCircle size={12} className="text-neutral-500" />
                : <CheckCircle2 size={12} className="text-emerald-500" />}
              {skipped && <span className="text-[9.5px] uppercase tracking-wide px-1.5 py-px rounded bg-neutral-800 text-neutral-400">omitido</span>}
              {failed && <span className="text-[9.5px] uppercase tracking-wide px-1.5 py-px rounded bg-rose-500/20 text-rose-300">error</span>}
              <span className="ml-auto text-[10px] text-neutral-500 tabular-nums inline-flex items-center gap-1">
                {running ? <><Loader2 size={9} className="animate-spin" /><Elapsed since={step.started_at} /></>
                  : step.duration_ms != null ? fmtDur(step.duration_ms) : null}
              </span>
            </div>
            <p className={`mt-0.5 text-[12.5px] leading-snug ${failed ? "text-rose-200" : "text-neutral-100"}`}>
              {step.output_summary || step.action}
            </p>
            {/* handoff: ← viene de QUÉ agente (comunicación entre agentes) */}
            {step.handoff_from && cleanName(step.handoff_from) !== cleanName(step.agent) && (
              <p className="mt-1 text-[11px] text-neutral-500 inline-flex items-center gap-1 flex-wrap">
                <CornerDownRight size={11} className="text-brand" />
                viene de
                <span className={`font-medium ${themeOf(step.handoff_from).text}`}>{cleanName(step.handoff_from)}</span>
                <span className="text-neutral-600">· {handoffLabel(step.handoff_from)}</span>
              </p>
            )}
          </div>
          <ChevronRight size={15} className={`text-neutral-600 mt-0.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>

        {open && (
          <div className="px-3.5 pb-3.5 border-t border-neutral-800 pt-3 space-y-2.5">
            {/* dónde falló este agente (detalle del error) */}
            {failed && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 flex items-start gap-2">
                <ShieldAlert size={14} className="text-rose-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-rose-300/80">falló aquí</div>
                  <div className="text-[11.5px] text-rose-200 break-words">{step.output_summary || step.action || "El agente reportó un error."}</div>
                </div>
              </div>
            )}
            {skipped && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-2.5 py-2 text-[11.5px] text-neutral-400 flex items-start gap-2">
                <MinusCircle size={13} className="text-neutral-500 mt-0.5 shrink-0" />
                <span>{step.output_summary || "Paso omitido por el orquestador."}</span>
              </div>
            )}
            {/* cómo lo hizo: in -> out */}
            {(step.input_summary || step.output_summary) && (
              <div className="flex items-stretch gap-2 text-[11px]">
                <div className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wide text-neutral-500">recibió</div>
                  <div className="text-neutral-300">{step.input_summary || "—"}</div>
                </div>
                <div className="flex items-center text-neutral-600"><ChevronRight size={14} /></div>
                <div className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wide text-neutral-500">produjo</div>
                  <div className="text-neutral-300">{step.output_summary || "—"}</div>
                </div>
              </div>
            )}
            {/* COMUNICACIÓN COMPLETA: ver a profundidad qué mensaje recibió el agente y
                qué produjo (no solo el resumen). Trazabilidad total. */}
            <AgentComms step={step} />
            {/* artefactos */}
            {step.artifacts && step.artifacts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {step.artifacts.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-300">
                    <Layers size={10} className="text-neutral-500" />
                    {a.type === "backlog" ? `${a.count ?? 0} historias`
                      : a.type === "adr" ? `${a.count ?? 0} ADRs`
                      : a.type === "build" ? (a.sprint ? `código (sprint ${a.sprint})` : "código del sprint")
                      : a.type === "sprints" ? "sprints planificados"
                      : a.type === "file" ? (typeof a.path === "string" ? a.path.split("/").pop() : "archivo")
                      : a.type === "deploy" ? `deploy → ${a.target || "staging"}`
                      : a.type || "artefacto"}
                  </span>
                ))}
              </div>
            )}
            {/* drill-in de lo generado */}
            {isDev && <ArtifactFiles projectKey={projectKey} />}
            {isPO && <ArtifactStories projectKey={projectKey} />}
            {isQA && <ArtifactTests projectKey={projectKey} />}
            {isArch && <ArtifactAdrs projectKey={projectKey} />}
          </div>
        )}
      </div>
    </li>
  );
}

// ── Ver archivos generados (Developer) ───────────────────────────────────────
function ArtifactFiles({ projectKey }: { projectKey: string }) {
  const [files, setFiles] = useState<CodeFile[] | null>(null);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<CodeFile | null>(null);
  const [loading, setLoading] = useState(false);
  const toggle = async () => {
    setOpen((v) => !v);
    if (files === null && !loading) {
      setLoading(true);
      try { setFiles(await apiGetCode(projectKey)); } catch { setFiles([]); } finally { setLoading(false); }
    }
  };
  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-400 hover:underline">
        <FileCode2 size={13} /> {open ? "Ocultar" : "Ver"} archivos generados {files && <span className="text-neutral-500">({files.length})</span>}
        {loading && <Loader2 size={11} className="animate-spin" />}
      </button>
      {open && files && (
        <div className="mt-2 grid grid-cols-1 lg:grid-cols-[minmax(0,18rem)_1fr] gap-2.5">
          <ul className="max-h-[28rem] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
            {files.length === 0 && <li className="text-[11px] text-neutral-500 p-2">Aún no hay archivos.</li>}
            {files.map((f) => (
              <li key={f.id || f.file_path}>
                <button onClick={() => setSel(f)}
                  className={`w-full text-left flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-mono truncate hover:bg-neutral-900 ${sel?.file_path === f.file_path ? "bg-emerald-500/15 text-emerald-300" : "text-neutral-300"}`}>
                  <FileCode2 size={12} className="shrink-0 text-neutral-500" />
                  <span className="truncate">{f.file_path}</span>
                </button>
              </li>
            ))}
          </ul>
          <pre className="max-h-[28rem] overflow-auto rounded-xl bg-slate-900 text-slate-100 text-[11.5px] leading-relaxed p-3.5 ring-1 ring-black/20">
            {sel ? (sel.content || "").slice(0, 8000) : <span className="text-neutral-400">Elige un archivo de la izquierda para ver su código →</span>}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Ver PRUEBAS que ejecutó el QA (los tests reales) ─────────────────────────
function ArtifactTests({ projectKey }: { projectKey: string }) {
  const [tests, setTests] = useState<CodeFile[] | null>(null);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<CodeFile | null>(null);
  const [loading, setLoading] = useState(false);
  const toggle = async () => {
    setOpen((v) => !v);
    if (tests === null && !loading) {
      setLoading(true);
      try {
        const all = await apiGetCode(projectKey);
        setTests(all.filter((f) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.|test_/i.test(f.file_path)));
      } catch { setTests([]); } finally { setLoading(false); }
    }
  };
  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-amber-400 hover:underline">
        <FlaskConical size={13} /> {open ? "Ocultar" : "Ver"} pruebas ejecutadas {tests && <span className="text-neutral-500">({tests.length})</span>}
        {loading && <Loader2 size={11} className="animate-spin" />}
      </button>
      {open && tests && (
        <>
          <p className="mt-1 text-[10.5px] text-neutral-500">Estas son las pruebas que el QA corrió para validar la evidencia. Abre una para ver qué verifica.</p>
          <div className="mt-1.5 grid grid-cols-1 lg:grid-cols-[minmax(0,18rem)_1fr] gap-2.5">
            <ul className="max-h-[26rem] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
              {tests.length === 0 && <li className="text-[11px] text-neutral-500 p-2">No se encontraron archivos de prueba.</li>}
              {tests.map((f) => (
                <li key={f.id || f.file_path}>
                  <button onClick={() => setSel(f)}
                    className={`w-full text-left flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-mono truncate hover:bg-neutral-900 ${sel?.file_path === f.file_path ? "bg-amber-500/15 text-amber-300" : "text-neutral-300"}`}>
                    <FlaskConical size={12} className="shrink-0 text-amber-400" />
                    <span className="truncate">{f.file_path}</span>
                  </button>
                </li>
              ))}
            </ul>
            <pre className="max-h-[26rem] overflow-auto rounded-xl bg-slate-900 text-slate-100 text-[11.5px] leading-relaxed p-3.5 ring-1 ring-black/20">
              {sel ? (sel.content || "").slice(0, 8000) : <span className="text-neutral-400">Elige una prueba para ver qué valida →</span>}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

// ── Ver historias + MOCKUPS generados (PO) ───────────────────────────────────
function ArtifactStories({ projectKey }: { projectKey: string }) {
  const [stories, setStories] = useState<RefinementStory[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openMock, setOpenMock] = useState<Record<string, boolean>>({});
  const toggle = async () => {
    setOpen((v) => !v);
    if (stories === null && !loading) {
      setLoading(true);
      try { const r = await apiGetRefinement(projectKey); setStories(r?.stories || []); }
      catch { setStories([]); } finally { setLoading(false); }
    }
  };
  const nMock = (stories || []).filter((s) => s.mockup).length;
  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-violet-400 hover:underline">
        <FileText size={13} /> {open ? "Ocultar" : "Ver"} historias{nMock > 0 ? " + mockups" : ""}
        {stories && <span className="text-neutral-500">({stories.length})</span>}
        {loading && <Loader2 size={11} className="animate-spin" />}
      </button>
      {open && stories && (
        <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
          {stories.length === 0 && <li className="text-[11px] text-neutral-500">Aún no hay historias.</li>}
          {stories.map((s, i) => {
            const k = s.story_key || String(i);
            const mockOpen = !!openMock[k];
            return (
              <li key={k} className="rounded-lg border border-neutral-800 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-violet-400">{s.story_key}</span>
                  <span className="text-[12px] text-neutral-100 truncate">{s.title}</span>
                  {typeof s.story_points === "number" && (
                    <span className="ml-auto text-[10px] px-1.5 py-px rounded bg-violet-500/10 text-violet-400 font-medium">{s.story_points} pts</span>
                  )}
                </div>
                {s.mockup && (
                  <>
                    <button onClick={() => setOpenMock((o) => ({ ...o, [k]: !o[k] }))}
                      className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-sky-400 hover:underline">
                      <ImageIcon size={11} /> {mockOpen ? "ocultar" : "ver"} mockup
                    </button>
                    {mockOpen && (
                      <div className="mt-1.5 max-w-[280px] rounded-md overflow-hidden border border-neutral-800 bg-neutral-100"
                        dangerouslySetInnerHTML={{ __html: s.mockup }} />
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Ver ADRs de arquitectura (Architect) ─────────────────────────────────────
function ArtifactAdrs({ projectKey }: { projectKey: string }) {
  const [adrs, setAdrs] = useState<AdrItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const toggle = async () => {
    setOpen((v) => !v);
    if (adrs === null && !loading) {
      setLoading(true);
      try { setAdrs(await apiGetAdrs(projectKey)); } catch { setAdrs([]); } finally { setLoading(false); }
    }
  };
  const current = adrs && sel != null ? adrs[sel] : null;
  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-sky-400 hover:underline">
        <ScrollText size={13} /> {open ? "Ocultar" : "Ver"} decisiones de arquitectura (ADRs)
        {adrs && <span className="text-neutral-500">({adrs.length})</span>}
        {loading && <Loader2 size={11} className="animate-spin" />}
      </button>
      {open && adrs && (
        <div className="mt-2 grid grid-cols-1 lg:grid-cols-[minmax(0,16rem)_1fr] gap-2.5">
          <ul className="max-h-[26rem] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
            {adrs.length === 0 && <li className="text-[11px] text-neutral-500 p-2">Aún no hay ADRs.</li>}
            {adrs.map((a, i) => (
              <li key={a.adr_number ?? i}>
                <button onClick={() => setSel(i)}
                  className={`w-full text-left px-2.5 py-1.5 text-[11.5px] hover:bg-neutral-900 ${sel === i ? "bg-sky-500/15 text-sky-300" : "text-neutral-300"}`}>
                  <span className="font-mono text-[10px] text-sky-400/80">ADR-{String(a.adr_number ?? i + 1).padStart(3, "0")}</span>
                  <div className="truncate">{a.title || "Decisión de arquitectura"}</div>
                  {a.status && <span className="text-[9.5px] uppercase tracking-wide text-neutral-500">{a.status}</span>}
                </button>
              </li>
            ))}
          </ul>
          <pre className="max-h-[26rem] overflow-auto rounded-xl bg-slate-900 text-slate-100 text-[11.5px] leading-relaxed p-3.5 ring-1 ring-black/20 whitespace-pre-wrap break-words">
            {current
              ? (current.markdown
                  || [current.context && `## Contexto\n${current.context}`, current.decision && `## Decisión\n${current.decision}`, current.consequences && `## Consecuencias\n${current.consequences}`].filter(Boolean).join("\n\n")
                  || "Sin contenido.").slice(0, 12000)
              : <span className="text-neutral-400">Elige un ADR para leer la decisión →</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
