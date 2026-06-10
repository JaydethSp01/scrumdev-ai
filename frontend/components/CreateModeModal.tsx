"use client";

import { useState } from "react";
import { X, Sparkles, ArrowRight, MessageSquare } from "lucide-react";

type Result = {
  vision: string;
  targetUsers?: string;
  name?: string;
  templateId?: string;
  fromScratch?: boolean;
};

/**
 * Crear proyecto (Taller 4 / flujo Adam): NO se pregunta por sector ni plantilla.
 * El Product Owner solo nombra el proyecto y entra al CHAT, donde escribe los
 * requerimientos (lista/texto) o sube un documento. El sistema genera el backlog.
 */
export function CreateModeModal({
  open,
  onClose,
  onReady,
}: {
  open: boolean;
  onClose: () => void;
  onReady: (r: Result) => void;
}) {
  const [name, setName] = useState("");

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) return;
    onReady({ name: name.trim(), vision: "" });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <h3 className="font-semibold">Crear proyecto</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <label className="text-sm font-medium">¿Cómo se llama tu proyecto?</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Ej: Clínica DoñaRosa"
            className="mt-2 w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
          />

          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand/5 border border-brand/15 p-3">
            <MessageSquare size={16} className="text-brand shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              En el siguiente paso, el <b>PO Agent</b> te recibe en el <b>chat</b>: ahí escribes
              tus requerimientos (una lista o texto) o subes un documento, y el sistema
              genera el Product Backlog. No eliges sector ni plantilla.
            </p>
          </div>

          <button
            onClick={submit}
            disabled={!name.trim()}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-50"
          >
            Crear y escribir requerimientos <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateModeModal;
