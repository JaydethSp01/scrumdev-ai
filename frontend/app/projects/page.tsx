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
} from "lucide-react";
import { useAuth } from "@/app/auth/_lib";
import { listProjects, type Project } from "@/lib/projects";
import { apiGetBacklog, apiGetCode, apiListBuilds, type BuildRecord } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import Spinner from "@/components/Spinner";
import ProjectCreateWizard from "@/components/ProjectCreateWizard";
import OnboardingHero from "@/components/OnboardingHero";

type ProjectMetrics = {
  stories?: number;
  files?: number;
  lastBuild?: BuildRecord;
  loading: boolean;
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
      ]).then(([backlog, code, builds]) => {
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

  const totalStories = Object.values(metrics).reduce(
    (acc, m) => acc + (m.stories ?? 0),
    0
  );
  const totalFiles = Object.values(metrics).reduce(
    (acc, m) => acc + (m.files ?? 0),
    0
  );

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
              Cada proyecto agrupa vision, identidad visual, backlog, codigo
              generado y deploy. Crea o abre uno para continuar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-950/70 backdrop-blur hover:bg-white dark:hover:bg-neutral-900 transition"
            >
              <RefreshCw size={14} /> Refrescar
            </button>
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand to-fuchsia-500 text-white rounded-xl hover:opacity-95 transition font-semibold shadow-lg shadow-brand/30"
            >
              <Plus size={16} /> Nuevo proyecto
            </button>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="relative mt-6 grid grid-cols-3 gap-3 max-w-xl">
            <HeroStat icon={<Rocket size={14} />} label="proyectos" value={projects.length} />
            <HeroStat icon={<ListChecks size={14} />} label="historias" value={totalStories} />
            <HeroStat icon={<Code2 size={14} />} label="archivos" value={totalFiles} />
          </div>
        )}
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
          onStart={() => setWizardOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.key}
              project={p}
              metrics={metrics[p.key] || { loading: true }}
            />
          ))}
        </div>
      )}

      <ProjectCreateWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        user={user}
        onCreated={(p) => {
          setProjects((prev) => (prev.find((x) => x.key === p.key) ? prev : [...prev, p]));
        }}
      />
    </main>
  );
}

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-white/40 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        <span className="text-brand">{icon}</span> {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  metrics,
}: {
  project: Project;
  metrics: ProjectMetrics;
}) {
  const build = metrics.lastBuild;
  const stage = (build?.stage || "").toLowerCase();
  const progress = build?.progress_percent;

  const buildTone =
    stage === "completed"
      ? "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30"
      : stage === "failed"
      ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
      : stage === "running" || stage === "queued"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-neutral-300 dark:border-neutral-700";

  const buildIcon =
    stage === "completed" ? (
      <CheckCircle2 size={11} />
    ) : stage === "failed" ? (
      <AlertTriangle size={11} />
    ) : stage === "running" || stage === "queued" ? (
      <Loader2 size={11} className="animate-spin" />
    ) : null;

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
          {build && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] uppercase tracking-wider border whitespace-nowrap ${buildTone}`}
            >
              {buildIcon}
              {humanStageShort(stage)}
            </span>
          )}
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-3 line-clamp-2 min-h-[2.5rem]">
          {project.description || "Sin descripcion"}
        </p>

        {typeof progress === "number" && stage !== "completed" && (
          <div className="mt-3">
            <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand to-fuchsia-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">
              Build {progress}%
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric
            icon={ListChecks}
            label="historias"
            value={metrics.stories}
            loading={metrics.loading}
          />
          <Metric
            icon={Code2}
            label="archivos"
            value={metrics.files}
            loading={metrics.loading}
          />
        </div>

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <span className="text-xs text-neutral-500 inline-flex items-center gap-1.5">
            <Calendar size={11} /> {new Date(project.createdAt).toLocaleDateString()}
          </span>
          <span className="text-sm font-medium text-brand inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            Abrir <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function humanStageShort(stage: string): string {
  switch (stage) {
    case "completed":
      return "Completado";
    case "failed":
      return "Fallido";
    case "running":
    case "vision":
    case "backlog":
    case "architecture":
    case "coding":
      return "Generando";
    case "queued":
      return "En cola";
    default:
      return stage ? stage : "Pendiente";
  }
}

function Metric({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof ListChecks;
  label: string;
  value?: number;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
      <Icon size={13} className="text-neutral-400 shrink-0" />
      <div className="flex flex-col leading-tight min-w-0">
        {loading ? (
          <Loader2 size={11} className="animate-spin text-neutral-400" />
        ) : (
          <span className="font-semibold text-sm tabular-nums text-neutral-800 dark:text-neutral-200">
            {value ?? 0}
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      </div>
    </div>
  );
}
