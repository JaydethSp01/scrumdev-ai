"use client";

/**
 * Panel GRANDE y visual del progreso de generación. Guía al usuario: muestra el
 * paso actual, por qué tarda, los pasos del flujo como timeline animado, % y ETA.
 * Lee el BuildRun del backend (stage/progress_percent/summary.phase_label/detail).
 */
import { useEffect, useRef, useState } from "react";
import {
  Lightbulb, ListChecks, Layers, Code2, Palette, Eye, Rocket,
  CheckCircle2, Loader2, AlertTriangle, Sparkles,
} from "lucide-react";
import { apiListBuilds, type BuildRecord } from "@/lib/api";

type Step = { key: string; label: string; icon: typeof Code2; desc: string };

// Flujo end-to-end que ve el usuario (mapea a los stages del backend).
const STEPS: Step[] = [
  { key: "vision", label: "Entendiendo tu idea", icon: Lightbulb,
    desc: "Analizamos lo que pediste para definir qué construir." },
  { key: "backlog", label: "Planeando funcionalidades", icon: ListChecks,
    desc: "El Product Owner crea las historias y prioriza." },
  { key: "architecture", label: "Diseñando la arquitectura", icon: Layers,
    desc: "El arquitecto elige el stack y la estructura." },
  { key: "generating_app", label: "Escribiendo el código", icon: Code2,
    desc: "Generamos frontend y backend completos, no plantillas." },
  { key: "design", label: "Puliendo el diseño", icon: Palette,
    desc: "Revisamos UX/UI, responsive y accesibilidad." },
  { key: "review", label: "Verificando que se vea bien", icon: Eye,
    desc: "Comprobamos que la app renderice y compita en diseño." },
  { key: "saving_code", label: "Guardando y validando", icon: CheckCircle2,
    desc: "Compilamos y dejamos todo listo." },
];

// stage del backend -> índice del paso en STEPS
function stepIndex(stage: string): number {
  const s = (stage || "").toLowerCase();
  const map: Record<string, number> = {
    queued: 0, vision: 0, backlog: 1, refinement: 1, architecture: 2,
    coding: 3, generating_app: 3, design: 4, design_review: 4,
    quality: 4, review: 5, smoke: 5, saving_code: 6, running: 3, completed: 7,
  };
  return map[s] ?? 0;
}

export function GenerationProgress({ projectKey, onDone }: { projectKey: string; onDone?: () => void }) {
  const [build, setBuild] = useState<BuildRecord | null>(null);
  const [active, setActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const poll = async () => {
    try {
      const builds = await apiListBuilds(projectKey, 1);
      if (!builds.length) return;
      const b = builds[0];
      setBuild(b);
      const s = (b.stage || "").toLowerCase();
      if (s === "completed" || s === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setActive(s !== "completed"); // dejar visible un momento; completed -> onDone
        if (s === "completed") setTimeout(() => { setActive(false); onDone?.(); }, 1800);
      }
    } catch { /* reintentar */ }
  };

  useEffect(() => {
    let on = true;
    (async () => {
      const builds = await apiListBuilds(projectKey, 1).catch(() => []);
      if (!on) return;
      const b = builds[0];
      if (b && !["completed", "failed"].includes((b.stage || "").toLowerCase())) {
        setBuild(b); setActive(true);
      }
    })();
    return () => { on = true; };
  }, [projectKey]);

  useEffect(() => {
    function onStart(e: Event) {
      const ev = e as CustomEvent<{ projectKey: string }>;
      if (ev.detail?.projectKey !== projectKey) return;
      setActive(true); setElapsed(0); void poll();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(poll, 3500);
    }
    window.addEventListener("scrumdev:build_started", onStart as EventListener);
    return () => window.removeEventListener("scrumdev:build_started", onStart as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  useEffect(() => {
    if (!active) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(poll, 3500);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active || !build) return null;

  const stage = (build.stage || "").toLowerCase();
  const failed = stage === "failed";
  const idx = stepIndex(stage);
  const progress = typeof build.progress_percent === "number" ? build.progress_percent : Math.min(idx * 14, 95);
  const summary = (build.summary || {}) as { phase_label?: string; phase_detail?: string; eta_seconds?: number };
  const eta = summary.eta_seconds || 420;
  const remaining = Math.max(0, eta - elapsed);
  const mm = Math.floor(remaining / 60), ss = remaining % 60;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden shadow-sm" aria-live="polite">
      <div className="relative p-6 bg-gradient-to-br from-brand/10 via-transparent to-fuchsia-500/10">
        <div className="flex items-center gap-3">
          <span className="relative grid place-items-center w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-fuchsia-500 text-white shrink-0">
            <span className="absolute inset-0 rounded-2xl bg-brand/30 animate-ping" aria-hidden />
            {failed ? <AlertTriangle size={22} className="relative" /> : <Sparkles size={22} className="relative" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold tracking-tight">
              {failed ? "Algo falló en la generación" : "Creando tu software con IA…"}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
              {failed ? (build.error || "Puedes reintentar.")
                : (summary.phase_label || STEPS[Math.min(idx, STEPS.length - 1)]?.label)}
            </p>
          </div>
          {!failed && (
            <div className="ml-auto text-right shrink-0">
              <p className="text-2xl font-bold tabular-nums">{progress}%</p>
              <p className="text-[11px] text-neutral-500">~{mm}:{String(ss).padStart(2, "0")} restante</p>
            </div>
          )}
        </div>
        {!failed && (
          <div className="mt-4 h-2 rounded-full bg-neutral-200/70 dark:bg-neutral-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand to-fuchsia-500 transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(3, Math.min(100, progress))}%` }} />
          </div>
        )}
        {!failed && summary.phase_detail && (
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {summary.phase_detail}
          </p>
        )}
      </div>

      {/* Timeline de pasos */}
      <ol className="p-5 space-y-1">
        {STEPS.map((step, i) => {
          const done = i < idx || stage === "completed";
          const current = i === idx && !failed && stage !== "completed";
          const Icon = step.icon;
          return (
            <li key={step.key} className="flex items-start gap-3 py-1.5">
              <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 transition ${
                done ? "bg-green-500/15 text-green-600 dark:text-green-300"
                : current ? "bg-brand/15 text-brand"
                : "bg-neutral-100 dark:bg-neutral-900 text-neutral-400"}`}>
                {current ? <Loader2 size={15} className="animate-spin" />
                  : done ? <CheckCircle2 size={15} /> : <Icon size={15} />}
              </span>
              <div className="min-w-0">
                <p className={`text-sm ${current ? "font-semibold text-neutral-900 dark:text-neutral-100"
                  : done ? "text-neutral-500" : "text-neutral-400"}`}>{step.label}</p>
                {current && <p className="text-xs text-neutral-500 mt-0.5">{step.desc}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="px-5 pb-4 text-[11px] text-neutral-400">
        Puedes cerrar la pestaña; el proceso continúa en el servidor.
      </p>
    </div>
  );
}

export default GenerationProgress;
