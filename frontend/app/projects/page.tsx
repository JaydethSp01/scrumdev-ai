"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  FolderPlus,
  Plus,
  Calendar,
  ArrowRight,
  Sparkles,
  Rocket,
  Code2,
  ListChecks,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/app/auth/_lib";
import { listProjects, createProject, deleteProject, type Project } from "@/lib/projects";
import { apiGetBacklog, apiGetCode, apiListBuilds, apiSaveVision, apiGetPipeline, type BuildRecord } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import Spinner from "@/components/Spinner";
import ProjectCreateWizard from "@/components/ProjectCreateWizard";
import CreateModeModal from "@/components/CreateModeModal";
import OnboardingHero from "@/components/OnboardingHero";

type ProjectMetrics = {
  stories?: number;
  files?: number;
  lastBuild?: BuildRecord;
  // estado del ciclo de vida (Taller 4): en qué fase va y si espera al PO
  phaseState?: string;
  phaseIdx?: number;
  phaseTotal?: number;
  isGate?: boolean;
  loading: boolean;
};

// Cómo se lee cada fase para el PO (el card dice EN QUÉ VA la conversación).
const PHASE_HUMAN: Record<string, string> = {
  BACKLOG: "Generando el backlog…",
  REFINEMENT: "Tu aprobación: Product Backlog",
  NFR_CAPTURE: "Tu aprobación: requisitos NFR",
  ARCHITECTURE_INCEPTION: "Diseñando arquitectura…",
  ARCHITECTURE_APPROVAL_PENDING: "Tu aprobación: arquitectura",
  READY_FOR_DEVELOPMENT: "Planificando sprints…",
  DEVELOPMENT: "Desarrollando el sprint…",
  CODE_REVIEW: "Revisión de código…",
  QA: "Ejecutando pruebas…",
  PO_REVIEW: "Tu aprobación: Sprint Review",
  RELEASE_APPROVAL_PENDING: "Tu aprobación: release",
  STAGING_DEPLOYMENT: "Desplegando a staging…",
  PRODUCTION_DEPLOYMENT: "Tu aprobación: producción",
  RELEASED: "Publicado",
};

export default function ProjectsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, ready } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [metrics, setMetrics] = useState<Record<string, ProjectMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ vision?: string; targetUsers?: string; name?: string } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (ready && !user) {
      router.replace("/login");
    }
  }, [ready, user, router]);

  useEffect(() => {
    if (search.get("welcome") === "1") {
      setShowWelcome(true);
    }
  }, [search]);

  const load = useCallback(
    async (force = false) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const list = await listProjects(user.user_id, force);
        setProjects(list);
        loadMetrics(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  function loadMetrics(list: Project[]) {
    const initial: Record<string, ProjectMetrics> = {};
    for (const p of list) initial[p.key] = { loading: true };
    setMetrics(initial);
    list.forEach((p) => {
      Promise.allSettled([
        apiGetBacklog(p.key),
        apiGetCode(p.key),
        apiListBuilds(p.key, 1),
        apiGetPipeline(p.key),
      ]).then(([backlog, code, builds, pipe]) => {
        const pv = pipe.status === "fulfilled"
          ? (pipe.value as { current_state?: string; current_index?: number; total?: number; is_gate?: boolean })
          : null;
        setMetrics((prev) => ({
          ...prev,
          [p.key]: {
            loading: false,
            stories:
              backlog.status === "fulfilled" ? backlog.value.length : undefined,
            files: code.status === "fulfilled" ? code.value.length : undefined,
            lastBuild:
              builds.status === "fulfilled" && builds.value.length > 0
                ? builds.value[0]
                : undefined,
            phaseState: pv?.current_state,
            phaseIdx: pv?.current_index,
            phaseTotal: pv?.total,
            isGate: pv?.is_gate,
          },
        }));
      });
    });
  }

  useEffect(() => {
    if (ready && user) load(true);
  }, [ready, user, load]);

  if (!ready || !user) {
    return (
      <main className="min-h-[60vh] grid place-items-center">
        <Spinner />
      </main>
    );
  }

  // ¿algún proyecto espera la decisión del PO? (lo más importante de la pantalla)
  const pendingApprovals = Object.values(metrics).filter((m) => m.isGate).length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {showWelcome && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-brand/30 bg-gradient-to-r from-brand/10 via-fuchsia-500/5 to-transparent">
          <span className="grid place-items-center w-10 h-10 rounded-lg bg-gradient-to-br from-brand to-fuchsia-500 text-white shrink-0 shadow-lg shadow-brand/30">
            <Sparkles size={18} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">
              Bienvenido a ScrumDev AI, {user.name}
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
              Crea tu primer proyecto para empezar a generar sistemas con agentes IA.
            </p>
          </div>
          <button
            onClick={() => setShowWelcome(false)}
            className="p-1.5 rounded hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Hero header con stats globales */}
      <section className="relative overflow-hidden rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-brand/8 via-fuchsia-500/4 to-cyan-500/6 dark:from-brand/15 dark:via-fuchsia-500/8 dark:to-cyan-500/10 p-6 sm:p-8 mb-7">
        <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 text-brand backdrop-blur">
              <Sparkles size={11} /> Workspace
            </span>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
              Mis proyectos
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-lg">
              Cada proyecto es una conversación con tu equipo de agentes: tú
              (Product Owner) escribes los requerimientos y apruebas cada fase
              del ciclo — backlog, arquitectura, sprints y release.
            </p>
            {pendingApprovals > 0 && (
              <span className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                <AlertTriangle size={11} /> {pendingApprovals} proyecto{pendingApprovals > 1 ? "s" : ""} esperando tu aprobación
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-950/70 backdrop-blur hover:bg-white dark:hover:bg-neutral-900 transition"
            >
              <RefreshCw size={14} /> Refrescar
            </button>
            <button
              onClick={() => setModeOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand to-fuchsia-500 text-white rounded-xl hover:opacity-95 transition font-semibold shadow-lg shadow-brand/30"
            >
              <Plus size={16} /> Nuevo proyecto
            </button>
          </div>
        </div>

      </section>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-sm">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="min-h-[40vh] grid place-items-center">
          <Spinner />
        </div>
      ) : projects.length === 0 ? (
        <OnboardingHero
          userName={user.name}
          onStart={() => setModeOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.key}
              project={p}
              metrics={metrics[p.key] || { loading: true }}
              onDeleted={() =>
                setProjects((prev) => prev.filter((x) => x.key !== p.key))
              }
            />
          ))}
        </div>
      )}

      <CreateModeModal
        open={modeOpen}
        onClose={() => setModeOpen(false)}
        onReady={async (r) => {
          // Tras la recolección de datos -> crear el proyecto con esa visión y
          // llevar DIRECTO a la galería de plantillas (just_created=1). El usuario
          // elige una plantilla acorde a lo que pidió, o "desde cero".
          setModeOpen(false);
          if (!user) return;
          try {
            const base =
              (r.name || "Proyecto").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12) ||
              "PROYECTO";
            const key = base + String(Date.now()).slice(-4);
            const project = await createProject({
              key,
              name: r.name || "Proyecto",
              description: (r.vision || "").slice(0, 80),
              ownerId: user.user_id,
            });
            await apiSaveVision({
              project_key: project.key,
              vision: r.vision || "",
              target_users: r.targetUsers,
            }).catch(() => {});
            setProjects((prev) =>
              prev.find((x) => x.key === project.key) ? prev : [...prev, project]
            );
            const pick = r.templateId
              ? `&pick=${encodeURIComponent(r.templateId)}`
              : r.fromScratch
              ? "&pick=scratch"
              : "";
            router.push(`/projects/${encodeURIComponent(project.key)}?just_created=1${pick}`);
          } catch {
            // si algo falla, caer al wizard manual con los datos prellenados
            setPrefill(r);
            setWizardOpen(true);
          }
        }}
      />

      <ProjectCreateWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setPrefill(null); }}
        user={user}
        prefill={prefill}
        onCreated={(p) => {
          setProjects((prev) => (prev.find((x) => x.key === p.key) ? prev : [...prev, p]));
        }}
      />
    </main>
  );
}

function ProjectCard({
  project,
  metrics,
  onDeleted,
}: {
  project: Project;
  metrics: ProjectMetrics;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000); // se desarma solo
      return;
    }
    setDeleting(true);
    try {
      await deleteProject(project.key);
      onDeleted();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  // Hash visual basico desde el key para diferenciar cards
  const hue = Math.abs(
    project.key.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  ) % 360;

  return (
    <Link
      href={`/projects/${encodeURIComponent(project.key)}`}
      className="group relative overflow-hidden border border-neutral-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-950 hover:border-brand/40 hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
    >
      {/* Top color stripe basado en hue del key */}
      <div
        className="h-1.5"
        style={{
          background: `linear-gradient(90deg, hsl(${hue},75%,55%), hsl(${(hue + 60) % 360},75%,60%))`,
        }}
      />
      {/* Hover glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand/0 via-transparent to-fuchsia-500/0 group-hover:from-brand/5 group-hover:to-fuchsia-500/5 transition-all duration-300 pointer-events-none" />

      <div className="relative p-5 flex flex-col flex-1">
        <div className="flex items-start gap-3">
          <div
            className="grid place-items-center w-12 h-12 rounded-xl text-white shrink-0 shadow-md"
            style={{
              background: `linear-gradient(135deg, hsl(${hue},75%,55%), hsl(${(hue + 60) % 360},75%,55%))`,
            }}
          >
            <Sparkles size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold tracking-tight truncate text-base">
              {project.name}
            </h3>
            <p className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 mt-0.5">
              {project.key}
            </p>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title={confirming ? "Clic de nuevo para confirmar" : "Eliminar proyecto"}
            className={`shrink-0 p-2 rounded-lg transition text-xs font-medium ${
              confirming
                ? "bg-red-600 text-white"
                : "text-neutral-400 hover:text-red-600 hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
            }`}
          >
            {deleting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : confirming ? (
              "¿Eliminar?"
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-3 line-clamp-2 min-h-[2.5rem]">
          {project.description ||
            "Aún sin requerimientos — entra y cuéntale al equipo qué quieres construir."}
        </p>

        {/* Estado del CICLO (Taller 4): en qué fase va la conversación */}
        <div className="mt-3">
          {metrics.loading ? (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Loader2 size={12} className="animate-spin" /> consultando estado…
            </div>
          ) : metrics.phaseState ? (
            <>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  metrics.isGate
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    : metrics.phaseState === "RELEASED"
                    ? "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30"
                    : "bg-brand/10 text-brand border-brand/20"
                }`}
              >
                {metrics.isGate ? (
                  <AlertTriangle size={11} />
                ) : metrics.phaseState === "RELEASED" ? (
                  <CheckCircle2 size={11} />
                ) : (
                  <Loader2 size={11} className="animate-spin" />
                )}
                {PHASE_HUMAN[metrics.phaseState] || metrics.phaseState}
              </span>
              {typeof metrics.phaseIdx === "number" && metrics.phaseState !== "RELEASED" && (
                <div className="mt-2.5">
                  <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand to-fuchsia-500 transition-all"
                      style={{ width: `${Math.round(((metrics.phaseIdx + 1) / (metrics.phaseTotal || 14)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">
                    fase {metrics.phaseIdx + 1} de {metrics.phaseTotal || 14}
                  </p>
                </div>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-neutral-100 dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-800">
              Listo para tus requerimientos
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1"><ListChecks size={12} /> {metrics.stories ?? 0} historias</span>
          <span className="text-neutral-300 dark:text-neutral-700">·</span>
          <span className="inline-flex items-center gap-1"><Code2 size={12} /> {metrics.files ?? 0} archivos</span>
        </div>

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <span className="text-xs text-neutral-500 inline-flex items-center gap-1.5">
            <Calendar size={11} /> {new Date(project.createdAt).toLocaleDateString()}
          </span>
          <span className="text-sm font-medium text-brand inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            {metrics.isGate ? "Revisar y aprobar" : "Continuar conversación"} <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

