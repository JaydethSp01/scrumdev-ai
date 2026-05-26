"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Brain,
  Shield,
  TestTube,
  Workflow as WorkflowIcon,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { getAgents, type AgentInfo } from "@/lib/api";
import Spinner from "./Spinner";
import EmptyState from "./EmptyState";

const iconFor = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("refin")) return Sparkles;
  if (n.includes("arch")) return WorkflowIcon;
  if (n.includes("test") || n.includes("qa")) return TestTube;
  if (n.includes("sec")) return Shield;
  if (n.includes("planner") || n.includes("scrum")) return Brain;
  return Bot;
};

export function AgentsPanel() {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const data = await getAgents();
      setAgents(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (loading && !agents) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Spinner size={16} /> Cargando agentes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-500/40 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
        Backend no responde: {error}
        <button onClick={refresh} className="ml-3 underline inline-flex items-center gap-1">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return <EmptyState title="No hay agentes registrados" icon={Bot} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{agents.length} agentes registrados</p>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-brand"
        >
          <RefreshCw size={12} /> Refrescar
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((a, i) => {
          const Icon = iconFor(a.name || "");
          return (
            <div
              key={a.name || i}
              className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-950 hover:border-brand/40 hover:shadow-sm transition"
            >
              <div className="flex items-start gap-3">
                <div className="grid place-items-center w-10 h-10 rounded-lg bg-brand/10 text-brand shrink-0">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-sm truncate">{a.name || `agent-${i}`}</h4>
                  {a.role && (
                    <p className="text-xs text-neutral-500 truncate">{a.role}</p>
                  )}
                </div>
              </div>
              {a.description && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-3 line-clamp-3">
                  {a.description}
                </p>
              )}
              {a.provider && (
                <div className="mt-3 flex flex-wrap gap-1">
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                    provider: {a.provider}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AgentsPanel;
