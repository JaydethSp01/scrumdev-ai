"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Rocket,
  ArrowRight,
} from "lucide-react";
import { apiListBuilds, type BuildRecord } from "@/lib/api";

type Props = {
  projectKey: string;
  onCompleted?: (build: BuildRecord) => void;
  onGoTo?: (tab: string) => void;
};

// Active (in-progress) stages we keep polling for.
const ACTIVE_STAGES = new Set([
  "queued",
  "vision",
  "backlog",
  "architecture",
  "coding",
  "generating_app",
  "saving_code",
  "running",
]);

function isActive(stage: string | undefined): boolean {
  if (!stage) return false;
  return ACTIVE_STAGES.has(stage.toLowerCase());
}

function stageLabel(stage: string | undefined): string {
  const s = (stage || "").toLowerCase();
  switch (s) {
    case "queued":
      return "En cola";
    case "vision":
      return "Leyendo vision";
    case "backlog":
      return "Refinando backlog";
    case "architecture":
      return "Disenando arquitectura";
    case "coding":
      return "Generando codigo";
    case "generating_app":
      return "Generando el software (front + back)";
    case "saving_code":
      return "Guardando y validando";
    case "running":
      return "Trabajando";
    case "completed":
      return "Completado";
    case "failed":
      return "Fallido";
    default:
      return stage || "";
  }
}

export const BUILD_STARTED_EVENT = "scrumdev:build_started";

export function fireBuildStarted(projectKey: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BUILD_STARTED_EVENT, { detail: { projectKey } })
  );
}

export function BuildProgressToast({
  projectKey,
  onCompleted,
  onGoTo,
}: Props) {
  const [build, setBuild] = useState<BuildRecord | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedCompletedRef = useRef<string | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const builds = await apiListBuilds(projectKey, 1);
      if (builds.length === 0) return;
      const latest = builds[0];
      const stage = (latest.stage || "").toLowerCase();
      setBuild(latest);
      if (stage === "completed") {
        stopPoll();
        const bid = latest.build_id || latest.id || "_last";
        if (notifiedCompletedRef.current !== bid) {
          notifiedCompletedRef.current = bid;
          onCompleted?.(latest);
        }
      } else if (stage === "failed") {
        stopPoll();
      }
    } catch {
      // ignore poll errors; keep trying
    }
  }, [projectKey, stopPoll, onCompleted]);

  const startPolling = useCallback(() => {
    setDismissed(false);
    setVisible(true);
    stopPoll();
    void poll();
    pollRef.current = setInterval(poll, 4000);
  }, [poll, stopPoll]);

  // On mount / project change: resume if there's an active build.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const builds = await apiListBuilds(projectKey, 1);
        if (cancelled) return;
        if (builds.length === 0) return;
        const latest = builds[0];
        setBuild(latest);
        if (isActive(latest.stage)) {
          setVisible(true);
          startPolling();
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  // Listen for "build started" event triggered by BuildModal.
  useEffect(() => {
    function onStarted(e: Event) {
      const ev = e as CustomEvent<{ projectKey: string }>;
      if (ev.detail?.projectKey !== projectKey) return;
      notifiedCompletedRef.current = null;
      setVisible(true);
      setDismissed(false);
      startPolling();
    }
    window.addEventListener(BUILD_STARTED_EVENT, onStarted as EventListener);
    return () =>
      window.removeEventListener(
        BUILD_STARTED_EVENT,
        onStarted as EventListener
      );
  }, [projectKey, startPolling]);

  if (!visible || !build || dismissed) return null;

  const stage = (build.stage || "").toLowerCase();
  const progress =
    typeof build.progress_percent === "number" ? build.progress_percent : 0;
  const active = isActive(stage);
  const completed = stage === "completed";
  const failed = stage === "failed";

  const containerTone = completed
    ? "border-green-500/40 bg-green-50 dark:bg-green-950/40"
    : failed
    ? "border-red-500/40 bg-red-50 dark:bg-red-950/40"
    : "border-brand/40 bg-white dark:bg-neutral-950";

  const Icon = completed
    ? CheckCircle2
    : failed
    ? AlertTriangle
    : active
    ? Loader2
    : Rocket;

  const iconTone = completed
    ? "text-green-600"
    : failed
    ? "text-red-600"
    : "text-brand";

  const title = completed
    ? "Sistema generado!"
    : failed
    ? "El build fallo"
    : "Generando sistema...";

  const summary = (build.summary || {}) as {
    phase_label?: string;
    phase_detail?: string;
  };
  const subtitle = completed
    ? summary.phase_detail || "Ver backlog y codigo generado."
    : failed
    ? build.error || "Revisa el log de auditoria."
    : `${summary.phase_label || stageLabel(stage)} - ${progress}%`;
  // detalle explicativo (por que demora) mientras genera
  const phaseDetail =
    !completed && !failed ? summary.phase_detail : undefined;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-[22rem]">
      <div
        role="status"
        aria-live="polite"
        className={`border rounded-xl shadow-lg p-3 ${containerTone}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`grid place-items-center w-9 h-9 rounded-lg ${
              completed
                ? "bg-green-500/15"
                : failed
                ? "bg-red-500/15"
                : "bg-brand/10"
            } ${iconTone} shrink-0`}
          >
            <Icon
              size={18}
              className={active && !completed && !failed ? "animate-spin" : ""}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5 truncate">
              {subtitle}
            </p>
          </div>
          {(completed || failed) && (
            <button
              onClick={() => setDismissed(true)}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 opacity-60 hover:opacity-100"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {!completed && !failed && (
          <div className="mt-3 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand to-brand-dark transition-all duration-500"
              style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
            />
          </div>
        )}

        {phaseDetail && (
          <p className="mt-2 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
            {phaseDetail}
          </p>
        )}

        {completed && (
          <div className="mt-3 flex items-center gap-2">
            {onGoTo && (
              <button
                onClick={() => {
                  onGoTo("backlog");
                  setDismissed(true);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 font-medium"
              >
                Ir a Backlog <ArrowRight size={12} />
              </button>
            )}
            {onGoTo && (
              <button
                onClick={() => {
                  onGoTo("code");
                  setDismissed(true);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-green-500/40 text-green-700 dark:text-green-300 hover:bg-green-500/10"
              >
                Ver codigo
              </button>
            )}
          </div>
        )}

        {!completed && !failed && (
          <p className="text-[11px] text-neutral-500 mt-2">
            Puedes cerrar esta pestana, el proceso continua en el servidor.
          </p>
        )}
      </div>
    </div>
  );
}

export default BuildProgressToast;
