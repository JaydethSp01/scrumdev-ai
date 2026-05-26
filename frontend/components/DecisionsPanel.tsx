"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Loader2,
} from "lucide-react";
import {
  apiApproveDecision,
  apiListPendingDecisions,
  apiRejectDecision,
  type PendingDecision,
} from "@/lib/api";
import type { AuthUser } from "@/app/auth/_lib";
import EmptyState from "@/components/EmptyState";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import { ToastStack, useToasts } from "@/components/Toast";

type Props = {
  projectKey: string;
  user: AuthUser;
};

const POLL_MS = 5000;

type ModalState =
  | { kind: "approve" | "reject"; decision: PendingDecision }
  | null;

export function DecisionsPanel({ projectKey, user }: Props) {
  const [items, setItems] = useState<PendingDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toasts = useToasts();

  const refresh = useCallback(async () => {
    try {
      const list = await apiListPendingDecisions(projectKey);
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  function openApprove(d: PendingDecision) {
    setReason("");
    setModal({ kind: "approve", decision: d });
  }
  function openReject(d: PendingDecision) {
    setReason("");
    setModal({ kind: "reject", decision: d });
  }

  async function confirm() {
    if (!modal) return;
    setSubmitting(true);
    try {
      const body = { decided_by: user.user_id, decision_reason: reason.trim() || undefined };
      if (modal.kind === "approve") {
        await apiApproveDecision(modal.decision.id, body);
        toasts.success("Decision aprobada.");
      } else {
        await apiRejectDecision(modal.decision.id, body);
        toasts.info("Decision rechazada.");
      }
      setModal(null);
      setReason("");
      await refresh();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-brand" />
          <h2 className="text-lg font-semibold">Decisiones pendientes (HITL)</h2>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-brand"
        >
          <RefreshCw size={12} /> Refrescar
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="min-h-[30vh] grid place-items-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Sin decisiones pendientes"
          description="Cuando un agente requiera aprobacion humana, aparecera aqui automaticamente (poll 5s)."
          icon={ShieldCheck}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((d) => (
            <article
              key={d.id}
              className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-950 flex flex-col gap-3"
            >
              <header className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">
                    {d.title || `Decision ${d.id.slice(0, 8)}`}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand/10 text-brand">
                      {d.decision_type}
                    </span>
                    {d.created_at && (
                      <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
                        <Clock size={11} /> {new Date(d.created_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </header>
              {d.description && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-3">
                  {d.description}
                </p>
              )}
              {d.context && (
                <details className="text-xs text-neutral-500">
                  <summary className="cursor-pointer">Contexto</summary>
                  <pre className="mt-2 p-2 rounded bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-x-auto max-h-40">
                    {JSON.stringify(d.context, null, 2)}
                  </pre>
                </details>
              )}
              <div className="flex gap-2 mt-auto pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  onClick={() => openApprove(d)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                >
                  <CheckCircle2 size={14} /> Aprobar
                </button>
                <button
                  onClick={() => openReject(d)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition"
                >
                  <XCircle size={14} /> Rechazar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={!!modal}
        onClose={() => {
          if (!submitting) setModal(null);
        }}
        title={modal?.kind === "approve" ? "Aprobar decision" : "Rechazar decision"}
        footer={
          <>
            <button
              onClick={() => {
                if (!submitting) setModal(null);
              }}
              className="px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              Cancelar
            </button>
            <button
              onClick={confirm}
              disabled={submitting}
              className={`px-4 py-2 text-sm rounded-lg text-white inline-flex items-center gap-2 ${
                modal?.kind === "approve"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              } disabled:opacity-60`}
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Confirmar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {modal && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              <span className="font-medium">
                {modal.decision.title || modal.decision.id}
              </span>{" "}
              ({modal.decision.decision_type})
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Razon (opcional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Explica brevemente la decision para el log de auditoria."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
            />
          </div>
        </div>
      </Modal>

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

export default DecisionsPanel;
