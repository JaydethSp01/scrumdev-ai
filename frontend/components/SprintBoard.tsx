"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Play,
  CheckCircle2,
  Loader2,
  ArrowUp,
  ArrowDown,
  Target,
  Layers,
  Inbox,
  RefreshCw,
} from "lucide-react";
import {
  apiGetSprints,
  apiPlanSprints,
  apiReorderSprints,
  apiSetSprintStatus,
  apiMoveStory,
  type SprintBoard as Board,
  type SprintData,
} from "@/lib/api";

const STATUS_TONE: Record<string, string> = {
  planned: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700",
  active: "bg-brand/15 text-brand border-brand/40",
  completed: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/40",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
};

export function SprintBoard({ projectKey }: { projectKey: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBoard(await apiGetSprints(projectKey));
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const plan = useCallback(async () => {
    setPlanning(true);
    try {
      setBoard(await apiPlanSprints(projectKey));
    } catch (e) {
      console.error(e);
    } finally {
      setPlanning(false);
    }
  }, [projectKey]);

  const reorder = useCallback(
    async (sprintId: string, dir: -1 | 1) => {
      if (!board) return;
      const ids = board.sprints.map((s) => s.id);
      const i = ids.indexOf(sprintId);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await apiReorderSprints(projectKey, ids);
      await load();
    },
    [board, projectKey, load]
  );

  const setStatus = useCallback(
    async (sprintId: string, status: string) => {
      await apiSetSprintStatus(projectKey, sprintId, status);
      await load();
    },
    [projectKey, load]
  );

  if (loading) {
    return (
      <div className="min-h-[300px] grid place-items-center">
        <Loader2 className="animate-spin text-brand" size={28} />
      </div>
    );
  }

  const hasSprints = board && board.sprints.length > 0;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full bg-brand/10 text-brand">
            <Layers size={11} /> Sprint Planning
          </span>
          <h2 className="text-2xl font-semibold tracking-tight mt-2">Sprints</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 max-w-xl">
            Como Product Owner decides el orden de los sprints, qué historias
            entran a cada uno y cuál ejecutar primero.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <RefreshCw size={14} /> Refrescar
          </button>
          <button
            onClick={() => void plan()}
            disabled={planning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-brand to-fuchsia-500 text-white font-medium shadow-lg shadow-brand/30 hover:opacity-95 disabled:opacity-60"
          >
            {planning ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {hasSprints ? "Replanificar con IA" : "Planificar sprints con IA"}
          </button>
        </div>
      </header>

      {!hasSprints ? (
        <div className="rounded-2xl border border-dashed border-brand/40 bg-brand/5 p-10 text-center">
          <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand to-fuchsia-500 text-white shadow-lg">
            <Layers size={26} />
          </div>
          <h3 className="text-xl font-semibold mt-4">Aún no hay sprints</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 max-w-md mx-auto">
            El PO Agent agrupará tu backlog en sprints incrementales. Después tú
            decides el orden y mueves historias a tu gusto.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {board!.sprints.map((s, idx) => (
            <SprintCard
              key={s.id}
              sprint={s}
              isFirst={idx === 0}
              isLast={idx === board!.sprints.length - 1}
              onUp={() => void reorder(s.id, -1)}
              onDown={() => void reorder(s.id, 1)}
              onActivate={() => void setStatus(s.id, "active")}
              onComplete={() => void setStatus(s.id, "completed")}
            />
          ))}

          {board!.unassigned.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-500 mb-3">
                <Inbox size={15} /> Backlog sin asignar ({board!.unassigned.length})
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {board!.unassigned.map((st) => (
                  <div
                    key={st.story_key}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-sm"
                  >
                    <span className="text-[10px] font-mono text-neutral-500">{st.story_key}</span>
                    <span className="flex-1 truncate">{st.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-semibold">
                      {st.story_points}pt
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SprintCard({
  sprint,
  isFirst,
  isLast,
  onUp,
  onDown,
  onActivate,
  onComplete,
}: {
  sprint: SprintData;
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
  onActivate: () => void;
  onComplete: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border-2 bg-white dark:bg-neutral-950 overflow-hidden transition ${
        sprint.status === "active"
          ? "border-brand/50 shadow-lg shadow-brand/10"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-start gap-3 p-4 border-b border-neutral-100 dark:border-neutral-900">
        {/* reorder */}
        <div className="flex flex-col gap-0.5 pt-0.5">
          <button
            onClick={onUp}
            disabled={isFirst}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-30"
            title="Subir"
          >
            <ArrowUp size={13} />
          </button>
          <button
            onClick={onDown}
            disabled={isLast}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-30"
            title="Bajar"
          >
            <ArrowDown size={13} />
          </button>
        </div>
        <div className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-fuchsia-500 text-white font-bold shrink-0">
          {sprint.number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold tracking-tight">{sprint.name}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider border ${STATUS_TONE[sprint.status]}`}>
              {sprint.status === "active" && <Loader2 size={9} className="animate-spin" />}
              {sprint.status === "completed" && <CheckCircle2 size={9} />}
              {sprint.status}
            </span>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 flex items-start gap-1.5">
            <Target size={13} className="mt-0.5 shrink-0 text-brand" />
            {sprint.goal}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-semibold tabular-nums">{sprint.total_points}</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">puntos</div>
        </div>
      </div>

      <div className="p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {sprint.stories.map((st) => (
            <div
              key={st.story_key}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-100 dark:border-neutral-800 text-sm"
            >
              <span className="text-[10px] font-mono text-neutral-500">{st.story_key}</span>
              <span className="flex-1 truncate">{st.title}</span>
              {st.status === "done" && <CheckCircle2 size={13} className="text-green-500 shrink-0" />}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-semibold">
                {st.story_points}pt
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-3">
          {sprint.status === "planned" && (
            <button
              onClick={onActivate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:opacity-90"
            >
              <Play size={13} /> Activar sprint
            </button>
          )}
          {sprint.status === "active" && (
            <button
              onClick={onComplete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:opacity-90"
            >
              <CheckCircle2 size={13} /> Completar sprint
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SprintBoard;
