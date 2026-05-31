"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers, Loader2, RefreshCw, Plus, ChevronLeft, ChevronRight, Trash2,
  GitBranch, Sparkles, CheckCircle2,
} from "lucide-react";
import {
  listVersions, apiGetSprints, apiPlanSprints,
  createTask, updateTask, deleteTask,
  type VersionInfo,
} from "@/lib/api";
import Spinner from "@/components/Spinner";
import { ToastStack, useToasts } from "@/components/Toast";

type Story = {
  id: string; story_key?: string; title: string; description?: string;
  story_points?: number; status?: string; priority?: string;
  sprint_id?: string | null; origin?: string;
};
type Sprint = {
  id: string; number: number; name: string; goal?: string;
  status?: string; total_points?: number; stories: Story[];
};
type Board = { sprints: Sprint[]; unassigned: Story[] };

const COLS = [
  { key: "backlog", label: "Por hacer", match: (s?: string) => !s || ["backlog", "todo", "pending", "new"].includes((s || "").toLowerCase()) },
  { key: "in_progress", label: "En progreso", match: (s?: string) => ["in_progress", "doing", "active"].includes((s || "").toLowerCase()) },
  { key: "done", label: "Hecho", match: (s?: string) => ["done", "completed", "closed"].includes((s || "").toLowerCase()) },
];
const STATUS_OF = ["backlog", "in_progress", "done"];
const PRI: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-green-500" };

export default function BoardsPanel({ projectKey }: { projectKey: string }) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const toasts = useToasts();

  const loadVersions = useCallback(async () => {
    const { versions } = await listVersions(projectKey);
    setVersions(versions);
    const active = versions.find((v) => v.status === "active") || versions[0];
    if (active) setActiveVersion((cur) => cur ?? active.id);
  }, [projectKey]);

  const loadBoard = useCallback(async (versionId: string | null) => {
    setLoading(true);
    try {
      let b = await apiGetSprints(projectKey, versionId || undefined);
      // fallback: si la version activa no tiene sprints, mostrar todos (UX)
      if ((!b.sprints || b.sprints.length === 0) && versionId) {
        const all = await apiGetSprints(projectKey);
        if (all.sprints && all.sprints.length > 0) b = all;
      }
      setBoard(b as unknown as Board);
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => { void loadVersions(); }, [loadVersions]);
  useEffect(() => { if (activeVersion) void loadBoard(activeVersion); }, [activeVersion, loadBoard]);

  async function plan() {
    setPlanning(true);
    try {
      await apiPlanSprints(projectKey);
      await loadBoard(activeVersion);
      toasts.success("Sprints planificados por el PO Agent");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  }

  async function moveStory(st: Story, dir: -1 | 1) {
    const cur = COLS.findIndex((c) => c.match(st.status));
    const next = cur + dir;
    if (next < 0 || next >= COLS.length) return;
    const newStatus = STATUS_OF[next];
    // optimista
    setBoard((b) => b ? patchStory(b, st.id, { status: newStatus }) : b);
    try { await updateTask(projectKey, st.id, { status: newStatus }); }
    catch (e) { toasts.error(String(e)); void loadBoard(activeVersion); }
  }

  async function addStory(sprintId: string | null, title: string) {
    if (!title.trim()) return;
    try {
      await createTask(projectKey, { title: title.trim(), status: "backlog", sprint_id: sprintId });
      await loadBoard(activeVersion);
    } catch (e) { toasts.error(String(e)); }
  }

  async function removeStory(st: Story) {
    if (!confirm(`Eliminar "${st.title}"?`)) return;
    try { await deleteTask(projectKey, st.id); setBoard((b) => b ? dropStory(b, st.id) : b); }
    catch (e) { toasts.error(String(e)); }
  }

  const currentVersion = useMemo(
    () => versions.find((v) => v.id === activeVersion),
    [versions, activeVersion]
  );

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-brand" />
            <h2 className="text-lg font-semibold tracking-tight">Boards</h2>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Tablero de trabajo por versión y sprint. Crea, mueve y gestiona tareas como en un tablero ágil.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* selector de versión */}
          <div className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700">
            <GitBranch size={14} className="text-neutral-400" />
            <select
              value={activeVersion ?? ""}
              onChange={(e) => setActiveVersion(e.target.value)}
              className="text-sm bg-transparent focus:outline-none"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>v{v.number} · {v.name} {v.status === "active" ? "(activa)" : ""}</option>
              ))}
            </select>
          </div>
          <button onClick={() => void loadBoard(activeVersion)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900">
            <RefreshCw size={14} /> Refrescar
          </button>
        </div>
      </header>

      {currentVersion && (
        <div className="text-xs text-neutral-500 flex items-center gap-2">
          <span>Versión <b>v{currentVersion.number}</b></span>
          <span>·</span>
          <span>{currentVersion.sprint_count} sprint(s)</span>
          <span>·</span>
          <span>{currentVersion.file_count} archivo(s)</span>
        </div>
      )}

      {loading ? (
        <div className="min-h-[40vh] grid place-items-center"><Spinner /></div>
      ) : !board || board.sprints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
          <Sparkles className="mx-auto text-brand mb-2" size={28} />
          <p className="font-medium">Esta versión no tiene sprints planificados</p>
          <p className="text-sm text-neutral-500 mt-1 mb-4">El PO Agent puede agrupar las tareas en sprints incrementales.</p>
          <button onClick={() => void plan()} disabled={planning} className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">
            {planning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Planificar sprints con IA
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {board.sprints.map((sp) => (
            <SprintLane key={sp.id} sprint={sp} onMove={moveStory} onAdd={addStory} onRemove={removeStory} />
          ))}
          {board.unassigned.length > 0 && (
            <SprintLane
              sprint={{ id: "", number: 0, name: "Sin asignar a sprint", stories: board.unassigned }}
              onMove={moveStory} onAdd={addStory} onRemove={removeStory}
            />
          )}
        </div>
      )}
      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function SprintLane({ sprint, onMove, onAdd, onRemove }: {
  sprint: Sprint;
  onMove: (s: Story, d: -1 | 1) => void;
  onAdd: (sprintId: string | null, title: string) => void;
  onRemove: (s: Story) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            {sprint.number > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-brand/10 text-brand">Sprint {sprint.number}</span>}
            {sprint.name}
            {sprint.status === "active" && <span className="text-[10px] text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={11} /> activo</span>}
          </h3>
          {sprint.goal && <p className="text-xs text-neutral-500 mt-0.5">{sprint.goal}</p>}
        </div>
        <span className="text-xs text-neutral-400 tabular-nums">{sprint.stories.length} tareas</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLS.map((col, colIdx) => {
          const cards = sprint.stories.filter((s) => col.match(s.status));
          return (
            <div key={col.key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/40 p-2.5">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{col.label}</span>
                <span className="text-xs text-neutral-400">{cards.length}</span>
              </div>
              <div className="space-y-2 min-h-[30px]">
                {cards.map((st) => (
                  <div key={st.id} className="group p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${PRI[(st.priority || "").toLowerCase()] || "bg-neutral-400"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-mono text-neutral-500">{st.story_key}</p>
                        <p className="text-sm leading-snug">{st.title}</p>
                        {st.description && <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2">{st.description}</p>}
                      </div>
                      {typeof st.story_points === "number" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand/10 text-brand shrink-0">{st.story_points}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-neutral-100 dark:border-neutral-800/60 opacity-50 group-hover:opacity-100 transition">
                      <button onClick={() => onMove(st, -1)} disabled={colIdx === 0} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-20"><ChevronLeft size={12} /></button>
                      <button onClick={() => onRemove(st)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500"><Trash2 size={11} /></button>
                      <button onClick={() => onMove(st, 1)} disabled={colIdx === 2} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-20"><ChevronRight size={12} /></button>
                    </div>
                  </div>
                ))}
                {col.key === "backlog" && <AddInline onAdd={(t) => onAdd(sprint.id || null, t)} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddInline({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState("");
  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-brand hover:text-brand">
      <Plus size={12} /> Tarea
    </button>
  );
  return (
    <input autoFocus value={t} onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { onAdd(t); setT(""); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
      onBlur={() => { if (t.trim()) onAdd(t); setT(""); setOpen(false); }}
      placeholder="Título + Enter" className="w-full px-2 py-1.5 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950" />
  );
}

function patchStory(b: Board, id: string, patch: Partial<Story>): Board {
  const fix = (arr: Story[]) => arr.map((s) => s.id === id ? { ...s, ...patch } : s);
  return { sprints: b.sprints.map((sp) => ({ ...sp, stories: fix(sp.stories) })), unassigned: fix(b.unassigned) };
}
function dropStory(b: Board, id: string): Board {
  const fil = (arr: Story[]) => arr.filter((s) => s.id !== id);
  return { sprints: b.sprints.map((sp) => ({ ...sp, stories: fil(sp.stories) })), unassigned: fil(b.unassigned) };
}
