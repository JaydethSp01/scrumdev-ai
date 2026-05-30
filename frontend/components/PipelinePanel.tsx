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

type PipelineView = {
  current_state: string;
  current_index: number;
  total: number;
  is_gate: boolean;
  gate_n?: number;
  phases: Phase[];
  pending_decisions?: { id: string; title: string }[];
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
      await load();
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
            Las 14 fases de la guia, con 4 aprobaciones humanas obligatorias.
            Avanza fase a fase; en los gates decides tu.
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

        {/* Accion: gate o avanzar */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {view.is_gate ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-200 text-sm flex-1">
                <Lock size={15} />
                <span>
                  <b>Gate #{view.gate_n}</b> — requiere tu aprobacion para continuar.
                </span>
              </div>
              <button
                onClick={() => void approveGate()}
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium shadow-lg shadow-green-600/30 hover:opacity-95 disabled:opacity-60"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                Aprobar y continuar
              </button>
            </>
          ) : view.current_state === "RELEASED" ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-300 text-sm">
              <CheckCircle2 size={15} /> Producto desplegado y disponible.
            </div>
          ) : (
            <button
              onClick={() => void advance()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand to-fuchsia-500 text-white font-medium shadow-lg shadow-brand/30 hover:opacity-95 disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              Avanzar a siguiente fase
            </button>
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
