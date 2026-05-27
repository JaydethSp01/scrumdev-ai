"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Github,
  Cloud,
  Database,
  Bot,
  Sparkles,
  GitBranch,
  Workflow,
  MessageSquare,
  Globe,
  Shield,
  Zap,
  RefreshCw,
} from "lucide-react";
import { API } from "@/lib/api";

type ServiceStatus = {
  configured?: boolean;
  enabled?: boolean;
  error?: string;
  [k: string]: unknown;
};

type GlobalStatus = {
  vercel: ServiceStatus;
  render: ServiceStatus;
  neon: ServiceStatus;
  jira: ServiceStatus;
  github: ServiceStatus;
  openai: ServiceStatus;
  claude_code: ServiceStatus;
  temporal: ServiceStatus;
  rabbitmq: ServiceStatus;
};

type ProjectStatus = {
  deploy?: { state?: string; vercel_url?: string; github_url?: string };
  db_connected?: boolean;
  env_keys_count?: number;
  pending_decisions?: { id: string; title: string; decision_type: string }[];
};

type Status = "ok" | "warn" | "off";

function statusOf(s: ServiceStatus | undefined): Status {
  if (!s) return "off";
  if (s.error) return "warn";
  if (s.configured === true || s.enabled === true) return "ok";
  return "off";
}

function badge(s: Status): string {
  if (s === "ok") return "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30";
  if (s === "warn") return "bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/30";
  return "bg-neutral-100 dark:bg-neutral-900 text-neutral-500 border-neutral-300 dark:border-neutral-700";
}

function statusIcon(s: Status, size = 12): React.ReactNode {
  if (s === "ok") return <CheckCircle2 size={size} />;
  if (s === "warn") return <AlertTriangle size={size} />;
  return <XCircle size={size} />;
}

function statusLabel(s: Status): string {
  if (s === "ok") return "Activo";
  if (s === "warn") return "Con aviso";
  return "Inactivo";
}

export function IntegrationsPanel({ projectKey }: { projectKey: string }) {
  const [global, setGlobal] = useState<GlobalStatus | null>(null);
  const [project, setProject] = useState<ProjectStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, p] = await Promise.all([
        fetch(`${API}/integrations/status`).then((r) => r.json()),
        fetch(`${API}/projects/${projectKey}/integrations`).then((r) => r.json()),
      ]);
      setGlobal(g);
      setProject(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full bg-brand/10 text-brand">
            <Sparkles size={11} /> Sistema
          </span>
          <h2 className="text-2xl font-semibold tracking-tight mt-2">
            Integraciones
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Estado de cada servicio externo que conecta con tu proyecto.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refrescar
        </button>
      </header>

      {/* AI providers */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-500 mb-2">
          IA · Generación
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <IntegrationCard
            icon={Bot}
            title="Claude Code SDK"
            subtitle="Razonamiento profundo + generación de código"
            status={statusOf(global?.claude_code)}
            details={[
              { label: "Modelo", value: String(global?.claude_code?.model || "—") },
              { label: "Sin API key", value: "Usa plan Pro/Max" },
            ]}
            color="from-brand to-fuchsia-500"
          />
          <IntegrationCard
            icon={Zap}
            title="OpenAI"
            subtitle="Embeddings + vision rápida (híbrido)"
            status={statusOf(global?.openai)}
            details={[
              { label: "Fast", value: String(global?.openai?.model_fast || "—") },
              { label: "Embeddings", value: String(global?.openai?.embedding_model || "—") },
            ]}
            color="from-emerald-500 to-teal-500"
          />
        </div>
      </section>

      {/* Infraestructura del deploy */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-500 mb-2">
          Infraestructura del deploy
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <IntegrationCard
            icon={Cloud}
            title="Vercel"
            subtitle="Deploy primario (frontend + serverless)"
            status={statusOf(global?.vercel)}
            details={[
              { label: "Estado deploy", value: project?.deploy?.state || "—" },
              {
                label: "URL",
                value: project?.deploy?.vercel_url
                  ? project.deploy.vercel_url.replace(/^https?:\/\//, "").slice(0, 30) + "…"
                  : "—",
              },
            ]}
            color="from-neutral-700 to-neutral-900"
            link={project?.deploy?.vercel_url}
          />
          <IntegrationCard
            icon={Cloud}
            title="Render"
            subtitle="Fallback si Vercel agota free tier"
            status={statusOf(global?.render)}
            details={[
              { label: "Activado al fallar Vercel", value: "automático" },
              { label: "Free tier", value: "750h/mes web service" },
            ]}
            color="from-violet-500 to-purple-600"
          />
          <IntegrationCard
            icon={Database}
            title="Postgres (Neon)"
            subtitle="Base de datos de tu app"
            status={
              project?.db_connected
                ? "ok"
                : global?.neon?.configured
                ? "warn"
                : "off"
            }
            details={[
              {
                label: "DB del proyecto",
                value: project?.db_connected ? "Conectada" : "Sin conectar",
              },
              {
                label: "Auto-provisión",
                value: global?.neon?.configured
                  ? `${global?.neon?.projects_count ?? 0} proyectos en cuenta`
                  : "Requiere SCRUMDEV_NEON_API_KEY",
              },
            ]}
            color="from-cyan-500 to-blue-500"
          />
        </div>
      </section>

      {/* Source control & PM */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-500 mb-2">
          Source control y Project Management
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <IntegrationCard
            icon={Github}
            title="GitHub"
            subtitle="Repositorio del código generado"
            status={statusOf(global?.github)}
            details={[
              {
                label: "Repo del proyecto",
                value: project?.deploy?.github_url
                  ? project.deploy.github_url.replace("https://github.com/", "")
                  : "—",
              },
              { label: "Webhooks", value: "Configurables" },
            ]}
            color="from-neutral-700 to-neutral-900"
            link={project?.deploy?.github_url}
          />
          <IntegrationCard
            icon={Workflow}
            title="Jira"
            subtitle="Issue tracking (intercambiable con Asana)"
            status={statusOf(global?.jira)}
            details={[
              { label: "Proyecto", value: String(global?.jira?.project_key || "—") },
              { label: "Webhooks", value: "Configurables" },
            ]}
            color="from-blue-500 to-indigo-600"
          />
        </div>
      </section>

      {/* Workflow + eventos */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-500 mb-2">
          Orquestación y eventos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <IntegrationCard
            icon={GitBranch}
            title="Temporal"
            subtitle="Workflows con retries y signals"
            status={global?.temporal?.enabled ? "ok" : "off"}
            details={[
              { label: "Host", value: String(global?.temporal?.host || "—") },
              { label: "Approval gate", value: "Sí (signal)" },
            ]}
            color="from-amber-500 to-orange-600"
          />
          <IntegrationCard
            icon={MessageSquare}
            title="RabbitMQ"
            subtitle="Event bus AMQP (fallback in-memory)"
            status={global?.rabbitmq?.enabled ? "ok" : "off"}
            details={[
              { label: "Estado", value: global?.rabbitmq?.enabled ? "Activado" : "Modo memoria" },
              { label: "Topic", value: "scrumdev.events" },
            ]}
            color="from-orange-500 to-red-500"
          />
          <IntegrationCard
            icon={Shield}
            title="Approval gate"
            subtitle="Aprobación humana antes de prod"
            status={
              (project?.pending_decisions?.length ?? 0) > 0 ? "warn" : "ok"
            }
            details={[
              {
                label: "Decisiones pendientes",
                value: String(project?.pending_decisions?.length ?? 0),
              },
              { label: "Política", value: "Bloquea deploy a prod" },
            ]}
            color="from-rose-500 to-pink-600"
          />
        </div>
        {(project?.pending_decisions?.length ?? 0) > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-200 mb-2">
              {project!.pending_decisions!.length} decisión(es) esperando tu aprobación
            </p>
            <ul className="space-y-1">
              {project!.pending_decisions!.map((d) => (
                <li key={d.id} className="text-xs text-neutral-700 dark:text-neutral-300">
                  · {d.title} <span className="text-neutral-500">({d.decision_type})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function IntegrationCard({
  icon: Icon,
  title,
  subtitle,
  status,
  details,
  color,
  link,
}: {
  icon: typeof Bot;
  title: string;
  subtitle: string;
  status: Status;
  details: { label: string; value: string }[];
  color: string;
  link?: string;
}) {
  return (
    <div className="relative group rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 hover:border-brand/30 hover:shadow-md transition">
      <div className="flex items-start gap-3">
        <div
          className={`grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br ${color} text-white shrink-0 shadow-md`}
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm truncate">{title}</h4>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border ${badge(
                status
              )}`}
            >
              {statusIcon(status, 10)}
              {statusLabel(status)}
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">
            {subtitle}
          </p>
        </div>
      </div>

      <dl className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-900 space-y-1.5">
        {details.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-2 text-xs">
            <dt className="text-neutral-500">{d.label}</dt>
            <dd className="font-medium text-neutral-800 dark:text-neutral-200 truncate max-w-[60%] text-right">
              {d.value}
            </dd>
          </div>
        ))}
      </dl>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 rounded-2xl"
          aria-label={`Abrir ${title}`}
        />
      )}
    </div>
  );
}

export default IntegrationsPanel;
