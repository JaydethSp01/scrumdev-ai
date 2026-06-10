"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, CheckCircle2, Lock, Layers, GitBranch,
  Server, Monitor, FlaskConical, Bug, Lightbulb, Plus,
} from "lucide-react";
import {
  apiGetRefinement, apiAddFeedback, apiGetMockups, apiGetCodeSummary,
  type Refinement, type RefinementStory, type Mockup, type CodeSummary,
} from "@/lib/api";

const MODULE_META: Record<string, { icon: typeof Server; label: string; cls: string }> = {
  backend: { icon: Server, label: "Backend", cls: "text-violet-600 dark:text-violet-300 bg-violet-500/10" },
  frontend: { icon: Monitor, label: "Frontend", cls: "text-sky-600 dark:text-sky-300 bg-sky-500/10" },
  tests: { icon: FlaskConical, label: "Tests", cls: "text-amber-600 dark:text-amber-300 bg-amber-500/10" },
};

export default function RefinementPanel({ projectKey }: { projectKey: string }) {
  const [data, setData] = useState<Refinement | null>(null);
  const [mockup, setMockup] = useState<Mockup | null>(null);
  const [code, setCode] = useState<CodeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [fbTitle, setFbTitle] = useState("");
  const [fbKind, setFbKind] = useState<"bug" | "improvement">("bug");
  const [fbBusy, setFbBusy] = useState(false);
  const [fbMsg, setFbMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ref, mk, cs] = await Promise.allSettled([
        apiGetRefinement(projectKey),
        apiGetMockups(projectKey),
        apiGetCodeSummary(projectKey),
      ]);
      setData(ref.status === "fulfilled" ? ref.value : null);
      setMockup(mk.status === "fulfilled" ? mk.value : null);
      setCode(cs.status === "fulfilled" ? cs.value : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  const submitFeedback = useCallback(async () => {
    if (!fbTitle.trim()) return;
    setFbBusy(true);
    setFbMsg("");
    try {
      await apiAddFeedback(projectKey, fbTitle.trim(), fbKind);
      setFbTitle("");
      setFbMsg("Agregado al backlog como historia nueva.");
      await load();
    } catch {
      setFbMsg("No se pudo agregar.");
    } finally {
      setFbBusy(false);
    }
  }, [projectKey, fbTitle, fbKind, load]);

  if (loading) {
    return <div className="min-h-[300px] grid place-items-center"><Loader2 className="animate-spin text-brand" size={28} /></div>;
  }
  if (!data || data.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
        Aún no hay backlog refinado. Inicia el ciclo de vida para generar las historias y sus tareas técnicas.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full bg-brand/10 text-brand">
            <GitBranch size={11} /> Refinamiento
          </span>
          <h2 className="text-2xl font-semibold tracking-tight mt-2">Tareas técnicas y trazabilidad</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 max-w-xl">
            Cada historia se descompone en tareas técnicas por módulo. La generación
            de código se reparte por componente (no monolítica) y todo queda trazado:
            requerimiento → historia → tarea → código.
          </p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900">
          <RefreshCw size={14} /> Refrescar
        </button>
      </header>

      {/* Trazabilidad (Adam A): requerimiento origen */}
      {data.requirement && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 p-4">
          <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Requerimiento origen</div>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{data.requirement}</p>
          <p className="text-[11px] text-neutral-400 mt-2">
            ↳ De este requerimiento se derivaron las {data.total} historias del backlog (trazabilidad req → historia → tarea → código).
          </p>
        </div>
      )}

      {/* Mockup del backlog (Adam A): adaptado a la plantilla que matchea */}
      {mockup && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-1">
            <Monitor size={16} className="text-brand" /> Mockup — así se verá tu app
          </h3>
          {mockup.matched && mockup.template ? (
            <>
              <p className="text-xs text-neutral-500 mb-3">
                Diseño de referencia basado en la plantilla <b>{mockup.template.name}</b>
                {typeof mockup.template.confidence === "number" && ` (match ${mockup.template.confidence}%)`}.
              </p>
              {mockup.template.preview_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mockup.template.preview_url}
                  alt={`Mockup ${mockup.template.name}`}
                  className="w-full max-w-2xl rounded-xl border border-neutral-200 dark:border-neutral-800"
                />
              ) : (
                <WireframePlaceholder label={mockup.template.name} />
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-500 mb-3">
                Ninguna plantilla coincide lo suficiente: el diseño se genera <b>a medida</b>
                durante el desarrollo según tus historias.
              </p>
              <WireframePlaceholder label="Diseño a medida" />
            </>
          )}
          {mockup.alternatives && mockup.alternatives.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-[11px] text-neutral-400 self-center">Alternativas:</span>
              {mockup.alternatives.slice(0, 4).map((a) => (
                <span key={a.id} className="text-[11px] px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                  {a.name}{typeof a.confidence === "number" ? ` ${a.confidence}%` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generación por módulos (E #10): desglose */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
          <div className="flex items-center gap-2 text-neutral-500 text-xs"><Layers size={14} /> Tareas técnicas</div>
          <div className="text-2xl font-semibold mt-1">{data.tech_tasks_total}</div>
        </div>
        {(["backend", "frontend", "tests"] as const).map((m) => {
          const M = MODULE_META[m];
          return (
            <div key={m} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
              <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md ${M.cls}`}>
                <M.icon size={13} /> {M.label}
              </div>
              <div className="text-2xl font-semibold mt-1">{data.by_module?.[m] ?? 0}</div>
              <div className="text-[11px] text-neutral-400">tareas planeadas</div>
              {code && code.generated && (
                <div className="text-[11px] text-emerald-600 mt-0.5">{code.by_module?.[m] ?? 0} archivos generados</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-sm text-neutral-500 flex items-center gap-2">
        <CheckCircle2 size={15} className={data.dor_ready === data.total ? "text-emerald-500" : "text-amber-500"} />
        DoR: <b>{data.dor_ready}/{data.total}</b> historias listas para desarrollo.
      </div>

      {/* Trazabilidad: historia -> tareas técnicas */}
      <div className="space-y-2">
        {data.stories.map((s) => <StoryRow key={s.story_key} s={s} />)}
      </div>

      {/* Feedback loop (H #15) */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5">
        <h3 className="font-semibold flex items-center gap-2"><Bug size={16} className="text-brand" /> Feedback al backlog</h3>
        <p className="text-xs text-neutral-500 mt-1">Un error o una mejora se convierte en una historia nueva del backlog.</p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="inline-flex rounded-lg border border-neutral-300 dark:border-neutral-700 overflow-hidden text-sm">
            <button onClick={() => setFbKind("bug")} className={`px-3 py-2 inline-flex items-center gap-1.5 ${fbKind === "bug" ? "bg-red-500/10 text-red-600" : ""}`}><Bug size={14} /> Bug</button>
            <button onClick={() => setFbKind("improvement")} className={`px-3 py-2 inline-flex items-center gap-1.5 ${fbKind === "improvement" ? "bg-emerald-500/10 text-emerald-600" : ""}`}><Lightbulb size={14} /> Mejora</button>
          </div>
          <input
            value={fbTitle}
            onChange={(e) => setFbTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submitFeedback(); }}
            placeholder={fbKind === "bug" ? "Describe el error encontrado…" : "Describe la mejora…"}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent"
          />
          <button onClick={() => void submitFeedback()} disabled={fbBusy || !fbTitle.trim()} className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">
            {fbBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Agregar
          </button>
        </div>
        {fbMsg && <p className="text-xs text-emerald-600 mt-2">{fbMsg}</p>}
      </div>
    </div>
  );
}

function WireframePlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full max-w-2xl rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 overflow-hidden">
      <div className="h-9 bg-neutral-200 dark:bg-neutral-800 flex items-center px-3 gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
        <span className="ml-3 text-[10px] text-neutral-500">{label}</span>
      </div>
      <div className="flex">
        <div className="w-1/5 p-2 space-y-1.5 border-r border-neutral-200 dark:border-neutral-800">
          {[...Array(5)].map((_, i) => <div key={i} className="h-3 rounded bg-neutral-200 dark:bg-neutral-800" />)}
        </div>
        <div className="flex-1 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-neutral-200 dark:bg-neutral-800" />)}
          </div>
          <div className="h-24 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-3 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}

function StoryRow({ s }: { s: RefinementStory }) {
  const byModule = (m: string) => s.tech_tasks.filter((t) => t.module === m);
  return (
    <details className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3">
      <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-brand">{s.story_key}</span>
        <span>{s.title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${s.dor.ready ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
          {s.dor.ready ? <CheckCircle2 size={9} /> : <Lock size={9} />} DoR
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand ml-auto">{s.tech_tasks.length} tareas</span>
      </summary>
      {s.mockup && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">Mockup de la historia</p>
          <div className="max-w-sm rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800"
            dangerouslySetInnerHTML={{ __html: s.mockup }} />
        </div>
      )}
      <div className="mt-3 grid sm:grid-cols-3 gap-3">
        {(["backend", "frontend", "tests"] as const).map((m) => {
          const tasks = byModule(m);
          if (!tasks.length) return null;
          const M = MODULE_META[m];
          return (
            <div key={m}>
              <div className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md mb-1.5 ${M.cls}`}>
                <M.icon size={12} /> {M.label}
              </div>
              <ul className="space-y-1">
                {tasks.map((t, i) => (
                  <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">
                    • {t.title}
                    {t.depends_on && t.depends_on.length > 0 && (
                      <span className="text-[10px] text-neutral-400"> ↳ depende de {t.depends_on.length}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </details>
  );
}
