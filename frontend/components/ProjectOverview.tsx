"use client";

import { useEffect, useState } from "react";
import {
  Home,
  Rocket,
  ListChecks,
  Code2,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Clock,
  GitBranch,
  Sparkles,
} from "lucide-react";
import {
  apiGetBacklog,
  apiGetCode,
  apiGetVision,
  apiListBuilds,
  type BuildRecord,
} from "@/lib/api";
import Spinner from "@/components/Spinner";
import PrettyMarkdown from "@/components/PrettyMarkdown";

type Props = {
  projectKey: string;
  projectName: string;
  onOpenBuild: () => void;
  onGoTo: (tab: string) => void;
  refreshKey?: number;
};

type Overview = {
  stories: number;
  files: number;
  builds: BuildRecord[];
  hasVision: boolean;
};

export function ProjectOverview({
  projectKey,
  projectName,
  onOpenBuild,
  onGoTo,
  refreshKey,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([
      apiGetBacklog(projectKey),
      apiGetCode(projectKey),
      apiListBuilds(projectKey, 5),
      apiGetVision(projectKey),
    ]).then(([backlog, code, builds, vision]) => {
      if (!active) return;
      setData({
        stories: backlog.status === "fulfilled" ? backlog.value.length : 0,
        files: code.status === "fulfilled" ? code.value.length : 0,
        builds: builds.status === "fulfilled" ? builds.value : [],
        hasVision: vision.status === "fulfilled" && !!vision.value,
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [projectKey, refreshKey]);

  if (loading || !data) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Spinner />
      </div>
    );
  }

  const lastBuild = data.builds[0];
  const stage = (lastBuild?.stage || "").toLowerCase();
  const neverBuilt = !lastBuild;

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <Home size={18} className="text-brand" />
          <h2 className="text-lg font-semibold tracking-tight">Resumen del proyecto</h2>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Estado actual de {projectName} y acciones rapidas.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={ListChecks}
          label="Historias"
          value={data.stories}
          tone="brand"
          onClick={() => onGoTo("backlog")}
        />
        <MetricCard
          icon={Code2}
          label="Archivos"
          value={data.files}
          tone="brand"
          onClick={() => onGoTo("code")}
        />
        <MetricCard
          icon={GitBranch}
          label="Builds"
          value={data.builds.length}
          tone="default"
        />
        <MetricCard
          icon={
            stage === "completed"
              ? CheckCircle2
              : stage === "failed"
              ? AlertTriangle
              : stage === "running" || stage === "queued"
              ? Loader2
              : Sparkles
          }
          label="Ultimo build"
          value={neverBuilt ? "n/a" : stage}
          tone={
            stage === "completed"
              ? "green"
              : stage === "failed"
              ? "red"
              : stage === "running" || stage === "queued"
              ? "amber"
              : "default"
          }
          spin={stage === "running" || stage === "queued"}
        />
      </div>

      {neverBuilt ? (
        <div className="rounded-2xl border border-dashed border-brand/40 bg-brand/5 p-6 sm:p-8 text-center">
          <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow">
            <Rocket size={22} />
          </div>
          <h3 className="text-xl font-semibold tracking-tight mt-4">
            Inicia el ciclo de vida del producto
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 max-w-md mx-auto">
            Los agentes recorren el ciclo Scrum (backlog → arquitectura → código →
            release) <b>fase por fase</b>, y se <b>detienen para que tú (Product Owner)
            apruebes</b> cada punto clave. No se genera código sin tu visto bueno de la
            arquitectura.
          </p>
          {!data.hasVision && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> Recomendado: define una vision antes de iniciar.
            </p>
          )}
          <button
            onClick={onOpenBuild}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-dark transition font-medium shadow-sm"
          >
            <Rocket size={16} /> Iniciar ciclo de vida (con aprobaciones)
          </button>
        </div>
      ) : (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Historial de builds
          </h3>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            {data.builds.map((b, i) => (
              <BuildRow key={b.build_id || b.id || i} build={b} />
            ))}
          </ul>
        </section>
      )}

      {lastBuild?.summary && stage === "completed" && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Ultimo resultado
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SummaryTile
              icon={ListChecks}
              label="Historias en backlog"
              value={lastBuild.summary.backlog_count ?? 0}
            />
            <SummaryTile
              icon={Code2}
              label="Archivos generados"
              value={lastBuild.summary.code_files_generated ?? 0}
            />
            <SummaryTile
              icon={Layers}
              label="Historias con codigo"
              value={lastBuild.summary.stories_coded?.length ?? 0}
            />
          </div>
          {lastBuild.summary.architecture_preview && (
            <div className="mt-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 overflow-hidden">
              <p className="text-xs uppercase tracking-wider text-neutral-500 px-4 pt-3">
                Preview de arquitectura
              </p>
              <div className="px-4 pb-3 max-h-96 overflow-y-auto">
                <PrettyMarkdown>
                  {lastBuild.summary.architecture_preview}
                </PrettyMarkdown>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "default",
  onClick,
  spin,
}: {
  icon: typeof ListChecks;
  label: string;
  value: string | number;
  tone?: "default" | "brand" | "green" | "amber" | "red";
  onClick?: () => void;
  spin?: boolean;
}) {
  const tones: Record<string, string> = {
    default:
      "from-neutral-100 to-neutral-50 dark:from-neutral-900 dark:to-neutral-900/50 text-neutral-700 dark:text-neutral-300",
    brand: "from-brand/20 to-brand/5 text-brand",
    green: "from-green-500/20 to-green-500/5 text-green-700 dark:text-green-300",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-700 dark:text-amber-300",
    red: "from-red-500/20 to-red-500/5 text-red-700 dark:text-red-300",
  };
  const Comp: "button" | "div" = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`text-left rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-gradient-to-br ${tones[tone]} ${
        onClick ? "hover:shadow-md hover:border-brand/40 transition cursor-pointer" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className={spin ? "animate-spin" : ""} />
        <span className="text-[11px] uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums mt-2 capitalize">{value}</p>
    </Comp>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-950">
      <div className="flex items-center gap-2 text-neutral-500">
        <Icon size={14} />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums mt-1.5">{value}</p>
    </div>
  );
}

function BuildRow({ build }: { build: BuildRecord }) {
  const stage = (build.stage || "").toLowerCase();
  const tone =
    stage === "completed"
      ? "bg-green-500/15 text-green-700 dark:text-green-300"
      : stage === "failed"
      ? "bg-red-500/15 text-red-700 dark:text-red-300"
      : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  const ts = build.created_at || build.completed_at || build.started_at;
  const dur =
    typeof build.duration_ms === "number"
      ? `${(build.duration_ms / 1000).toFixed(1)}s`
      : build.started_at && build.completed_at
      ? `${(
          (new Date(build.completed_at).getTime() -
            new Date(build.started_at).getTime()) /
          1000
        ).toFixed(1)}s`
      : null;
  return (
    <li className="p-3 flex items-center gap-3 text-sm">
      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${tone}`}>
        {stage || "n/a"}
      </span>
      <span className="font-mono text-xs text-neutral-500 truncate">
        {build.build_id || build.id || "(sin id)"}
      </span>
      {build.stack && (
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
          {build.stack}
        </span>
      )}
      <span className="ml-auto text-xs text-neutral-500 inline-flex items-center gap-1">
        <Clock size={11} /> {ts ? new Date(ts).toLocaleString() : "-"}
        {dur && <span className="ml-1">- {dur}</span>}
      </span>
    </li>
  );
}

export default ProjectOverview;
