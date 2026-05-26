"use client";

import { CheckCircle2, Loader2, AlertTriangle, GitBranch, Clock } from "lucide-react";

export type WorkflowState =
  | "queued"
  | "running"
  | "vision"
  | "backlog"
  | "architecture"
  | "coding"
  | "policy_check"
  | "awaiting_approval"
  | "deploying"
  | "completed"
  | "failed"
  | "rejected_by_human"
  | "blocked_by_policy";

export type Workflow = {
  id: string;
  project_key: string;
  state: WorkflowState;
  progress_percent?: number;
  started_at?: string;
  updated_at?: string;
  crew_name?: string;
  error?: string | null;
};

function stateTone(state: WorkflowState): string {
  if (state === "completed")
    return "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30";
  if (state === "failed" || state === "rejected_by_human" || state === "blocked_by_policy")
    return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
  if (state === "awaiting_approval")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/30";
  return "bg-brand/10 text-brand border-brand/30";
}

function stateLabel(state: WorkflowState): string {
  const map: Record<WorkflowState, string> = {
    queued: "En cola",
    running: "Ejecutando",
    vision: "Vision",
    backlog: "Backlog",
    architecture: "Arquitectura",
    coding: "Codigo",
    policy_check: "Policy check",
    awaiting_approval: "Esperando aprobacion",
    deploying: "Desplegando",
    completed: "Completado",
    failed: "Fallido",
    rejected_by_human: "Rechazado",
    blocked_by_policy: "Bloqueado por policy",
  };
  return map[state] || state;
}

export function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const isFinal = ["completed", "failed", "rejected_by_human", "blocked_by_policy"].includes(workflow.state);
  const Icon =
    workflow.state === "completed"
      ? CheckCircle2
      : workflow.state === "failed" || workflow.state === "rejected_by_human" || workflow.state === "blocked_by_policy"
      ? AlertTriangle
      : Loader2;

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 bg-white dark:bg-neutral-950 hover:border-brand/40 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-brand/20 to-fuchsia-500/10 text-brand shrink-0">
            <GitBranch size={16} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold truncate text-sm">
              {workflow.crew_name || "Workflow"}
            </p>
            <p className="text-[11px] font-mono text-neutral-500 truncate">{workflow.id.slice(0, 12)}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider border ${stateTone(
            workflow.state
          )}`}
        >
          <Icon size={11} className={isFinal ? "" : "animate-spin"} />
          {stateLabel(workflow.state)}
        </span>
      </div>

      {typeof workflow.progress_percent === "number" && !isFinal && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand to-fuchsia-500 transition-all duration-500"
              style={{ width: `${workflow.progress_percent}%` }}
            />
          </div>
          <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">
            {workflow.progress_percent}%
          </p>
        </div>
      )}

      {workflow.error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400 line-clamp-2">
          {workflow.error}
        </p>
      )}

      {workflow.started_at && (
        <p className="mt-2 text-[11px] text-neutral-500 flex items-center gap-1">
          <Clock size={10} />
          {new Date(workflow.started_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export default WorkflowCard;
