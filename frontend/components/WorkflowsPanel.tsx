"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PrettyMarkdown from "@/components/PrettyMarkdown";
import {
  Clock,
  GitBranch,
  ChevronRight,
  ArrowLeft,
  Workflow as WorkflowIcon,
  RefreshCw,
} from "lucide-react";
import {
  listProjectWorkflows,
  type StoredWorkflow,
} from "@/lib/workflows";
import { listWorkflowRuns, type WorkflowRun } from "@/lib/api";
import EmptyState from "./EmptyState";

type Props = { projectKey: string };

const POLL_MS = 5000;

type UnifiedWorkflow = StoredWorkflow & {
  via: "http" | "temporal" | "local";
};

function fromBackend(run: WorkflowRun): UnifiedWorkflow {
  const output =
    run.output ||
    run.result?.output ||
    (run.context && typeof run.context === "object"
      ? JSON.stringify(run.context, null, 2)
      : "(sin output)");
  return {
    id: run.id || run.workflow_id || run.correlation_id || `bk_${Math.random().toString(36).slice(2)}`,
    workflow_id: run.workflow_id,
    correlation_id: run.correlation_id,
    project_key: run.project_key || "",
    issue_key: null,
    crew_name: (run.crew_name as StoredWorkflow["crew_name"]) || "refinement",
    input:
      (run.context && typeof run.context === "object"
        ? (run.context as Record<string, unknown>).story?.toString() ||
          (run.context as Record<string, unknown>).requirements?.toString() ||
          ""
        : "") || run.target_state || "(sin input)",
    output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
    status: run.status || "completed",
    createdAt: run.created_at || new Date().toISOString(),
    via: (run.via as "http" | "temporal") || "http",
  };
}

function mergeWorkflows(
  remote: UnifiedWorkflow[],
  local: StoredWorkflow[]
): UnifiedWorkflow[] {
  const map = new Map<string, UnifiedWorkflow>();
  for (const r of remote) map.set(r.id, r);
  for (const l of local) {
    const key = l.workflow_id || l.correlation_id || l.id;
    if (!map.has(key)) {
      map.set(key, { ...l, via: "local" });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function WorkflowsPanel({ projectKey }: Props) {
  const [items, setItems] = useState<UnifiedWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const local = listProjectWorkflows(projectKey);
    try {
      const remote = (await listWorkflowRuns(projectKey)).map(fromBackend);
      setItems(mergeWorkflows(remote, local));
      setBackendError(null);
    } catch (e) {
      setItems(mergeWorkflows([], local));
      setBackendError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const selected = useMemo(
    () => items.find((w) => w.id === selectedId) || null,
    [items, selectedId]
  );

  if (selected) {
    return (
      <WorkflowDetail workflow={selected} onBack={() => setSelectedId(null)} />
    );
  }

  if (loading) {
    return (
      <div className="text-sm text-neutral-500 p-4 text-center">Cargando workflows...</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {backendError && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Backend no respondio: {backendError}
          </p>
        )}
        <EmptyState
          title="Sin workflows aun"
          description="Cuando ejecutes un crew desde el chat o avances un workflow, aparecera aqui."
          icon={WorkflowIcon}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {items.length} {items.length === 1 ? "ejecucion" : "ejecuciones"} registradas
        </p>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-brand"
        >
          <RefreshCw size={12} /> Refrescar
        </button>
      </div>
      {backendError && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Backend no respondio: {backendError} (mostrando cache local)
        </p>
      )}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
        {items.map((w) => (
          <button
            key={w.id}
            onClick={() => setSelectedId(w.id)}
            className="w-full text-left p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition flex items-center gap-3"
          >
            <div className="grid place-items-center w-9 h-9 rounded-lg bg-brand/10 text-brand shrink-0">
              <GitBranch size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{w.input.slice(0, 80)}</span>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                  {w.crew_name}
                </span>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400">
                  via {w.via}
                </span>
                {w.status && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400">
                    {w.status}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} />
                  {new Date(w.createdAt).toLocaleString()}
                </span>
                {w.durationMs != null && <span>{(w.durationMs / 1000).toFixed(1)}s</span>}
                {w.correlation_id && (
                  <span className="font-mono truncate">cid: {w.correlation_id.slice(0, 12)}...</span>
                )}
              </div>
            </div>
            <ChevronRight size={16} className="opacity-50 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkflowDetail({
  workflow,
  onBack,
}: {
  workflow: UnifiedWorkflow;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand"
      >
        <ArrowLeft size={14} /> Volver a la lista
      </button>
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand/10 text-brand">
              {workflow.crew_name}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400">
              via {workflow.via}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400">
              {workflow.status}
            </span>
            <span className="text-xs text-neutral-500 inline-flex items-center gap-1 ml-auto">
              <Clock size={11} /> {new Date(workflow.createdAt).toLocaleString()}
              {workflow.durationMs != null && <> - {(workflow.durationMs / 1000).toFixed(1)}s</>}
            </span>
          </div>
          {workflow.correlation_id && (
            <p className="text-xs font-mono text-neutral-500 break-all">
              correlation_id: {workflow.correlation_id}
            </p>
          )}
          {workflow.workflow_id && (
            <p className="text-xs font-mono text-neutral-500 break-all">
              workflow_id: {workflow.workflow_id}
            </p>
          )}
        </div>
        <div className="p-4 space-y-4">
          <section>
            <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Input</h4>
            <p className="text-sm whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3">
              {workflow.input}
            </p>
          </section>
          <section>
            <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Salida</h4>
            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 max-h-[60vh] overflow-y-auto">
              <PrettyMarkdown>{workflow.output}</PrettyMarkdown>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default WorkflowsPanel;
