"use client";

import { useEffect, useState } from "react";
import {
  X,
  Rocket,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { apiStartBuild, type BuildRecord } from "@/lib/api";
import { fireBuildStarted } from "@/components/BuildProgressToast";
import type { AuthUser } from "@/app/auth/_lib";

type Props = {
  open: boolean;
  onClose: () => void;
  projectKey: string;
  user: AuthUser;
  onCompleted?: (build: BuildRecord) => void;
};

const STACKS = [
  { value: "fastapi-next", label: "FastAPI + Next.js" },
  { value: "spring-react", label: "Spring Boot + React" },
  { value: "node-vue", label: "Node + Vue" },
  { value: "other", label: "Otro" },
];

export function BuildModal({
  open,
  onClose,
  projectKey,
  user,
}: Props) {
  const [stack, setStack] = useState("fastapi-next");
  const [maxStories, setMaxStories] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  async function start() {
    setError(null);
    setSubmitting(true);
    try {
      await apiStartBuild({
        project_key: projectKey,
        triggered_by: user.user_id,
        stack,
        max_stories_to_code: maxStories,
      });
      // Backend kicks off async pipeline; the persistent toast takes over.
      fireBuildStarted(projectKey);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-brand to-brand-dark text-white">
              <Rocket size={16} />
            </span>
            <div>
              <h3 className="font-semibold tracking-tight">
                Generar sistema completo
              </h3>
              <p className="text-xs text-neutral-500">
                Pipeline: vision a codigo, end-to-end (corre en background).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="space-y-4">
            <Field label="Stack tecnologico">
              <select
                value={stack}
                onChange={(e) => setStack(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
              >
                {STACKS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={`Historias a codificar: ${maxStories}`}
              hint="Tope de historias para las que se genera codigo en esta corrida (1-10)."
            >
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={maxStories}
                onChange={(e) => setMaxStories(Number(e.target.value))}
                disabled={submitting}
                className="w-full accent-brand"
              />
            </Field>
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Esta operacion lanza el pipeline completo: refinement,
              arquitectura y generacion de codigo. Suele tardar entre 2 y 5
              minutos. Puedes cerrar esta ventana o la pestana del navegador;
              el proceso continua en segundo plano y veras un indicador con el
              progreso.
            </div>
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 text-sm rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={start}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark font-medium disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Rocket size={14} />
            )}
            {submitting ? "Lanzando..." : "Lanzar generacion"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

export default BuildModal;
