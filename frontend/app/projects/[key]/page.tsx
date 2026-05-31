"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  ChevronRight,
  Home,
  Compass,
  ListTodo,
  Code2,
  Rocket,
  ListChecks,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
  RefreshCw,
  Palette,
  Plug,
  Layers,
  Workflow,
  SlidersHorizontal,
  Building2,
  Bot,
  Gavel,
} from "lucide-react";
import { useAuth } from "@/app/auth/_lib";
import { getProject, type Project } from "@/lib/projects";
import {
  apiGetBacklog,
  apiGetCode,
  apiGetProjectState,
  apiListBuilds,
  apiSmartBuild,
  apiGetBrandKit,
  apiListAssets,
  type BuildRecord,
  type ProjectState,
} from "@/lib/api";
import ProjectChat from "@/components/ProjectChat";
import Spinner from "@/components/Spinner";
import ProjectOverview from "@/components/ProjectOverview";
import VisionForm from "@/components/VisionForm";
import BoardsPanel from "@/components/BoardsPanel";
import CodeBrowser from "@/components/CodeBrowser";
import DeployPanel from "@/components/DeployPanel";
import IntegrationsPanel from "@/components/IntegrationsPanel";
import PipelinePanel from "@/components/PipelinePanel";
import VersionsPanel from "@/components/VersionsPanel";
import ArchitecturePanel from "@/components/ArchitecturePanel";
import DecisionsPanel from "@/components/DecisionsPanel";
import AgentsPanel from "@/components/AgentsPanel";
import WorkflowsPanel from "@/components/WorkflowsPanel";
import NFRForm from "@/components/NFRForm";
import AuditLog from "@/components/AuditLog";
import PersonalizationPanel from "@/components/PersonalizationPanel";
import BuildProgressToast, {
  fireBuildStarted,
} from "@/components/BuildProgressToast";
import { ToastStack, useToasts } from "@/components/Toast";

type Tab =
  | "overview"
  | "pipeline"
  | "vision"
  | "nfr"
  | "architecture"
  | "personalization"
  | "versions"
  | "boards"
  | "agents"
  | "decisions"
  | "code"
  | "deploy"
  | "integrations"
  | "chat";

type TabDef = {
  value: Tab;
  label: string;
  icon: typeof Home;
  description: string;
};

const TABS: TabDef[] = [
  {
    value: "overview",
    label: "Overview",
    icon: Home,
    description: "Estado del proyecto y atajos para generar el sistema.",
  },
  {
    value: "pipeline",
    label: "Pipeline",
    icon: Workflow,
    description: "Las 14 fases del ciclo de vida con aprobaciones humanas.",
  },
  {
    value: "vision",
    label: "Vision",
    icon: Compass,
    description: "Describe que vas a construir y para quien.",
  },
  {
    value: "nfr",
    label: "Requisitos NFR",
    icon: SlidersHorizontal,
    description: "Captura requisitos no funcionales: performance, escala, seguridad, deploy.",
  },
  {
    value: "architecture",
    label: "Arquitectura",
    icon: Building2,
    description: "Propuesta de arquitectura del Architect Agent + ADR + validacion de politicas.",
  },
  {
    value: "personalization",
    label: "Personalizacion",
    icon: Palette,
    description:
      "Define colores, tipografia e imagenes que usaran los agentes al generar el sistema.",
  },
  {
    value: "versions",
    label: "Versiones",
    icon: GitBranch,
    description:
      "Ciclo de vida: cada versión agrupa sprints; una versión nueva parte del código de la anterior.",
  },
  {
    value: "boards",
    label: "Boards",
    icon: Layers,
    description: "Tablero ágil por versión y sprint: crea, mueve y gestiona tareas (estilo Azure DevOps).",
  },
  {
    value: "agents",
    label: "Agentes",
    icon: Bot,
    description: "Los 10 agentes del equipo y el historial de ejecuciones de workflows.",
  },
  {
    value: "decisions",
    label: "Decisiones",
    icon: Gavel,
    description: "Aprobaciones humanas pendientes (gates) y bitacora de auditoria.",
  },
  {
    value: "code",
    label: "Codigo",
    icon: Code2,
    description: "Archivos generados, organizados por carpeta.",
  },
  {
    value: "deploy",
    label: "Despliegue",
    icon: Rocket,
    description: "Publica tu sistema en GitHub y Vercel.",
  },
  {
    value: "integrations",
    label: "Integraciones",
    icon: Plug,
    description: "Estado de servicios externos: IA, DB, GitHub, Jira, deploy.",
  },
  {
    value: "chat",
    label: "Chat IA",
    icon: MessageSquare,
    description: "Conversa con los agentes en lenguaje natural.",
  },
];

type SmartButton = {
  label: string;
  icon: typeof Rocket;
  variant: "primary" | "success" | "danger" | "muted";
  disabled?: boolean;
  onClick: () => void;
  hint?: string;
};

export default function ProjectDetailPage() {
  const params = useParams<{ key: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { user, ready } = useAuth();
  const projectKey = useMemo(
    () => decodeURIComponent(params?.key ?? ""),
    [params]
  );
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  // permitir abrir un tab directo via ?tab=boards (deep-link)
  useEffect(() => {
    const t = search.get("tab");
    if (t && TABS.some((d) => d.value === t)) setTab(t as Tab);
  }, [search]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    stories: number;
    files: number;
    builds: number;
    lastBuild?: BuildRecord;
  }>({ stories: 0, files: 0, builds: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [showJustCreated, setShowJustCreated] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<ProjectState | null>(null);
  const [stateLoading, setStateLoading] = useState(true);
  const [smartLoading, setSmartLoading] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [personalization, setPersonalization] = useState<{
    brandExists: boolean;
    colorsCount: number;
    assetsCount: number;
  }>({ brandExists: false, colorsCount: 0, assetsCount: 0 });
  const [personalizationLoading, setPersonalizationLoading] = useState(true);
  const toasts = useToasts();

  useEffect(() => {
    if (ready && !user) {
      router.replace("/login");
    }
  }, [ready, user, router]);

  useEffect(() => {
    if (search.get("just_created") === "1") {
      setShowJustCreated(true);
    }
  }, [search]);

  useEffect(() => {
    if (!projectKey || !ready || !user) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const p = await getProject(projectKey);
        if (!active) return;
        if (!p) {
          setNotFound(true);
        } else {
          setProject(p);
          setNotFound(false);
        }
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectKey, ready, user]);

  const loadStats = useCallback(async () => {
    if (!projectKey) return;
    setStatsLoading(true);
    try {
      const [backlog, code, builds] = await Promise.allSettled([
        apiGetBacklog(projectKey),
        apiGetCode(projectKey),
        apiListBuilds(projectKey, 10),
      ]);
      setStats({
        stories: backlog.status === "fulfilled" ? backlog.value.length : 0,
        files: code.status === "fulfilled" ? code.value.length : 0,
        builds: builds.status === "fulfilled" ? builds.value.length : 0,
        lastBuild:
          builds.status === "fulfilled" && builds.value.length > 0
            ? builds.value[0]
            : undefined,
      });
    } finally {
      setStatsLoading(false);
    }
  }, [projectKey]);

  const loadState = useCallback(async () => {
    if (!projectKey) return;
    setStateLoading(true);
    try {
      const s = await apiGetProjectState(projectKey);
      setState(s);
    } catch {
      setState(null);
    } finally {
      setStateLoading(false);
    }
  }, [projectKey]);

  const loadPersonalization = useCallback(async () => {
    if (!projectKey) return;
    setPersonalizationLoading(true);
    try {
      const [brand, assets] = await Promise.allSettled([
        apiGetBrandKit(projectKey),
        apiListAssets(projectKey),
      ]);
      const brandExists =
        brand.status === "fulfilled" ? !!brand.value.exists : false;
      const colorsCount =
        brand.status === "fulfilled"
          ? [
              brand.value.primary_color,
              brand.value.secondary_color,
              brand.value.accent_color,
              brand.value.background_color,
              brand.value.text_color,
            ].filter((c) => !!c).length
          : 0;
      const assetsCount =
        assets.status === "fulfilled" ? assets.value.length : 0;
      setPersonalization({ brandExists, colorsCount, assetsCount });
    } finally {
      setPersonalizationLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    if (project) {
      loadStats();
      loadState();
      loadPersonalization();
    }
  }, [project, loadStats, loadState, loadPersonalization, refreshKey, tab]);

  function onBuildCompleted(b: BuildRecord) {
    const summary = b.summary;
    if (summary) {
      toasts.success(
        `Sistema generado: ${summary.code_files_generated ?? 0} archivos, ${
          summary.stories_coded?.length ?? 0
        } historias.`
      );
    } else {
      toasts.success("Build completado.");
    }
    setRefreshKey((k) => k + 1);
  }

  const runSmartBuild = useCallback(
    async (force = false) => {
      if (!user || !project) return;
      setSmartLoading(true);
      try {
        const res = await apiSmartBuild(project.key, {
          triggered_by: user.user_id,
          force_regenerate: force,
        });
        toasts.success(res.label || "Generacion iniciada.");
        fireBuildStarted(project.key);
        setRefreshKey((k) => k + 1);
      } catch (e) {
        toasts.error(e instanceof Error ? e.message : String(e));
      } finally {
        setSmartLoading(false);
      }
    },
    [user, project, toasts]
  );

  const smartButton: SmartButton | null = useMemo(() => {
    if (!state) return null;
    const action = state.next_action;
    const label = state.next_action_label;
    if (action === "set_vision") {
      return {
        label: label || "Define la vision",
        icon: Compass,
        variant: "muted",
        onClick: () => setTab("vision"),
        hint: "Ve al tab Vision",
      };
    }
    if (action === "generate_backlog") {
      return {
        label: label || "Generar sistema",
        icon: Rocket,
        variant: "primary",
        onClick: () => runSmartBuild(false),
      };
    }
    if (action === "generate_pending_code") {
      const pending = state.stories_pending_count ?? 0;
      return {
        label:
          label ||
          `Completar generacion (${pending} ${
            pending === 1 ? "historia" : "historias"
          })`,
        icon: Sparkles,
        variant: "primary",
        onClick: () => runSmartBuild(false),
      };
    }
    if (action === "ready_to_deploy") {
      return {
        label: label || "Desplegar a Vercel",
        icon: Rocket,
        variant: "success",
        onClick: () => setTab("deploy"),
      };
    }
    if (action === "regenerate") {
      return {
        label: label || "Regenerar todo",
        icon: RefreshCw,
        variant: "danger",
        onClick: () => setConfirmRegenerate(true),
      };
    }
    return {
      label: label || "Generar sistema",
      icon: Rocket,
      variant: "primary",
      onClick: () => runSmartBuild(false),
    };
  }, [state, runSmartBuild]);

  if (!ready || !user || loading) {
    return (
      <main className="min-h-[60vh] grid place-items-center">
        <Spinner />
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-12 text-center">
        <h1 className="text-2xl font-bold">Proyecto no encontrado</h1>
        <p className="text-neutral-500 mt-2">
          La clave <code className="font-mono">{projectKey}</code> no existe o no
          tienes acceso.
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-flex items-center gap-1 text-brand hover:underline"
        >
          Volver a proyectos
        </Link>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="min-h-[60vh] grid place-items-center">
        <Spinner />
      </main>
    );
  }

  const activeTab = TABS.find((t) => t.value === tab)!;
  const stage = (stats.lastBuild?.stage || "").toLowerCase();
  const stageTone =
    stage === "completed"
      ? "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30"
      : stage === "failed"
      ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
      : stage === "running" || stage === "queued"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-neutral-300 dark:border-neutral-700";
  const stageIcon =
    stage === "completed" ? (
      <CheckCircle2 size={11} />
    ) : stage === "failed" ? (
      <AlertTriangle size={11} />
    ) : stage === "running" || stage === "queued" ? (
      <Loader2 size={11} className="animate-spin" />
    ) : null;
  const stageLabel = humanStage(stage);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {showJustCreated && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-xl border border-brand/30 bg-gradient-to-r from-brand/10 to-transparent">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-brand to-brand-dark text-white shrink-0">
            <Sparkles size={16} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Proyecto creado correctamente.</p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
              Define la vision (si aun no lo hiciste) y pulsa el boton de generacion.
            </p>
          </div>
          <button
            onClick={() => setShowJustCreated(false)}
            className="p-1 rounded hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-3">
        <Link href="/projects" className="hover:text-brand">
          Proyectos
        </Link>
        <ChevronRight size={11} />
        <span className="font-mono text-neutral-700 dark:text-neutral-300">
          {project.key}
        </span>
      </div>

      <header className="relative mb-6 overflow-hidden rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-brand/8 via-fuchsia-500/4 to-cyan-500/6 dark:from-brand/15 dark:via-fuchsia-500/8 dark:to-cyan-500/10 p-6 sm:p-8 shadow-sm">
        <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 text-brand backdrop-blur">
              <Sparkles size={11} /> {project.key}
            </span>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 max-w-2xl">
                {project.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-5 flex-wrap">
              <Pill icon={ListChecks} label="historias" value={stats.stories} loading={statsLoading} />
              <Pill icon={Code2} label="archivos" value={stats.files} loading={statsLoading} />
              <Pill icon={GitBranch} label="builds" value={stats.builds} loading={statsLoading} />
              {stats.lastBuild && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] uppercase tracking-wider border ${stageTone}`}
                >
                  {stageIcon}
                  ultimo build: {stageLabel}
                </span>
              )}
            </div>
          </div>
          <SmartButtonGroup
            button={smartButton}
            loading={stateLoading || smartLoading}
            state={state}
            onRegenerate={() => setConfirmRegenerate(true)}
            personalization={personalization}
            personalizationLoading={personalizationLoading}
            onGoToPersonalization={() => setTab("personalization")}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <aside>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 lg:sticky lg:top-20">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap text-left ${
                    active
                      ? "bg-brand/10 text-brand font-medium"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  }`}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </aside>
        <section className="min-w-0">
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <activeTab.icon size={18} className="text-brand" />
              <h2 className="text-base font-semibold tracking-tight">
                {activeTab.label}
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1">{activeTab.description}</p>
          </div>

          {tab === "overview" && (
            <ProjectOverview
              projectKey={project.key}
              projectName={project.name}
              onOpenBuild={() => runSmartBuild(false)}
              onGoTo={(t) => setTab(t as Tab)}
              refreshKey={refreshKey}
            />
          )}
          {tab === "vision" && (
            <VisionForm projectKey={project.key} user={user} />
          )}
          {tab === "nfr" && (
            <NFRForm projectKey={project.key} user={user} />
          )}
          {tab === "architecture" && (
            <ArchitecturePanel projectKey={project.key} />
          )}
          {tab === "personalization" && (
            <PersonalizationPanel projectKey={project.key} user={user} />
          )}
          {tab === "boards" && <BoardsPanel projectKey={project.key} />}
          {tab === "pipeline" && <PipelinePanel projectKey={project.key} />}
          {tab === "versions" && <VersionsPanel projectKey={project.key} />}
          {tab === "agents" && (
            <div className="space-y-6">
              <AgentsPanel />
              <WorkflowsPanel projectKey={project.key} />
            </div>
          )}
          {tab === "decisions" && (
            <div className="space-y-6">
              <DecisionsPanel projectKey={project.key} user={user} />
              <AuditLog projectKey={project.key} />
            </div>
          )}
          {tab === "code" && <CodeBrowser projectKey={project.key} />}
          {tab === "deploy" && (
            <DeployPanel projectKey={project.key} user={user} />
          )}
          {tab === "integrations" && <IntegrationsPanel projectKey={project.key} />}
          {tab === "chat" && <ProjectChat projectKey={project.key} user={user} />}
        </section>
      </div>

      <BuildProgressToast
        projectKey={project.key}
        onCompleted={onBuildCompleted}
        onGoTo={(t) => setTab(t as Tab)}
      />

      {confirmRegenerate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
              <h3 className="font-semibold">Regenerar el sistema</h3>
            </div>
            <div className="p-5 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Esto borra el backlog y el codigo generado, y vuelve a ejecutar
                todo el pipeline desde cero.
              </p>
              <p className="text-xs text-neutral-500 mt-2">
                Tu vision y configuracion no se pierden.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRegenerate(false)}
                className="px-3 py-2 text-sm rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setConfirmRegenerate(false);
                  runSmartBuild(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium"
              >
                <RefreshCw size={14} /> Regenerar
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </main>
  );
}

function humanStage(stage: string): string {
  switch (stage) {
    case "completed":
      return "completado";
    case "failed":
      return "fallido";
    case "running":
      return "ejecutando";
    case "queued":
      return "en cola";
    case "vision":
      return "vision";
    case "backlog":
      return "backlog";
    case "architecture":
      return "arquitectura";
    case "coding":
      return "generando codigo";
    default:
      return stage || "n/a";
  }
}

function SmartButtonGroup({
  button,
  loading,
  state,
  onRegenerate,
  personalization,
  personalizationLoading,
  onGoToPersonalization,
}: {
  button: SmartButton | null;
  loading: boolean;
  state: ProjectState | null;
  onRegenerate: () => void;
  personalization: {
    brandExists: boolean;
    colorsCount: number;
    assetsCount: number;
  };
  personalizationLoading: boolean;
  onGoToPersonalization: () => void;
}) {
  if (loading || !button) {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 px-5 py-3 bg-neutral-200 dark:bg-neutral-800 text-neutral-500 rounded-xl font-medium shrink-0"
      >
        <Loader2 size={16} className="animate-spin" />
        Cargando...
      </button>
    );
  }
  const Icon = button.icon;
  const variants: Record<SmartButton["variant"], string> = {
    primary:
      "bg-gradient-to-br from-brand to-brand-dark text-white hover:shadow-lg hover:shadow-brand/30",
    success:
      "bg-gradient-to-br from-green-600 to-green-700 text-white hover:shadow-lg hover:shadow-green-600/30",
    danger:
      "bg-gradient-to-br from-red-600 to-red-700 text-white hover:shadow-lg hover:shadow-red-600/30",
    muted:
      "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700",
  };
  const showSecondary = state?.next_action === "ready_to_deploy";
  const showPersonalizationIndicator =
    button.variant === "primary" || button.variant === "success";
  const ready =
    personalization.brandExists && personalization.assetsCount > 0;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex flex-col items-end">
        <button
          onClick={button.onClick}
          disabled={button.disabled}
          className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl transition font-medium ${
            variants[button.variant]
          } disabled:opacity-60`}
        >
          <Icon size={16} />
          {button.label}
        </button>
        {button.hint && (
          <span className="text-[11px] text-neutral-500 mt-1">{button.hint}</span>
        )}
        {showPersonalizationIndicator && !personalizationLoading && (
          <div className="mt-1.5">
            {ready ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                <CheckCircle2 size={11} />
                Personalizacion: {personalization.colorsCount} colores +{" "}
                {personalization.assetsCount}{" "}
                {personalization.assetsCount === 1 ? "imagen" : "imagenes"}
              </span>
            ) : (
              <button
                type="button"
                onClick={onGoToPersonalization}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-brand transition underline-offset-2 hover:underline"
              >
                <Palette size={11} />
                Personaliza primero -&gt; tab Personalizacion
              </button>
            )}
          </div>
        )}
      </div>
      {showSecondary && (
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          title="Regenerar"
        >
          <RefreshCw size={14} /> Regenerar
        </button>
      )}
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
      <Icon size={11} className="text-brand" />
      {loading ? (
        <Loader2 size={10} className="animate-spin opacity-60" />
      ) : (
        <span className="font-semibold tabular-nums">{value}</span>
      )}
      <span className="text-neutral-500">{label}</span>
    </span>
  );
}
