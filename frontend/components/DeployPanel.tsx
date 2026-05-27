"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Rocket,
  Github,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cloud,
  Globe,
  Sparkles,
} from "lucide-react";
import {
  API,
  apiDeployProject,
  apiGetDeployPreview,
  apiGetDeployStatus,
  type DeployPreview,
  type DeployResponse,
  type DeployStatus,
} from "@/lib/api";
import DeployFlowDiagram, { type DeployStage } from "@/components/DeployFlowDiagram";
import type { AuthUser } from "@/app/auth/_lib";
import Spinner from "@/components/Spinner";
import { ToastStack, useToasts } from "@/components/Toast";

type Props = {
  projectKey: string;
  user: AuthUser;
};

type Step = {
  key: string;
  label: string;
};

const STEPS: Step[] = [
  { key: "git", label: "Subiendo codigo a GitHub" },
  { key: "vercel_project", label: "Creando proyecto Vercel" },
  { key: "deploy", label: "Generando primer deploy" },
];

function deployStageFromStep(
  activeStep: number,
  lastDeploy: DeployResponse | null,
  preview: DeployPreview | null
): DeployStage {
  const state = (preview?.state || lastDeploy?.vercel_state || "").toUpperCase();
  if (state === "READY") return "ready";
  if (state === "ERROR" || state === "FAILED") return "error";
  if (activeStep <= 0) return "generating_code";
  if (activeStep === 1) return "pushing_git";
  if (activeStep === 2) return "creating_vercel";
  if (state === "BUILDING" || state === "QUEUED" || state === "INITIALIZING")
    return "building_vercel";
  return "creating_vercel";
}

function stateTone(state?: string): string {
  const s = (state || "").toUpperCase();
  if (s === "READY")
    return "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30";
  if (s === "ERROR" || s === "FAILED")
    return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
  if (s === "BUILDING" || s === "QUEUED" || s === "INITIALIZING")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-neutral-300 dark:border-neutral-700";
}

function stateIcon(state?: string) {
  const s = (state || "").toUpperCase();
  if (s === "READY") return <CheckCircle2 size={12} />;
  if (s === "ERROR" || s === "FAILED") return <AlertTriangle size={12} />;
  if (s === "BUILDING" || s === "QUEUED" || s === "INITIALIZING")
    return <Loader2 size={12} className="animate-spin" />;
  return null;
}

export function DeployPanel({ projectKey, user }: Props) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [lastDeploy, setLastDeploy] = useState<DeployResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toasts = useToasts();

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshPreview = useCallback(async () => {
    try {
      const p = await apiGetDeployPreview(projectKey);
      setPreview(p);
      return p;
    } catch {
      return null;
    }
  }, [projectKey]);

  const startPolling = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      const p = await refreshPreview();
      const s = (p?.state || "").toUpperCase();
      if (s === "READY" || s === "ERROR" || s === "FAILED") {
        stopPoll();
      }
    }, 8000);
  }, [refreshPreview, stopPoll]);

  useEffect(() => {
    let active = true;
    setStatusLoading(true);
    setPreviewLoading(true);
    (async () => {
      try {
        const [st, pv] = await Promise.allSettled([
          apiGetDeployStatus(),
          apiGetDeployPreview(projectKey),
        ]);
        if (!active) return;
        if (st.status === "fulfilled") setStatus(st.value);
        if (pv.status === "fulfilled") {
          setPreview(pv.value);
          const s = (pv.value?.state || "").toUpperCase();
          if (s && s !== "READY" && s !== "ERROR" && s !== "FAILED") {
            startPolling();
          }
        }
      } finally {
        if (active) {
          setStatusLoading(false);
          setPreviewLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      stopPoll();
    };
  }, [projectKey, startPolling, stopPoll]);

  async function deploy() {
    setConfirmOpen(false);
    setError(null);
    setDeploying(true);
    setActiveStep(0);
    const stepTimer = setInterval(() => {
      setActiveStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 18000);
    try {
      const result = await apiDeployProject(projectKey, {
        triggered_by: user.user_id,
        create_vercel_project: true,
        framework: "nextjs",
      });
      setLastDeploy(result);
      setPreview({
        vercel_url: result.vercel_url,
        state: result.vercel_state,
        github_url: result.git_url,
      });
      toasts.success("Despliegue iniciado. Vercel terminara de construir en breve.");
      const s = (result.vercel_state || "").toUpperCase();
      if (s && s !== "READY" && s !== "ERROR" && s !== "FAILED") {
        startPolling();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toasts.error(`Error al desplegar: ${msg}`);
    } finally {
      clearInterval(stepTimer);
      setDeploying(false);
      setActiveStep(-1);
    }
  }

  if (statusLoading || previewLoading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Spinner />
      </div>
    );
  }

  const githubConfigured = !!status?.github?.configured;
  const vercelConfigured = !!status?.vercel?.configured;
  const fullyConfigured = githubConfigured && vercelConfigured;

  if (!fullyConfigured) {
    return (
      <div className="space-y-5">
        <Header />
        <div className="rounded-2xl border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/30 p-6 sm:p-8 text-center">
          <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <AlertTriangle size={22} />
          </div>
          <h3 className="text-lg font-semibold tracking-tight mt-4">
            Despliegue no disponible
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 max-w-md mx-auto">
            Pide a tu administrador que configure los tokens de
            {githubConfigured ? "" : " GitHub"}
            {!githubConfigured && !vercelConfigured ? " y" : ""}
            {vercelConfigured ? "" : " Vercel"} en el backend para habilitar
            esta funcion.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs">
            <Pill
              ok={githubConfigured}
              icon={Github}
              label={`GitHub ${githubConfigured ? "OK" : "pendiente"}`}
            />
            <Pill
              ok={vercelConfigured}
              icon={Cloud}
              label={`Vercel ${vercelConfigured ? "OK" : "pendiente"}`}
            />
          </div>
        </div>
      </div>
    );
  }

  const previewState = (preview?.state || lastDeploy?.vercel_state || "").toUpperCase();
  const vercelUrl = preview?.vercel_url || lastDeploy?.vercel_url || "";
  // Solo mostramos URL de GitHub si el preview confirma que el repo EXISTE realmente.
  // No usamos status?.github?.repo como fallback porque ese es el "owner default" y
  // genera links 404 antes de haber hecho deploy.
  const githubUrl =
    (preview as { github_url?: string } | null)?.github_url ||
    lastDeploy?.git_url ||
    "";
  const hasDeploy = !!vercelUrl || !!githubUrl;

  return (
    <div className="space-y-6">
      <Header />

      <div className="flex items-center gap-2 text-xs">
        <Pill ok icon={Github} label="GitHub conectado" />
        <Pill ok icon={Cloud} label="Vercel conectado" />
      </div>

      {!hasDeploy && !deploying && (
        <div className="rounded-2xl border border-dashed border-brand/40 bg-brand/5 p-6 sm:p-8 text-center">
          <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow">
            <Rocket size={22} />
          </div>
          <h3 className="text-xl font-semibold tracking-tight mt-4">
            Publica tu aplicacion en internet
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 max-w-md mx-auto">
            Subimos el codigo generado a GitHub y creamos un proyecto Vercel
            con su URL publica. Tarda alrededor de un minuto.
          </p>
          <button
            onClick={() => setConfirmOpen(true)}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-brand to-brand-dark text-white rounded-lg hover:shadow-lg hover:shadow-brand/30 transition font-medium shadow-sm"
          >
            <Rocket size={16} /> Desplegar a Vercel
          </button>
        </div>
      )}

      {deploying && (
        <>
          <DeployFlowDiagram
            stage={deployStageFromStep(activeStep, lastDeploy, preview)}
            vercelState={preview?.state || lastDeploy?.vercel_state || undefined}
            githubReady={activeStep >= 1}
            postgresConfigured={false}
            filesCount={lastDeploy?.files_count}
            vercelUrl={preview?.vercel_url || lastDeploy?.vercel_url || undefined}
          />
          <p className="text-[11px] text-neutral-500 mt-2 text-center">
            Esto puede tardar hasta 60 segundos. No cierres esta pestana.
          </p>
        </>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {hasDeploy && (
        <div className="space-y-5">
          <DeployFlowDiagram
            stage={
              previewState === "READY"
                ? "ready"
                : previewState === "ERROR" || previewState === "FAILED"
                ? "error"
                : previewState === "BUILDING" || previewState === "QUEUED" || previewState === "INITIALIZING"
                ? "building_vercel"
                : (lastDeploy as { fallback_provider?: string } | null)?.fallback_provider === "render"
                ? "ready"
                : "creating_vercel"
            }
            vercelState={previewState}
            githubReady={Boolean(githubUrl)}
            postgresConfigured={false}
            filesCount={lastDeploy?.files_count}
            vercelUrl={vercelUrl || undefined}
            renderUrl={(lastDeploy as { render_url?: string | null } | null)?.render_url || undefined}
            fallbackProvider={(lastDeploy as { fallback_provider?: "render" | null } | null)?.fallback_provider || null}
            errorMessage={error || undefined}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DeployCard
              icon={Github}
              title="Repositorio GitHub"
              url={githubUrl}
              urlLabel={githubUrl.replace(/^https?:\/\//, "")}
              accent="dark"
            />
            <DeployCard
              icon={Cloud}
              title="Proyecto Vercel"
              url={vercelUrl}
              urlLabel={vercelUrl.replace(/^https?:\/\//, "")}
              accent="brand"
              badge={
                previewState ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${stateTone(
                      previewState
                    )}`}
                  >
                    {stateIcon(previewState)} {previewState}
                  </span>
                ) : null
              }
            />
          </div>

          {vercelUrl && (
            <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950">
              <header className="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe size={14} className="text-brand" />
                  Vista previa en vivo
                  {previewState && previewState !== "READY" && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${stateTone(
                        previewState
                      )}`}
                    >
                      {stateIcon(previewState)} {previewState}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => refreshPreview()}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  <RefreshCw size={11} /> Refrescar
                </button>
              </header>
              {previewState === "ERROR" || previewState === "FAILED" ? (
                <div className="h-[600px] grid place-items-center bg-gradient-to-b from-red-500/5 to-red-500/10 dark:from-red-500/10 dark:to-red-500/20 p-6">
                  <div className="text-center max-w-md">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/15 text-red-500 mb-4">
                      <AlertTriangle size={28} />
                    </div>
                    <h3 className="text-lg font-semibold">Build de Vercel fallo</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                      El ultimo deploy termino con error. Revisa logs en Vercel
                      o haz click en <b>Re-desplegar</b> abajo para reintentar
                      con el codigo actual.
                    </p>
                    <a
                      href={`https://vercel.com/jaydeths-projects/${projectKey.toLowerCase().replace(/_/g, "-")}/deployments`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:opacity-90"
                    >
                      <Globe size={14} /> Ver logs en Vercel
                    </a>
                  </div>
                </div>
              ) : previewState && previewState !== "READY" ? (
                <div className="h-[600px] grid place-items-center bg-gradient-to-b from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-950">
                  <div className="text-center px-6">
                    <Loader2 size={32} className="animate-spin text-brand mx-auto" />
                    <p className="text-sm font-medium mt-3">
                      Vercel esta construyendo tu app
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Refrescamos automaticamente cada 8 segundos.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-[600px] grid place-items-center bg-gradient-to-br from-brand/5 via-white to-neutral-50 dark:from-brand/10 dark:via-neutral-950 dark:to-neutral-900 p-6">
                  <div className="text-center max-w-md">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand/10 text-brand mb-4">
                      <Globe size={28} />
                    </div>
                    <h3 className="text-lg font-semibold">Deploy listo en Vercel</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                      El preview esta protegido por SSO de Vercel y no puede embeberse en iframe.
                      Abrelo en una pestana nueva para verlo en vivo.
                    </p>
                    <a
                      href={vercelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-medium hover:opacity-90"
                    >
                      <Globe size={14} /> Abrir preview en nueva pestana
                    </a>
                    <p className="text-[11px] text-neutral-500 mt-3 break-all font-mono">
                      {vercelUrl}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          <PostgresConfigCard projectKey={projectKey} onConfigured={() => toasts.success("Postgres conectado. Re-despliega para aplicar.")} />

          <div className="flex justify-end">
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={deploying}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-brand/40 text-brand hover:bg-brand/10 disabled:opacity-60"
            >
              <RefreshCw size={14} /> Re-desplegar
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <Sparkles size={16} className="text-brand" />
              <h3 className="font-semibold">Confirmar despliegue</h3>
            </div>
            <div className="p-5 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                {hasDeploy
                  ? "Se subira el codigo actual y se actualizara el deploy en Vercel."
                  : "Se creara un repositorio GitHub y un proyecto Vercel con tu codigo."}
              </p>
              <p className="text-xs text-neutral-500 mt-2">
                Puede tardar hasta 60 segundos.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-3 py-2 text-sm rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                Cancelar
              </button>
              <button
                onClick={deploy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark font-medium"
              >
                <Rocket size={14} /> Desplegar ahora
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function Header() {
  return (
    <header>
      <div className="flex items-center gap-2">
        <Rocket size={18} className="text-brand" />
        <h2 className="text-lg font-semibold tracking-tight">Despliegue</h2>
      </div>
      <p className="text-sm text-neutral-500 mt-1">
        Publica tu sistema en GitHub y Vercel con un solo clic.
      </p>
    </header>
  );
}

function Pill({
  ok,
  icon: Icon,
  label,
}: {
  ok: boolean;
  icon: typeof Github;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border ${
        ok
          ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300"
          : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
      }`}
    >
      <Icon size={11} />
      {label}
    </span>
  );
}

function DeployCard({
  icon: Icon,
  title,
  url,
  urlLabel,
  accent,
  badge,
}: {
  icon: typeof Github;
  title: string;
  url: string;
  urlLabel: string;
  accent: "dark" | "brand";
  badge?: React.ReactNode;
}) {
  const iconBg =
    accent === "dark"
      ? "bg-neutral-900 text-white"
      : "bg-gradient-to-br from-brand to-brand-dark text-white";
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 flex gap-3">
      <div
        className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${iconBg}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {title}
          </p>
          {badge}
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-brand hover:underline truncate inline-flex items-center gap-1 mt-1 max-w-full"
          >
            <span className="truncate">{urlLabel}</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        ) : (
          <p className="text-sm text-neutral-500 mt-1">No disponible</p>
        )}
      </div>
    </div>
  );
}

function PostgresConfigCard({
  projectKey,
  onConfigured,
}: {
  projectKey: string;
  onConfigured: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  // Detectar si POSTGRES_URL ya esta seteado en el proyecto Vercel
  const checkConnection = useCallback(async () => {
    try {
      const projectName = projectKey.toLowerCase().replace(/_/g, "-");
      const res = await fetch(`${API}/vercel/env/${projectName}`);
      if (!res.ok) {
        setIsConnected(false);
        return;
      }
      const data = await res.json();
      const envs: { key: string }[] = data.envs || [];
      const hasPg = envs.some(
        (e) => e.key === "POSTGRES_URL" || e.key === "DATABASE_URL"
      );
      setIsConnected(hasPg);
    } catch {
      setIsConnected(false);
    }
  }, [projectKey]);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/projects/${projectKey}/postgres/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          database_url: url.trim(),
          auto_provision: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        onConfigured();
        setIsConnected(true);
        setOpen(false);
        setUrl("");
      } else {
        setError(data.error || "No se pudo guardar la conexion. Revisa el connection string.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }, [projectKey, url, onConfigured]);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          {isConnected ? (
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-green-500/15 text-green-600 dark:text-green-300">
              <CheckCircle2 size={14} />
            </span>
          ) : (
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-brand/15 text-brand">
              <Cloud size={14} />
            </span>
          )}
          <div className="text-left">
            <p className="text-sm font-semibold">
              Base de datos {isConnected ? "conectada" : "sin conectar"}
            </p>
            <p className="text-[11px] text-neutral-500">
              {isConnected
                ? "Tu app guarda datos reales en Postgres"
                : "Tu app esta usando datos de ejemplo (mock). Conecta una base para guardar datos reales."}
            </p>
          </div>
        </div>
        <span className="text-xs text-neutral-500 shrink-0">{open ? "Cerrar" : (isConnected ? "Cambiar" : "Conectar")}</span>
      </button>
      {open && (
        <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
          {isConnected && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-700 dark:text-green-300">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <span>
                Ya tienes una base conectada. Solo cambia el connection string si
                quieres apuntar a otra base.
              </span>
            </div>
          )}
          <ol className="space-y-2 text-xs text-neutral-600 dark:text-neutral-300">
            <li className="flex items-start gap-2">
              <span className="grid place-items-center w-5 h-5 rounded-full bg-brand/15 text-brand text-[10px] font-semibold shrink-0">1</span>
              <span>
                Crea una base gratis en{" "}
                <a
                  href="https://console.neon.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline font-medium"
                >
                  console.neon.tech
                </a>
                {" "}(0.5 GB free, sin tarjeta). Tambien sirve Supabase o Railway.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="grid place-items-center w-5 h-5 rounded-full bg-brand/15 text-brand text-[10px] font-semibold shrink-0">2</span>
              <span>Copia el <b>connection string</b> de la base (empieza con <code className="px-1 rounded bg-neutral-100 dark:bg-neutral-800">postgresql://</code>) y pegalo abajo.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="grid place-items-center w-5 h-5 rounded-full bg-brand/15 text-brand text-[10px] font-semibold shrink-0">3</span>
              <span>Re-despliega para que tu app use la base.</span>
            </li>
          </ol>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="postgresql://usuario:password@host.neon.tech/dbname?sslmode=require"
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono"
          />
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setOpen(false); setUrl(""); setError(null); }}
              className="text-xs px-3 py-1.5 rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || !url.trim()}
              onClick={() => submit()}
              className="text-xs px-4 py-1.5 rounded bg-gradient-to-r from-brand to-fuchsia-500 text-white hover:opacity-95 disabled:opacity-60 font-medium"
            >
              {busy ? "Guardando..." : (isConnected ? "Actualizar conexion" : "Conectar base")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default DeployPanel;
