"use client";

/**
 * Diagrama de pipeline interactivo del deploy.
 *
 * Visualiza el flujo: Codigo generado -> Agentes -> Git push -> Vercel build
 * -> Postgres (Neon) -> Live preview. Cada nodo tiene 4 estados:
 *  - pending: gris
 *  - active: pulse brand (cuando es el paso en curso)
 *  - done: verde con check
 *  - failed: rojo con warning
 *
 * Las flechas tienen animacion de "particula" cuando el origen esta done y el
 * destino esta active. Pure SVG + Tailwind, sin dependencias extras.
 */
import {
  Sparkles,
  Bot,
  Github,
  Cloud,
  Database,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Code2,
  type LucideIcon,
} from "lucide-react";

export type NodeStatus = "pending" | "active" | "done" | "failed";

type Node = {
  id: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  status: NodeStatus;
  detail?: string;
};

export type DeployStage =
  | "idle"
  | "generating_code"
  | "pushing_git"
  | "creating_vercel"
  | "building_vercel"
  | "configuring_db"
  | "ready"
  | "error";

type DiagramProps = {
  stage: DeployStage;
  vercelState?: string; // BUILDING, READY, ERROR ...
  githubReady: boolean;
  postgresConfigured: boolean;
  filesCount?: number;
  vercelUrl?: string;
  errorMessage?: string;
  // Render fallback (cuando Vercel se agoto)
  fallbackProvider?: "render" | null;
  renderUrl?: string;
};

function computeStatus(
  step: "code" | "agents" | "git" | "vercel" | "db" | "live",
  props: DiagramProps
): NodeStatus {
  const { stage, vercelState, githubReady, postgresConfigured } = props;
  const v = (vercelState || "").toUpperCase();

  // Caso error de Vercel: respetar lo que sí se completó antes.
  // code/agents/git OK si tenemos esos artefactos; vercel y live failed;
  // postgres es pending si no se configuró.
  if (stage === "error" || v === "ERROR" || v === "FAILED") {
    if (step === "code") return props.filesCount ? "done" : "pending";
    if (step === "agents") return props.filesCount ? "done" : "pending";
    if (step === "git") return githubReady ? "done" : "failed";
    if (step === "vercel") return "failed";
    if (step === "db") return postgresConfigured ? "done" : "pending";
    if (step === "live") return "failed";
  }

  // Caso ready
  if (stage === "ready" || v === "READY") {
    if (step === "code") return "done";
    if (step === "agents") return "done";
    if (step === "git") return githubReady ? "done" : "done";
    if (step === "vercel") return "done";
    if (step === "db") return postgresConfigured ? "done" : "pending";
    if (step === "live") return "done";
  }

  // Caso en progreso (stage activo)
  const order: DeployStage[] = [
    "idle",
    "generating_code",
    "pushing_git",
    "creating_vercel",
    "building_vercel",
    "configuring_db",
    "ready",
  ];
  const stageIdx = order.indexOf(stage);
  const stepStageIdx: Record<string, number> = {
    code: 0,
    agents: 1,
    git: 2,
    vercel: 3,
    db: 4,
    live: 5,
  };
  const stepIdx = stepStageIdx[step];

  if (stepIdx < stageIdx) return "done";
  if (stepIdx === stageIdx) return "active";
  if (step === "git" && githubReady) return "done";
  if (step === "db" && postgresConfigured) return "done";
  return "pending";
}

function nodeClass(status: NodeStatus): string {
  if (status === "done")
    return "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-300";
  if (status === "active")
    return "border-brand/60 bg-brand/10 text-brand animate-pulse";
  if (status === "failed")
    return "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-neutral-300 dark:border-neutral-700 bg-neutral-100/40 dark:bg-neutral-900/40 text-neutral-500 dark:text-neutral-400";
}

function iconNode(status: NodeStatus, Icon: LucideIcon): React.ReactNode {
  if (status === "active") return <Loader2 size={18} className="animate-spin" />;
  if (status === "done") return <CheckCircle2 size={18} />;
  if (status === "failed") return <AlertTriangle size={18} />;
  return <Icon size={18} />;
}

export function DeployFlowDiagram(props: DiagramProps) {
  const codeS = computeStatus("code", props);
  const agentsS = computeStatus("agents", props);
  const gitS = computeStatus("git", props);
  const vercelS = computeStatus("vercel", props);
  const dbS = computeStatus("db", props);
  const liveS = computeStatus("live", props);

  // Sublabel coherente con status (no mezclar estado real con texto inconsistente)
  function sl(status: NodeStatus, done: string, pending: string, failed = "fallo"): string {
    if (status === "done") return done;
    if (status === "failed") return failed;
    if (status === "active") return "en curso";
    return pending;
  }

  const nodes: Node[] = [
    {
      id: "code",
      label: "Codigo",
      sublabel: codeS === "done" && props.filesCount
        ? `${props.filesCount} archivos`
        : sl(codeS, "generado", "pendiente"),
      icon: Code2,
      status: codeS,
      detail: "Output del LLM persistido en BD.",
    },
    {
      id: "agents",
      label: "Agentes IA",
      sublabel: sl(agentsS, "completados", "PO + Arq + Dev"),
      icon: Bot,
      status: agentsS,
      detail: "Crew genera backlog + arquitectura + codigo.",
    },
    {
      id: "git",
      label: "GitHub",
      sublabel: sl(gitS, "push OK", "pendiente", "push fallo"),
      icon: Github,
      status: gitS,
      detail: "Repo creado y archivos pusheados a main.",
    },
    {
      id: "vercel",
      label: props.fallbackProvider === "render" ? "Render" : "Vercel",
      sublabel: props.fallbackProvider === "render"
        ? "fallback activo"
        : sl(
            vercelS,
            (props.vercelState || "READY").toLowerCase(),
            "preparando",
            "build fallo"
          ),
      icon: Cloud,
      status: vercelS,
      detail: props.fallbackProvider === "render"
        ? "Vercel agoto free tier — usando Render Web Service como fallback."
        : "Build de Next.js + functions Python.",
    },
    {
      id: "db",
      label: "Postgres",
      sublabel: sl(dbS, "Neon conectado", "pendiente"),
      icon: Database,
      status: dbS,
      detail: "POSTGRES_URL inyectado en Vercel.",
    },
    {
      id: "live",
      label: "Live",
      sublabel: sl(liveS, "READY", "esperando", "no disponible"),
      icon: Globe,
      status: liveS,
      detail: "URL publica accesible.",
    },
  ];

  // Estado global - badge arriba
  const overall =
    props.stage === "ready"
      ? "ready"
      : props.stage === "error"
      ? "error"
      : "running";

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 overflow-hidden">
      <header className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-fuchsia-500 text-white">
            <Sparkles size={14} />
          </span>
          Pipeline en vivo
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider border ${
            overall === "ready"
              ? "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30"
              : overall === "error"
              ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
              : "bg-brand/15 text-brand border-brand/30"
          }`}
        >
          {overall === "ready" ? (
            <CheckCircle2 size={11} />
          ) : overall === "error" ? (
            <AlertTriangle size={11} />
          ) : (
            <Loader2 size={11} className="animate-spin" />
          )}
          {overall === "ready" ? "Completado" : overall === "error" ? "Error" : "En curso"}
        </span>
      </header>

      {/* Pipeline: scroll horizontal en mobile, grid en md+ */}
      <div className="relative">
        <div className="hidden md:grid grid-cols-[repeat(6,minmax(0,1fr))] gap-3 items-stretch">
          {nodes.map((n, idx) => (
            <NodeWithArrow
              key={n.id}
              node={n}
              isLast={idx === nodes.length - 1}
              nextStatus={idx < nodes.length - 1 ? nodes[idx + 1].status : null}
            />
          ))}
        </div>
        {/* Mobile vertical */}
        <div className="md:hidden flex flex-col gap-2">
          {nodes.map((n, idx) => (
            <NodeRow
              key={n.id}
              node={n}
              isLast={idx === nodes.length - 1}
              nextStatus={idx < nodes.length - 1 ? nodes[idx + 1].status : null}
            />
          ))}
        </div>
      </div>

      {/* Error detalle */}
      {props.errorMessage && (
        <div className="mt-4 p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{props.errorMessage}</span>
        </div>
      )}

      {/* Live URL cuando ready (Vercel o Render) */}
      {(props.vercelUrl || props.renderUrl) && (props.stage === "ready" || props.fallbackProvider === "render") && (
        <div className="mt-4 p-3 rounded-lg border border-green-500/30 bg-green-500/5 flex items-center gap-2 text-sm">
          <Globe size={14} className="text-green-600 dark:text-green-300" />
          <a
            href={props.renderUrl || props.vercelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-700 dark:text-green-300 font-medium underline truncate"
          >
            {props.renderUrl || props.vercelUrl}
          </a>
          {props.fallbackProvider === "render" && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-200 border border-amber-500/30 shrink-0">
              fallback render
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function NodeWithArrow({
  node,
  isLast,
  nextStatus,
}: {
  node: Node;
  isLast: boolean;
  nextStatus: NodeStatus | null;
}) {
  const showFlow =
    node.status === "done" && (nextStatus === "active" || nextStatus === "done");
  return (
    <div className="relative flex flex-col items-center text-center">
      <div
        className={`w-full aspect-[3/4] max-w-[140px] rounded-2xl border-2 grid place-items-center transition-all duration-300 ${nodeClass(
          node.status
        )}`}
        title={node.detail}
      >
        <div className="flex flex-col items-center gap-2 px-2">
          {iconNode(node.status, node.icon)}
          <div>
            <p className="text-[11px] font-semibold leading-tight">{node.label}</p>
            {node.sublabel && (
              <p className="text-[9px] uppercase tracking-wider mt-0.5 opacity-70">
                {node.sublabel}
              </p>
            )}
          </div>
        </div>
      </div>
      {/* Flecha hacia el siguiente */}
      {!isLast && (
        <div className="absolute top-1/2 -right-2 -translate-y-1/2 z-10 hidden md:block">
          <Arrow active={showFlow} />
        </div>
      )}
    </div>
  );
}

function NodeRow({
  node,
  isLast,
  nextStatus,
}: {
  node: Node;
  isLast: boolean;
  nextStatus: NodeStatus | null;
}) {
  const showFlow =
    node.status === "done" && (nextStatus === "active" || nextStatus === "done");
  return (
    <>
      <div
        className={`flex items-center gap-3 p-3 rounded-xl border-2 ${nodeClass(
          node.status
        )}`}
      >
        <div className="shrink-0">{iconNode(node.status, node.icon)}</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{node.label}</p>
          {node.sublabel && (
            <p className="text-[10px] uppercase tracking-wider mt-0.5 opacity-70">
              {node.sublabel}
            </p>
          )}
        </div>
      </div>
      {!isLast && (
        <div className="flex justify-center">
          <Arrow active={showFlow} vertical />
        </div>
      )}
    </>
  );
}

function Arrow({ active, vertical = false }: { active: boolean; vertical?: boolean }) {
  const w = vertical ? 12 : 24;
  const h = vertical ? 24 : 12;
  return (
    <svg
      width={w}
      height={h}
      viewBox={vertical ? "0 0 12 24" : "0 0 24 12"}
      className={active ? "text-brand" : "text-neutral-300 dark:text-neutral-700"}
    >
      <defs>
        <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {vertical ? (
        <>
          <line x1="6" y1="0" x2="6" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {active && (
            <circle r="2" fill="currentColor">
              <animate attributeName="cy" from="0" to="24" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" />
            </circle>
          )}
        </>
      ) : (
        <>
          <line x1="0" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {active && (
            <circle r="2" fill="currentColor">
              <animate attributeName="cx" from="0" to="24" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" />
            </circle>
          )}
        </>
      )}
    </svg>
  );
}

export default DeployFlowDiagram;
