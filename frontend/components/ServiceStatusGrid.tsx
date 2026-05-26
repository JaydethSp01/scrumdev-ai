"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { getServicesStatus, type ServiceStatus } from "@/lib/api";
import Spinner from "./Spinner";

type Props = {
  pollIntervalMs?: number;
  onSnapshot?: (snapshot: { ts: string; okCount: number; total: number }) => void;
};

export function ServiceStatusGrid({ pollIntervalMs = 5000, onSnapshot }: Props) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await getServicesStatus();
      setStatus(data);
      setError(null);
      const okCount = Object.values(data).filter((v) => v.status === "ok").length;
      const total = Object.keys(data).length;
      const ts = new Date().toISOString();
      setLastUpdate(ts);
      onSnapshot?.({ ts, okCount, total });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollIntervalMs]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Spinner size={16} />
        Cargando estado de servicios...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-500/40 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
        Error obteniendo servicios: {error}
        <button
          onClick={refresh}
          className="ml-3 inline-flex items-center gap-1 underline"
        >
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    );
  }

  if (!status) return null;

  const entries = Object.entries(status);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Última actualización: {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "—"}
        </p>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-brand"
        >
          <RefreshCw size={12} /> Refrescar
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(([name, s]) => {
          const ok = s.status === "ok";
          const Icon = ok ? CheckCircle2 : XCircle;
          return (
            <div
              key={name}
              className={`p-4 rounded-lg border transition ${
                ok
                  ? "border-green-500/40 bg-green-50/60 dark:bg-green-950/10"
                  : "border-red-500/40 bg-red-50/60 dark:bg-red-950/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm truncate">{name}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {s.service || s.error || "—"}
                  </p>
                </div>
                <Icon
                  size={18}
                  className={ok ? "text-green-600" : "text-red-600"}
                />
              </div>
              <p
                className={`text-xs font-medium mt-2 ${
                  ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                }`}
              >
                {ok ? "Operativo" : "Caído"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ServiceStatusGrid;
