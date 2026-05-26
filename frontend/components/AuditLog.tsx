"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, RefreshCw, Activity } from "lucide-react";
import { getAuditEvents, type AuditEvent } from "@/lib/api";
import EmptyState from "./EmptyState";

// TODO: cambiar a WS cuando esté disponible (backend aún no expone WS)
// const ws = new WebSocket("ws://localhost:8009/ws/events");
// ws.onmessage = (ev) => setEvents((prev) => [JSON.parse(ev.data), ...prev].slice(0, 100));

const POLL_MS = 5000;

type Props = { projectKey?: string };

export function AuditLog({ projectKey }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");

  async function refresh() {
    try {
      const data = await getAuditEvents(50);
      setEvents(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const types = useMemo(() => {
    const s = new Set<string>();
    events.forEach((e) => e.type && s.add(e.type));
    return Array.from(s).sort();
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (typeFilter && e.type !== typeFilter) return false;
      if (projectKey) {
        const payload = JSON.stringify(e.payload || {});
        if (!payload.includes(projectKey) && e.source_service !== projectKey) {
          // Don't filter strictly — still show, but allow loose match
        }
      }
      return true;
    });
  }, [events, typeFilter, projectKey]);

  if (error) {
    return (
      <div className="border border-red-500/40 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
        No se pudo conectar al audit_bus (puerto 8009): {error}
        <button onClick={refresh} className="ml-3 underline inline-flex items-center gap-1">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 text-sm">
          <Filter size={14} className="text-neutral-500" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          >
            <option value="">Todos los tipos</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-neutral-500 ml-auto">
          {filtered.length} de {events.length} eventos · polling cada {POLL_MS / 1000}s
        </p>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-brand"
        >
          <RefreshCw size={12} /> Refrescar
        </button>
      </div>

      {loading && events.length === 0 ? (
        <p className="text-sm text-neutral-500">Cargando eventos...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Sin eventos"
          description="Cuando los servicios emitan eventos al audit_bus aparecerán aquí."
          icon={Activity}
        />
      ) : (
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-neutral-200 dark:divide-neutral-800">
            {filtered.map((ev, i) => {
              const when = ev.created_at || ev.timestamp;
              return (
                <div key={ev.id || i} className="p-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 transition">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand/10 text-brand font-mono">
                      {ev.type || "event"}
                    </span>
                    {ev.source_service && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                        {ev.source_service}
                      </span>
                    )}
                    {when && (
                      <span className="text-xs text-neutral-500 ml-auto">
                        {new Date(when).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {ev.correlation_id && (
                    <p className="text-xs font-mono text-neutral-500 mt-1 break-all">
                      cid: {ev.correlation_id}
                    </p>
                  )}
                  {ev.payload != null && (
                    <details className="mt-1">
                      <summary className="text-xs text-neutral-500 cursor-pointer hover:text-brand">
                        Ver payload
                      </summary>
                      <pre className="mt-1 text-[11px] bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-2 overflow-x-auto">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLog;
