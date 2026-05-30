"use client";

import { useCallback, useState } from "react";
import {
  X,
  Sparkles,
  FileText,
  PenLine,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Upload,
  CheckCircle2,
  Building2,
} from "lucide-react";
import {
  apiGetIndustries,
  apiGenIntakeForm,
  apiIntakeVision,
  apiVisionFromDocument,
  type Industry,
  type IntakeForm,
} from "@/lib/api";

type Mode = "choose" | "industry" | "document" | "free";

type Result = {
  vision: string;
  targetUsers?: string;
  name?: string;
};

/**
 * Modal de seleccion de modo de creacion. Cuando el user completa, llama
 * onReady(result) con la vision precargada, y el wizard normal toma el relevo.
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
  const [mode, setMode] = useState<Mode>("choose");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-950 z-10">
          <div className="flex items-center gap-2">
            {mode !== "choose" && (
              <button
                onClick={() => setMode("choose")}
                className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <Sparkles size={16} className="text-brand" />
            <h3 className="font-semibold">Crear proyecto</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {mode === "choose" && <ChooseMode onPick={setMode} onFree={() => onReady({ vision: "" })} />}
          {mode === "industry" && <IndustryFlow onReady={onReady} />}
          {mode === "document" && <DocumentFlow onReady={onReady} />}
        </div>
      </div>
    </div>
  );
}

function ChooseMode({ onPick, onFree }: { onPick: (m: Mode) => void; onFree: () => void }) {
  const cards = [
    {
      mode: "industry" as Mode,
      icon: Building2,
      title: "Por industria",
      desc: "Elige tu industria y la IA genera preguntas específicas para entender tu negocio.",
      grad: "from-brand to-fuchsia-500",
      action: () => onPick("industry"),
    },
    {
      mode: "document" as Mode,
      icon: FileText,
      title: "Subir documento",
      desc: "Sube tu doc de requerimientos (PDF, Word, texto) y la IA lo analiza.",
      grad: "from-cyan-500 to-blue-500",
      action: () => onPick("document"),
    },
    {
      mode: "free" as Mode,
      icon: PenLine,
      title: "Describir libre",
      desc: "Cuéntale a la IA tu idea con tus propias palabras.",
      grad: "from-emerald-500 to-teal-500",
      action: onFree,
    },
  ];
  return (
    <div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        ¿Cómo quieres empezar? Mientras más contexto, mejor construye la IA.
      </p>
      <div className="grid gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.title}
              onClick={c.action}
              className="group text-left rounded-2xl border-2 border-neutral-200 dark:border-neutral-800 hover:border-brand/40 p-4 flex items-start gap-4 transition hover:shadow-md"
            >
              <span className={`grid place-items-center w-12 h-12 rounded-xl bg-gradient-to-br ${c.grad} text-white shrink-0 shadow-md`}>
                <Icon size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold">{c.title}</h4>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">{c.desc}</p>
              </div>
              <ArrowRight size={18} className="text-neutral-400 group-hover:text-brand group-hover:translate-x-1 transition shrink-0 mt-3" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IndustryFlow({ onReady }: { onReady: (r: Result) => void }) {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  // cargar industrias on mount
  if (!loaded) {
    setLoaded(true);
    void apiGetIndustries().then(setIndustries);
  }

  const pickIndustry = useCallback(async (id: string) => {
    setSelected(id);
    setBusy(true);
    try {
      setForm(await apiGenIntakeForm(id, name));
    } finally {
      setBusy(false);
    }
  }, [name]);

  const finish = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const vision = await apiIntakeVision(selected, answers, name);
      onReady({ vision, name });
    } finally {
      setBusy(false);
    }
  }, [selected, answers, name, onReady]);

  if (!form) {
    return (
      <div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
          ¿En qué industria está tu negocio?
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del proyecto (ej: DoñaRosa)"
          className="w-full mb-3 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
        />
        {busy ? (
          <div className="py-8 text-center">
            <Loader2 className="animate-spin text-brand mx-auto" size={26} />
            <p className="text-sm text-neutral-500 mt-2">Generando preguntas para tu industria...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {industries.map((ind) => (
              <button
                key={ind.id}
                onClick={() => void pickIndustry(ind.id)}
                className="px-3 py-3 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-brand/40 hover:bg-brand/5 text-sm font-medium transition text-left"
              >
                {ind.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold">{form.title}</h4>
        <p className="text-sm text-neutral-500 mt-0.5">{form.intro}</p>
      </div>
      {form.fields.map((f) => (
        <FieldInput key={f.id} field={f} value={answers[f.id]} onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))} />
      ))}
      <button
        onClick={() => void finish()}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-brand to-fuchsia-500 text-white font-medium disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
        Generar visión y continuar
      </button>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: IntakeForm["fields"][number]; value: unknown; onChange: (v: unknown) => void }) {
  const base = "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm";
  return (
    <div>
      <label className="text-sm font-medium block mb-1">
        {field.label}
        {field.required && <span className="text-brand"> *</span>}
      </label>
      {field.type === "textarea" && (
        <textarea className={`${base} resize-none`} rows={2} placeholder={field.placeholder}
          value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === "text" && (
        <input className={base} placeholder={field.placeholder}
          value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === "number" && (
        <input type="number" className={base} placeholder={field.placeholder}
          value={(value as number) || ""} onChange={(e) => onChange(Number(e.target.value))} />
      )}
      {field.type === "select" && (
        <select className={base} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona...</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {field.type === "boolean" && (
        <div className="flex gap-2">
          {["Sí", "No"].map((o) => (
            <button key={o} onClick={() => onChange(o === "Sí")}
              className={`px-4 py-1.5 rounded-lg border text-sm ${(o === "Sí") === value ? "border-brand bg-brand/10 text-brand" : "border-neutral-300 dark:border-neutral-700"}`}>
              {o}
            </button>
          ))}
        </div>
      )}
      {field.type === "multiselect" && (
        <div className="flex flex-wrap gap-1.5">
          {(field.options || []).map((o) => {
            const arr = (value as string[]) || [];
            const on = arr.includes(o);
            return (
              <button key={o} onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
                className={`px-3 py-1.5 rounded-full border text-xs ${on ? "border-brand bg-brand/10 text-brand" : "border-neutral-300 dark:border-neutral-700"}`}>
                {o}
              </button>
            );
          })}
        </div>
      )}
      {field.help && <p className="text-[11px] text-neutral-400 mt-1">{field.help}</p>}
    </div>
  );
}

function DocumentFlow({ onReady }: { onReady: (r: Result) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiVisionFromDocument(file, name);
      onReady({ vision: r.vision, targetUsers: r.target_users, name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando documento");
    } finally {
      setBusy(false);
    }
  }, [file, name, onReady]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Sube tu documento de requerimientos. La IA extrae y arma la visión.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del proyecto"
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
      />
      <label className="block rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-brand/40 p-8 text-center cursor-pointer transition">
        <input type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <Upload size={28} className="mx-auto text-brand mb-2" />
        {file ? (
          <p className="text-sm font-medium">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium">Arrastra o haz click para subir</p>
            <p className="text-xs text-neutral-500 mt-1">PDF, Word, TXT, Markdown</p>
          </>
        )}
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={() => void submit()}
        disabled={busy || !file}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-brand to-fuchsia-500 text-white font-medium disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        Analizar y continuar
      </button>
    </div>
  );
}

export default CreateModeModal;
