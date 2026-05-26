"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListTodo,
  RefreshCw,
  X,
  Loader2,
  Code2,
  CheckCircle2,
  Circle,
  PlayCircle,
} from "lucide-react";
import {
  apiGetBacklog,
  startWorkflow,
  type BacklogItem,
} from "@/lib/api";
import type { AuthUser } from "@/app/auth/_lib";
import EmptyState from "@/components/EmptyState";
import Spinner from "@/components/Spinner";
import PrettyMarkdown from "@/components/PrettyMarkdown";
import { ToastStack, useToasts } from "@/components/Toast";

type Props = {
  projectKey: string;
  user: AuthUser;
};

type Column = {
  key: "backlog" | "in_progress" | "done";
  label: string;
  icon: typeof Circle;
  match: (status?: string) => boolean;
};

const COLUMNS: Column[] = [
  {
    key: "backlog",
    label: "Backlog",
    icon: Circle,
    match: (s) => {
      const v = (s || "").toLowerCase();
      return !v || v === "todo" || v === "backlog" || v === "pending" || v === "new";
    },
  },
  {
    key: "in_progress",
    label: "In progress",
    icon: PlayCircle,
    match: (s) => {
      const v = (s || "").toLowerCase();
      return v === "in_progress" || v === "doing" || v === "in-progress" || v === "active";
    },
  },
  {
    key: "done",
    label: "Done",
    icon: CheckCircle2,
    match: (s) => {
      const v = (s || "").toLowerCase();
      return v === "done" || v === "completed" || v === "closed" || v === "resolved";
    },
  },
];

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

export function BacklogBoard({ projectKey, user }: Props) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BacklogItem | null>(null);
  const [generating, setGenerating] = useState(false);
  const toasts = useToasts();

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetBacklog(projectKey);
      const sorted = [...data].sort(
        (a, b) => (a.order_index ?? 9999) - (b.order_index ?? 9999)
      );
      setItems(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const grouped = useMemo(() => {
    return COLUMNS.map((c) => ({
      column: c,
      items: items.filter((it) => c.match(it.status)),
    }));
  }, [items]);

  async function generateCodeFor(item: BacklogItem) {
    setGenerating(true);
    try {
      const message =
        item.description ||
        `${item.title}\n\nCriterios:\n${(item.acceptance_criteria || []).map((c) => `- ${c}`).join("\n")}`;
      await startWorkflow({
        user_id: user.user_id,
        project_key: projectKey,
        message,
        crew_name: "delivery",
      });
      toasts.success("Generacion individual lanzada.");
      setSelected(null);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ListTodo size={18} className="text-brand" />
            <h2 className="text-lg font-semibold tracking-tight">Backlog</h2>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Historias generadas por el crew de refinement. Click en una card para ver detalles.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          <RefreshCw size={14} /> Refrescar
        </button>
      </header>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <div className="min-h-[40vh] grid place-items-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Backlog vacio"
          description="Genera el sistema desde el boton principal para que los agentes creen historias."
          icon={ListTodo}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {grouped.map(({ column, items: colItems }) => {
            const Icon = column.icon;
            return (
              <div
                key={column.key}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between px-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                    <Icon size={12} /> {column.label}
                  </span>
                  <span className="text-xs text-neutral-500 tabular-nums">
                    {colItems.length}
                  </span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {colItems.length === 0 ? (
                    <p className="text-xs text-neutral-400 px-2 py-3 text-center">
                      Vacio
                    </p>
                  ) : (
                    colItems.map((it) => (
                      <StoryCard key={it.id} item={it} onOpen={() => setSelected(it)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <StoryModal
          item={selected}
          onClose={() => setSelected(null)}
          onGenerate={() => generateCodeFor(selected)}
          generating={generating}
        />
      )}

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function StoryCard({
  item,
  onOpen,
}: {
  item: BacklogItem;
  onOpen: () => void;
}) {
  const pri = (item.priority || "").toLowerCase();
  return (
    <button
      onClick={onOpen}
      className="w-full text-left p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:border-brand/40 hover:shadow-sm transition"
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
            PRIORITY_DOT[pri] || "bg-neutral-400"
          }`}
          title={`prioridad: ${item.priority || "n/a"}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono text-neutral-500">
            {item.story_key || item.id.slice(0, 8)}
          </p>
          <p className="text-sm font-medium leading-snug mt-0.5 line-clamp-2">
            {item.title}
          </p>
        </div>
        {typeof item.story_points === "number" && (
          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-brand/10 text-brand shrink-0">
            {item.story_points}
          </span>
        )}
      </div>
    </button>
  );
}

function StoryModal({
  item,
  onClose,
  onGenerate,
  generating,
}: {
  item: BacklogItem;
  onClose: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-neutral-500">
              {item.story_key || item.id}
            </p>
            <h3 className="font-semibold tracking-tight">{item.title}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {item.priority && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                  prioridad: {item.priority}
                </span>
              )}
              {typeof item.story_points === "number" && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand/10 text-brand">
                  {item.story_points} pts
                </span>
              )}
              {item.status && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                  {item.status}
                </span>
              )}
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
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {item.description && (
            <section>
              <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                Descripcion
              </h4>
              <PrettyMarkdown>{item.description}</PrettyMarkdown>
            </section>
          )}
          {item.acceptance_criteria && item.acceptance_criteria.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                Criterios de aceptacion
              </h4>
              <ul className="space-y-1.5">
                {item.acceptance_criteria.map((c, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <CheckCircle2 size={14} className="text-brand mt-0.5 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="px-5 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            Cerrar
          </button>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark font-medium disabled:opacity-60"
          >
            {generating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Code2 size={14} />
            )}
            Generar codigo individual
          </button>
        </div>
      </div>
    </div>
  );
}

export default BacklogBoard;
