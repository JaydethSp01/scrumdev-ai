"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

export function ToastStack({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  const styles =
    toast.kind === "success"
      ? "border-green-500/40 bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200"
      : toast.kind === "error"
      ? "border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200"
      : "border-brand/40 bg-brand/10 text-brand-dark dark:text-brand";

  const Icon = toast.kind === "success" ? CheckCircle2 : toast.kind === "error" ? AlertTriangle : Info;

  return (
    <div
      role="status"
      className={`flex items-start gap-2 border rounded-lg p-3 shadow-md text-sm ${styles}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <p className="flex-1">{toast.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="opacity-60 hover:opacity-100"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function push(kind: ToastKind, message: string) {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
  }
  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }
  return {
    toasts,
    dismiss,
    success: (m: string) => push("success", m),
    error: (m: string) => push("error", m),
    info: (m: string) => push("info", m),
  };
}
