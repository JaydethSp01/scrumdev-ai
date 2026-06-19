"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X, Cpu, ShoppingBag, Building2, Code2, FlaskConical, ShieldCheck,
  CalendarRange, Rocket, Bot, ArrowDown, CheckCircle2, Loader2, AlertTriangle,
  FileCode2, FileText, Layers, ChevronRight, Activity, ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import {
  apiGetOrchestration, apiGetCode, apiGetRefinement,
  type Orchestration, type OrchestrationStep, type CodeFile, type RefinementStory,
} from "@/lib/api";

// ── Identidad por agente ─────────────────────────────────────────────────────
type Theme = { icon: typeof Bot; grad: string; ring: string; text: string; soft: string };
const THEMES: Record<string, Theme> = {
  po:        { icon: ShoppingBag,  grad: "from-violet-500 to-fuchsia-500", ring: "ring-violet-400/40",  text: "text-violet-600",  soft: "bg-violet-500/10" },
  architect: { icon: Building2,    grad: "from-sky-500 to-cyan-500",       ring: "ring-sky-400/40",     text: "text-sky-600",     soft: "bg-sky-500/10" },
  scrum:     { icon: CalendarRange,grad: "from-amber-500 to-orange-500",   ring: "ring-amber-400/40",   text: "text-amber-600",   soft: "bg-amber-500/10" },
  developer: { icon: Code2,        grad: "from-emerald-500 to-teal-500",   ring: "ring-emerald-400/40", text: "text-emerald-600", soft: "bg-emerald-500/10" },
  review:    { icon: ShieldCheck,  grad: "from-rose-500 to-pink-500",      ring: "ring-rose-400/40",    text: "text-rose-600",    soft: "bg-rose-500/10" },
  qa:        { icon: FlaskConical, grad: "from-yellow-500 to-amber-500",   ring: "ring-yellow-400/40",  text: "text-yellow-600",  soft: "bg-yellow-500/10" },
  devops:    { icon: Rocket,       grad: "from-indigo-500 to-blue-500",    ring: "ring-indigo-400/40",  text: "text-indigo-600",  soft: "bg-indigo-500/10" },
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
function fmtDur(ms?: number | null): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
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

  // equipo único en orden de aparición (para el rail)
  const team = useMemo(() => {
    const seen = new Map<string, { agent: string; role: string; status: string }>();
    for (const s of steps) {
      const cur = seen.get(s.agent);
      seen.set(s.agent, {
        agent: s.agent, role: s.role,
        status: s.status === "running" ? "running" : (cur?.status === "running" ? "running" : s.status),
      });
    }
    return Array.from(seen.values());
  }, [steps]);

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4 md:p-6 animate-[fade_.2s_ease]">
      <style jsx global>{`
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes flowline { 0% { background-position: 0 0 } 100% { background-position: 0 18px } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 0 0 rgba(91,108,255,.45) } 50% { box-shadow: 0 0 0 8px rgba(91,108,255,0) } }
        .os-flowline { background-image: linear-gradient(180deg, currentColor 50%, transparent 50%); background-size: 2px 10px; animation: flowline 1s linear infinite; }
        .os-glow { animation: glow 1.8s ease-in-out infinite; }
      `}</style>

      <div className="relative w-full max-w-6xl h-full sm:h-[92vh] rounded-none sm:rounded-2xl overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200 flex flex-col">
        {/* ── Header ── */}
        <header className="relative shrink-0 px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white overflow-hidden">
          <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-brand/30 blur-3xl" />
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

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[230px_1fr]">
          {/* ── Rail del equipo ── */}
          <aside className="hidden lg:flex flex-col gap-1.5 p-4 border-r border-slate-200 bg-slate-50/70 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              <Activity size={11} /> Equipo
            </p>
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-slate-900 text-white">
              <span className="grid place-items-center w-7 h-7 rounded-lg bg-white/10"><Cpu size={14} /></span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold leading-tight">Orquestador</div>
                <div className="text-[10px] text-white/50">máquina de estados</div>
              </div>
            </div>
            <div className="ml-3.5 my-0.5 h-3 w-px text-slate-300 os-flowline" />
            {team.length === 0 && (
              <p className="text-[11px] text-slate-400 px-2">Aún no hay agentes en acción. Inicia el ciclo.</p>
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
                  className={`group flex items-center gap-2.5 px-2 py-2 rounded-xl text-left transition hover:bg-white border ${running ? "border-transparent ring-2 " + th.ring + " bg-white os-glow" : "border-slate-200/70 bg-white/60"}`}>
                  <span className={`grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br ${th.grad} text-white shrink-0`}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium leading-tight truncate">{m.agent.replace(/ Agent$/i, "")}</div>
                    <div className="text-[10px] text-slate-400 truncate">{m.role}</div>
                  </div>
                  {running ? <Loader2 size={13} className="text-emerald-500 animate-spin" />
                    : m.status === "failed" ? <AlertTriangle size={13} className="text-rose-500" />
                    : <CheckCircle2 size={13} className="text-emerald-500" />}
                </button>
              );
            })}
          </aside>

          {/* ── Registro de orquestación (flujo) ── */}
          <main className="min-h-0 overflow-y-auto p-4 sm:p-6 bg-white">
            {/* Debug del despliegue (cuando aplica) */}
            {deploy && deploy.state && (
              <DeployDebug deploy={deploy} />
            )}

            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <ChevronRight size={11} /> Registro de orquestación · cómo se pasan la información
            </p>

            {loaded && steps.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                <Bot size={26} className="mx-auto mb-2 opacity-60" />
                Aún no hay actividad de agentes. Cuando inicies el ciclo verás aquí, paso a paso,
                cómo el orquestador llama a cada agente y cómo se pasan el trabajo.
              </div>
            )}

            <ol className="relative">
              {steps.map((s, i) => (
                <StepCard
                  key={s.id}
                  step={s}
                  index={i}
                  isLast={i === steps.length - 1}
                  open={openStep === s.id}
                  onToggle={() => setOpenStep(openStep === s.id ? null : s.id)}
                  projectKey={projectKey}
                />
              ))}
            </ol>
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Barra de debug del despliegue ────────────────────────────────────────────
function DeployDebug({ deploy }: { deploy: NonNullable<Orchestration["deploy"]> }) {
  const failed = deploy.state === "gate_failed" || deploy.state === "error" || deploy.state === "done_degraded";
  const done = deploy.state === "done";
  const pct = Math.max(5, Math.min(100, deploy.phase_pct ?? (done ? 100 : 20)));
  return (
    <div className={`mb-5 rounded-2xl border p-4 ${failed ? "border-rose-200 bg-rose-50/60" : done ? "border-emerald-200 bg-emerald-50/60" : "border-indigo-200 bg-indigo-50/60"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`grid place-items-center w-7 h-7 rounded-lg text-white bg-gradient-to-br ${failed ? "from-rose-500 to-pink-500" : "from-indigo-500 to-blue-500"}`}>
          <Rocket size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight">DevOps Agent · Despliegue</div>
          <div className="text-[11px] text-slate-500 truncate">{deploy.phase_label || deploy.state}</div>
        </div>
        {!failed && !done && <Loader2 size={14} className="text-indigo-500 animate-spin" />}
        {done && <CheckCircle2 size={15} className="text-emerald-500" />}
        {failed && <AlertTriangle size={15} className="text-rose-500" />}
      </div>
      <div className="h-2 w-full rounded-full bg-white/70 overflow-hidden ring-1 ring-black/5">
        <div className={`h-full rounded-full transition-all duration-700 ${failed ? "bg-rose-500" : "bg-gradient-to-r from-indigo-500 to-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
      {/* dónde se quedó / resultado */}
      {failed && (
        <p className="mt-2 text-[11.5px] text-rose-700">
          ⚠ Se detuvo aquí: {deploy.error || "el build local falló y NO se subió nada (deploy abortado, sin romper la nube)."}
        </p>
      )}
      {Array.isArray(deploy.e2e_fails) && deploy.e2e_fails.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {deploy.e2e_fails.slice(0, 4).map((f, i) => (
            <li key={i} className="text-[11px] text-amber-700 flex items-start gap-1"><span>•</span>{f}</li>
          ))}
        </ul>
      )}
      {done && deploy.url && (
        <a href={deploy.url.startsWith("http") ? deploy.url : `https://${deploy.url}`} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 hover:underline">
          <ExternalLink size={12} /> Abrir la app publicada
        </a>
      )}
    </div>
  );
}

// ── Tarjeta de paso (un agente en el flujo) ──────────────────────────────────
function StepCard({
  step, index, isLast, open, onToggle, projectKey,
}: {
  step: OrchestrationStep; index: number; isLast: boolean;
  open: boolean; onToggle: () => void; projectKey: string;
}) {
  const th = themeOf(step.agent, step.role);
  const Icon = th.icon;
  const running = step.status === "running";
  const failed = step.status === "failed";
  const isDev = /develop/i.test(step.agent + step.role);
  const isPO = /product owner|^po/i.test(step.agent + " " + step.role);

  return (
    <li className="relative pl-10" style={{ animation: `rise .35s ease both`, animationDelay: `${Math.min(index, 12) * 45}ms` }}>
      {/* línea conectora animada */}
      {!isLast && (
        <span className={`absolute left-[18px] top-9 bottom-0 w-px ${running ? th.text + " os-flowline" : "bg-slate-200"}`} />
      )}
      {/* nodo */}
      <span className={`absolute left-0 top-1 grid place-items-center w-9 h-9 rounded-xl text-white bg-gradient-to-br ${th.grad} ${running ? "os-glow" : ""}`}>
        <Icon size={16} />
      </span>

      <div className={`mb-4 rounded-xl border bg-white transition ${open ? "border-slate-300 shadow-sm" : "border-slate-200"}`}>
        <button onClick={onToggle} className="w-full text-left px-3.5 py-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">{step.agent.replace(/ Agent$/i, "")}</span>
              <span className={`text-[10px] px-1.5 py-px rounded ${th.soft} ${th.text} font-medium`}>{step.phase}</span>
              {running ? <Loader2 size={12} className="text-emerald-500 animate-spin" />
                : failed ? <AlertTriangle size={12} className="text-rose-500" />
                : <CheckCircle2 size={12} className="text-emerald-500" />}
              {step.duration_ms != null && <span className="ml-auto text-[10px] text-slate-400 tabular-nums">{fmtDur(step.duration_ms)}</span>}
            </div>
            <p className="mt-0.5 text-[12.5px] text-slate-700 leading-snug">
              {step.output_summary || step.action}
            </p>
            {/* handoff: de quién recibió */}
            {step.handoff_from && (
              <p className="mt-1 text-[11px] text-slate-400 inline-flex items-center gap-1">
                <ArrowDown size={10} className="rotate-[-90deg]" />
                {handoffLabel(step.handoff_from)} <span className="font-medium text-slate-500">{step.agent.replace(/ Agent$/i, "")}</span>
              </p>
            )}
          </div>
          <ChevronRight size={15} className={`text-slate-300 mt-0.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>

        {open && (
          <div className="px-3.5 pb-3.5 border-t border-slate-100 pt-3 space-y-2.5">
            {/* cómo lo hizo: in -> out */}
            {(step.input_summary || step.output_summary) && (
              <div className="flex items-stretch gap-2 text-[11px]">
                <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wide text-slate-400">recibió</div>
                  <div className="text-slate-600">{step.input_summary || "—"}</div>
                </div>
                <div className="flex items-center text-slate-300"><ChevronRight size={14} /></div>
                <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wide text-slate-400">produjo</div>
                  <div className="text-slate-600">{step.output_summary || "—"}</div>
                </div>
              </div>
            )}
            {/* artefactos */}
            {step.artifacts && step.artifacts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {step.artifacts.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    <Layers size={10} className="text-slate-400" />
                    {a.type === "backlog" ? `${a.count ?? 0} historias`
                      : a.type === "adr" ? `${a.count ?? 0} ADRs`
                      : a.type === "build" ? "código del sprint"
                      : a.type === "deploy" ? `deploy → ${a.target || "staging"}`
                      : a.type || "artefacto"}
                  </span>
                ))}
              </div>
            )}
            {/* drill-in de lo generado */}
            {isDev && <ArtifactFiles projectKey={projectKey} />}
            {isPO && <ArtifactStories projectKey={projectKey} />}
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
      <button onClick={toggle} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-600 hover:underline">
        <FileCode2 size={13} /> {open ? "Ocultar" : "Ver"} archivos generados {files && <span className="text-slate-400">({files.length})</span>}
        {loading && <Loader2 size={11} className="animate-spin" />}
      </button>
      {open && files && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {files.length === 0 && <li className="text-[11px] text-slate-400 p-2">Aún no hay archivos.</li>}
            {files.map((f) => (
              <li key={f.id || f.file_path}>
                <button onClick={() => setSel(f)}
                  className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono truncate hover:bg-slate-50 ${sel?.file_path === f.file_path ? "bg-emerald-50 text-emerald-700" : "text-slate-600"}`}>
                  <FileCode2 size={11} className="shrink-0 text-slate-400" />
                  <span className="truncate">{f.file_path}</span>
                </button>
              </li>
            ))}
          </ul>
          <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 text-slate-100 text-[10.5px] leading-relaxed p-2.5">
            {sel ? (sel.content || "").slice(0, 4000) : <span className="text-slate-500">Elige un archivo para ver su contenido →</span>}
          </pre>
        </div>
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
      <button onClick={toggle} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-violet-600 hover:underline">
        <FileText size={13} /> {open ? "Ocultar" : "Ver"} historias{nMock > 0 ? " + mockups" : ""}
        {stories && <span className="text-slate-400">({stories.length})</span>}
        {loading && <Loader2 size={11} className="animate-spin" />}
      </button>
      {open && stories && (
        <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
          {stories.length === 0 && <li className="text-[11px] text-slate-400">Aún no hay historias.</li>}
          {stories.map((s, i) => {
            const k = s.story_key || String(i);
            const mockOpen = !!openMock[k];
            return (
              <li key={k} className="rounded-lg border border-slate-200 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-violet-600">{s.story_key}</span>
                  <span className="text-[12px] text-slate-700 truncate">{s.title}</span>
                  {typeof s.story_points === "number" && (
                    <span className="ml-auto text-[10px] px-1.5 py-px rounded bg-violet-500/10 text-violet-600 font-medium">{s.story_points} pts</span>
                  )}
                </div>
                {s.mockup && (
                  <>
                    <button onClick={() => setOpenMock((o) => ({ ...o, [k]: !o[k] }))}
                      className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-sky-600 hover:underline">
                      <ImageIcon size={11} /> {mockOpen ? "ocultar" : "ver"} mockup
                    </button>
                    {mockOpen && (
                      <div className="mt-1.5 max-w-[280px] rounded-md overflow-hidden border border-slate-200 bg-slate-50"
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
