"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Lock,
} from "lucide-react";
import { API } from "@/lib/api";

type Phase = {
  state: string;
  label: string;
  actor: string;
  artifact: string;
  desc: string;
  human_gate: boolean;
  gate_n?: number;
  status: "done" | "current" | "pending";
  index: number;
};

type Adr = {
  number: number; title: string; status?: string;
  context?: string; decision?: string; consequences?: string; markdown?: string;
};
type Check = { name: string; ok: boolean; detail?: string };
type Evidence = {
  code_files?: number; test_files?: string[]; test_count?: number;
  build_status?: string; build_summary?: string; checks?: Check[];
};
type Dor = { ready: boolean; checks: { name: string; ok: boolean }[] };
type TechTask = { module: string; type: string; title: string; detail?: string };
type Story = {
  story_key: string; title: string; description?: string;
  acceptance_criteria?: string[]; story_points?: number; priority?: string;
  dor?: Dor; tech_tasks?: TechTask[];
};
type PlannerIssue = { severity: string; type: string; detail: string };
type GateReview = {
  title?: string; summary?: string; adrs?: Adr[]; evidence?: Evidence;
  stories?: Story[]; needs_nfr_form?: boolean;
  dor_summary?: { ready: number; total: number; all_ready: boolean };
  planner?: { ok: boolean; blockers: number; total_points: number; issues: PlannerIssue[] };
  dod?: { done: boolean; checks: { name: string; ok: boolean }[] };
  sprint_validation?: { stories: number; with_criteria: number; dod_done: boolean };
  auto_review?: { name: string; ok: boolean; detail?: string }[];
  story_dod?: { story_key: string; title: string; dod: { done: boolean; checks: { name: string; ok: boolean }[] } }[];
};
type PipelineView = {
  current_state: string;
  current_index: number;
  total: number;
  is_gate: boolean;
  gate_n?: number;
  phases: Phase[];
  pending_decisions?: { id: string; title: string }[];
  gate_review?: GateReview;
};

export function PipelinePanel({ projectKey }: { projectKey: string }) {
  const [view, setView] = useState<PipelineView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/projects/${projectKey}/pipeline`);
      setView(await r.json());
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`${API}/projects/${projectKey}/pipeline/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggered_by: "po" }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }, [projectKey, load]);

  const approveGate = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`${API}/projects/${projectKey}/pipeline/approve-gate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decided_by: "po", reason: "aprobado" }),
      });
      // tras aprobar, el sistema corre solo; refrescar varias veces para ver avance
      await load();
      setTimeout(() => void load(), 3000);
      setTimeout(() => void load(), 8000);
    } finally {
      setBusy(false);
    }
  }, [projectKey, load]);

  const autorun = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`${API}/projects/${projectKey}/pipeline/autorun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggered_by: "po" }),
      });
      await load();
      setTimeout(() => void load(), 3000);
      setTimeout(() => void load(), 8000);
    } finally {
      setBusy(false);
    }
  }, [projectKey, load]);

  if (loading) {
    return (
      <div className="min-h-[300px] grid place-items-center">
        <Loader2 className="animate-spin text-brand" size={28} />
      </div>
    );
  }
  if (!view) return null;

  const current = view.phases.find((p) => p.status === "current");
  const progress = Math.round((view.current_index / (view.total - 1)) * 100);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full bg-brand/10 text-brand">
            <Sparkles size={11} /> Pipeline SDLC
          </span>
          <h2 className="text-2xl font-semibold tracking-tight mt-2">
            Ciclo de vida del producto
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 max-w-xl">
            El sistema avanza <b>automáticamente</b> y se detiene solo en los 4
            puntos donde tú decides (aprobar arquitectura, evidencia, release y
            producción). No tienes que ir fase por fase.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          <RefreshCw size={14} /> Refrescar
        </button>
      </header>

      {/* Progreso global */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{current?.label}</span>
          <span className="text-sm text-neutral-500">
            Fase {view.current_index + 1} / {view.total}
          </span>
        </div>
        <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand to-fuchsia-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Accion: gate (con contenido a aprobar) o iniciar automatico */}
        <div className="mt-4 flex flex-col gap-3">
          {view.is_gate ? (
            <>
              {/* QUE estas aprobando */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-200 font-semibold">
                  <Lock size={16} />
                  {view.gate_review?.title || `Aprobación requerida (Gate #${view.gate_n})`}
                </div>
                {view.gate_review?.summary && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1.5">
                    {view.gate_review.summary}
                  </p>
                )}
                {/* PRODUCT BACKLOG a aprobar (gate 1): historias con criterios + DoR */}
                {view.gate_review?.stories && view.gate_review.stories.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {view.gate_review?.dor_summary && (
                      <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                        view.gate_review.dor_summary.all_ready
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                        {view.gate_review.dor_summary.all_ready ? <CheckCircle2 size={13} /> : <Lock size={13} />}
                        <b>Definition of Ready:</b> {view.gate_review.dor_summary.ready}/{view.gate_review.dor_summary.total} historias listas.
                        {!view.gate_review.dor_summary.all_ready && " Sin DoR completo no se genera código."}
                      </div>
                    )}
                    {view.gate_review.stories.map((s) => (
                      <details key={s.story_key} className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3">
                        <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-brand">{s.story_key}</span>
                          <span>{s.title}</span>
                          {s.dor && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
                              s.dor.ready ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                              {s.dor.ready ? <CheckCircle2 size={9} /> : <Lock size={9} />} DoR
                            </span>
                          )}
                          {s.priority && (
                            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500">{s.priority}</span>
                          )}
                          {typeof s.story_points === "number" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand ml-auto">{s.story_points} pts</span>
                          )}
                        </summary>
                        {s.description && (
                          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{s.description}</p>
                        )}
                        {s.acceptance_criteria && s.acceptance_criteria.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {s.acceptance_criteria.map((c, i) => (
                              <li key={i} className="text-xs text-neutral-500 flex gap-1.5">
                                <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" /> {c}
                              </li>
                            ))}
                          </ul>
                        )}
                        {s.dor && (
                          <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-2">
                            {s.dor.checks.map((c, i) => (
                              <span key={i} className={`text-[10px] inline-flex items-center gap-1 ${c.ok ? "text-emerald-600" : "text-amber-600"}`}>
                                {c.ok ? <CheckCircle2 size={10} /> : <Lock size={10} />} {c.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {s.tech_tasks && s.tech_tasks.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                            <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">Tareas técnicas</p>
                            <div className="space-y-1">
                              {s.tech_tasks.map((tk, i) => (
                                <div key={i} className="text-xs flex items-start gap-2">
                                  <span className={`mt-0.5 text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                    tk.module === "backend" ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                                    : tk.module === "frontend" ? "bg-sky-500/15 text-sky-600 dark:text-sky-300"
                                    : "bg-amber-500/15 text-amber-600 dark:text-amber-300"}`}>{tk.module}</span>
                                  <span className="text-neutral-600 dark:text-neutral-300">{tk.title}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                )}
                {/* Gate NFR: invita a llenar el formulario */}
                {view.gate_review?.needs_nfr_form && (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5">
                    <Lock size={12} /> Completa el formulario en el tab <b>Requisitos NFR</b>, luego aprueba aquí.
                  </p>
                )}
                {/* Evidencia de QA (gate 2) */}
                {view.gate_review?.evidence && (
                  <div className="mt-3 space-y-2">
                    {(view.gate_review.evidence.checks || []).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {c.ok
                          ? <CheckCircle2 size={15} className="text-emerald-500" />
                          : <Lock size={15} className="text-amber-500" />}
                        <span className="font-medium">{c.name}</span>
                        <span className="text-neutral-500">— {c.detail}</span>
                      </div>
                    ))}
                    {view.gate_review.evidence.build_summary && (
                      <p className="text-xs text-neutral-500 mt-1">{view.gate_review.evidence.build_summary}</p>
                    )}
                    {view.gate_review.evidence.test_files && view.gate_review.evidence.test_files.length > 0 && (
                      <details className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-2.5 mt-1">
                        <summary className="cursor-pointer text-sm font-medium">
                          Pruebas incluidas ({view.gate_review.evidence.test_count})
                        </summary>
                        <ul className="mt-2 text-xs font-mono text-neutral-600 dark:text-neutral-400 space-y-0.5 max-h-40 overflow-y-auto">
                          {view.gate_review.evidence.test_files.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                {/* ADRs a revisar (gate 1) */}
                {view.gate_review?.adrs && view.gate_review.adrs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {view.gate_review.adrs.map((adr) => (
                      <details key={adr.number} className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          ADR-{String(adr.number).padStart(3, "0")}: {adr.title}
                        </summary>
                        <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                          {adr.markdown || adr.decision || adr.context}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                {/* Planner/validador pre-código (Adam #9) */}
                {view.gate_review?.planner && (
                  <div className="mt-3">
                    <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                      view.gate_review.planner.ok
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-red-500/10 text-red-700 dark:text-red-300"}`}>
                      {view.gate_review.planner.ok ? <CheckCircle2 size={13} /> : <Lock size={13} />}
                      <b>Validación previa:</b> {view.gate_review.planner.ok ? "sin bloqueantes" : `${view.gate_review.planner.blockers} bloqueante(s)`} · {view.gate_review.planner.total_points} pts
                    </div>
                    {view.gate_review.planner.issues.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {view.gate_review.planner.issues.map((is, i) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0 ${
                              is.severity === "high" ? "bg-red-500/15 text-red-600"
                              : is.severity === "medium" ? "bg-amber-500/15 text-amber-600"
                              : "bg-neutral-500/15 text-neutral-500"}`}>{is.type}</span>
                            <span className="text-neutral-600 dark:text-neutral-400">{is.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {/* Revisión automática del código (Adam F) */}
                {view.gate_review?.auto_review && view.gate_review.auto_review.length > 0 && (
                  <div className="mt-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                    <p className="text-sm font-medium mb-2">Revisión automática</p>
                    <div className="space-y-1.5">
                      {view.gate_review.auto_review.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {c.ok ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Lock size={13} className="text-amber-500" />}
                          <span className="font-medium">{c.name}</span>
                          {c.detail && <span className="text-neutral-500">— {c.detail}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* DoD por historia (Adam #14) */}
                {view.gate_review?.story_dod && view.gate_review.story_dod.length > 0 && (
                  <details className="mt-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                    <summary className="cursor-pointer text-sm font-medium">DoD por historia ({view.gate_review.story_dod.length})</summary>
                    <div className="mt-2 space-y-1.5">
                      {view.gate_review.story_dod.map((sd) => (
                        <div key={sd.story_key} className="flex items-center gap-2 text-xs">
                          {sd.dod.done ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Lock size={12} className="text-amber-500" />}
                          <span className="font-mono text-brand">{sd.story_key}</span>
                          <span className="text-neutral-600 dark:text-neutral-400 truncate">{sd.title}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {/* Definition of Done + validación de sprint (Adam #13-14) */}
                {view.gate_review?.dod && (
                  <div className="mt-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      {view.gate_review.dod.done ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Lock size={14} className="text-amber-500" />}
                      Definition of Done
                      {view.gate_review?.sprint_validation && (
                        <span className="text-xs text-neutral-500 ml-auto">
                          {view.gate_review.sprint_validation.with_criteria}/{view.gate_review.sprint_validation.stories} historias con criterios
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {view.gate_review.dod.checks.map((c, i) => (
                        <span key={i} className={`text-[10px] inline-flex items-center gap-1 ${c.ok ? "text-emerald-600" : "text-amber-600"}`}>
                          {c.ok ? <CheckCircle2 size={10} /> : <Lock size={10} />} {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void approveGate()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium shadow-lg shadow-green-600/30 hover:opacity-95 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  Apruebo, continuar automático
                </button>
                <span className="text-xs text-neutral-500">Tras aprobar, el sistema sigue solo hasta el próximo punto que requiera tu decisión.</span>
              </div>
            </>
          ) : view.current_state === "RELEASED" ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-300 text-sm">
              <CheckCircle2 size={15} /> Producto desplegado y disponible.
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => void autorun()}
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand to-fuchsia-500 text-white font-medium shadow-lg shadow-brand/30 hover:opacity-95 disabled:opacity-60"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                Iniciar / continuar automático
              </button>
              <button
                onClick={() => void advance()}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-60"
              >
                Avanzar 1 fase (manual)
              </button>
              <span className="text-xs text-neutral-500">El automático corre solo hasta el próximo gate.</span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline vertical de las 14 fases */}
      <div className="relative">
        <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-neutral-200 dark:bg-neutral-800" />
        <div className="space-y-1">
          {view.phases.map((p) => (
            <PhaseRow key={p.state} phase={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PhaseRow({ phase }: { phase: Phase }) {
  const tone =
    phase.status === "done"
      ? "text-green-600 dark:text-green-400"
      : phase.status === "current"
      ? "text-brand"
      : "text-neutral-400";
  return (
    <div className="relative flex gap-4 py-2.5">
      <div className="relative z-10 shrink-0">
        <span
          className={`grid place-items-center w-10 h-10 rounded-full border-2 bg-white dark:bg-neutral-950 ${
            phase.status === "done"
              ? "border-green-500/50"
              : phase.status === "current"
              ? "border-brand shadow-lg shadow-brand/20"
              : "border-neutral-300 dark:border-neutral-700"
          }`}
        >
          {phase.status === "done" ? (
            <CheckCircle2 size={18} className="text-green-500" />
          ) : phase.status === "current" ? (
            <Loader2 size={16} className="text-brand animate-spin" />
          ) : phase.human_gate ? (
            <ShieldCheck size={16} className="text-neutral-400" />
          ) : (
            <Circle size={14} className="text-neutral-300 dark:text-neutral-600" />
          )}
        </span>
      </div>
      <div
        className={`flex-1 rounded-xl border px-4 py-3 transition ${
          phase.status === "current"
            ? "border-brand/40 bg-brand/5"
            : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className={`font-semibold ${tone}`}>{phase.label}</h4>
          {phase.human_gate && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-200 border border-amber-500/30">
              <Lock size={9} /> Gate #{phase.gate_n}
            </span>
          )}
          <span className="text-[10px] text-neutral-500 ml-auto">{phase.actor}</span>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">{phase.desc}</p>
        <p className="text-[10px] text-neutral-500 mt-1.5">
          Artefacto: <span className="font-medium">{phase.artifact}</span>
        </p>
      </div>
    </div>
  );
}

export default PipelinePanel;
