"use client";

import { useCallback, useState } from "react";
import {
  X,
  Sparkles,
  FileText,
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
  apiMatchTemplates,
  type Industry,
  type IntakeForm,
  type TemplateCard,
} from "@/lib/api";

type Mode = "choose" | "industry" | "document";

type Result = {
  vision: string;
  targetUsers?: string;
  name?: string;
  templateId?: string;   // plantilla elegida en el paso de revisión
  fromScratch?: boolean;  // crear a medida (sin plantilla)
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
  // visión ya recolectada -> mostramos el paso de REVISIÓN (qué plantilla se usará)
  // ANTES de crear el proyecto.
  const [pending, setPending] = useState<Result | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-950 z-10">
          <div className="flex items-center gap-2">
            {(mode !== "choose" || pending) && (
              <button
                onClick={() => (pending ? setPending(null) : setMode("choose"))}
                className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <Sparkles size={16} className="text-brand" />
            <h3 className="font-semibold">{pending ? "Revisa tu plantilla" : "Crear proyecto"}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {pending ? (
            <ReviewStep
              result={pending}
              onConfirm={(extra) => onReady({ ...pending, ...extra })}
            />
          ) : (
            <>
              {mode === "choose" && <ChooseMode onPick={setMode} />}
              {mode === "industry" && <IndustryFlow onReady={setPending} />}
              {mode === "document" && <DocumentFlow onReady={setPending} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChooseMode({ onPick }: { onPick: (m: Mode) => void }) {
  const cards = [
    {
      mode: "industry" as Mode,
      icon: Building2,
      title: "Por industria",
      desc: "Elige tu industria (o agrega una nueva) y la IA genera preguntas específicas para entender tu negocio.",
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

const confPct = (t: TemplateCard) => {
  const c = (t as unknown as { match_confidence?: number }).match_confidence;
  return typeof c === "number" ? c : Math.round(Math.min(100, t.match_score * 7));
};

function TemplateMini({ t, onUse, highlight }: { t: TemplateCard; onUse: () => void; highlight?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border ${highlight ? "border-brand ring-2 ring-brand/30" : "border-neutral-200 dark:border-neutral-800"}`}>
      <div className="relative aspect-[16/9] w-full bg-neutral-100 dark:bg-neutral-800" style={{ backgroundColor: t.brand_color + "14" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={t.preview_url} alt={t.name} className="h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: t.brand_color }}>{t.sector_label}</span>
        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-neutral-700">{confPct(t)}% match</span>
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t.name}</p>
          <p className="truncate text-xs text-neutral-500">{t.description}</p>
        </div>
        <button onClick={onUse} className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Usar</button>
      </div>
    </div>
  );
}

function ReviewStep({ result, onConfirm }: { result: Result; onConfirm: (extra: { templateId?: string; fromScratch?: boolean }) => void }) {
  const [tpls, setTpls] = useState<TemplateCard[] | null>(null);
  const [rec, setRec] = useState<TemplateCard | null>(null);
  const [recScratch, setRecScratch] = useState(false);
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const PER = 4;

  if (tpls === null) {
    void apiMatchTemplates(result.vision, 50)
      .then((d) => { setTpls(d.templates || []); setRec(d.recommended); setRecScratch(d.recommend_scratch); })
      .catch(() => { setTpls([]); });
  }

  if (tpls === null) {
    return (
      <div className="grid place-items-center py-12 text-neutral-500">
        <Loader2 className="animate-spin mb-2" /> Analizando tu idea y buscando la mejor plantilla…
      </div>
    );
  }

  const others = tpls.filter((t) => t.id !== rec?.id);
  const pages = Math.ceil(others.length / PER);
  const shown = others.slice(page * PER, (page + 1) * PER);

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Con lo que nos contaste, <strong>antes de crear</strong> esto es lo que usaríamos:
      </p>

      {rec && !recScratch ? (
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">Recomendada para ti</p>
          <TemplateMini t={rec} highlight onUse={() => onConfirm({ templateId: rec.id })} />
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Tu idea es bastante específica: lo mejor es <strong>crearla a medida</strong> (desde cero). También puedes partir de una plantilla cercana abajo.
        </div>
      )}

      <button onClick={() => onConfirm({ fromScratch: true })}
        className="flex w-full items-center justify-between rounded-xl border border-dashed border-neutral-300 p-3 text-left hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
        <div>
          <p className="text-sm font-semibold">Crear a medida (desde cero)</p>
          <p className="text-xs text-neutral-500">La IA diseña cada pantalla según tu visión. Tarda un poco más.</p>
        </div>
        <ArrowRight size={16} className="text-neutral-400" />
      </button>

      {others.length > 0 ? (
        <div>
          <button onClick={() => setShowAll((s) => !s)} className="mb-3 text-sm font-medium text-brand hover:underline">
            {showAll ? "Ocultar otras plantillas" : `Ver todas las plantillas (${others.length})`}
          </button>
          {showAll ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {shown.map((t) => <TemplateMini key={t.id} t={t} onUse={() => onConfirm({ templateId: t.id })} />)}
              </div>
              {pages > 1 ? (
                <div className="flex items-center justify-center gap-3 text-sm">
                  <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700">←</button>
                  <span className="text-neutral-500">Página {page + 1} de {pages}</span>
                  <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700">→</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
  const [custom, setCustom] = useState(""); // industria nueva escrita por el usuario

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
          <>
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
            {/* Industria NUEVA: si no está en la lista, el usuario la escribe y la IA genera las preguntas */}
            <div className="mt-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-3">
              <p className="text-xs font-medium text-neutral-500 mb-2">
                ¿No está tu industria? Escríbela y la IA crea las preguntas:
              </p>
              <div className="flex gap-2">
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && custom.trim().length >= 3) void pickIndustry(custom.trim()); }}
                  placeholder="Ej: Funeraria, Viñedo, Feria de vivienda…"
                  className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
                />
                <button
                  onClick={() => custom.trim().length >= 3 && void pickIndustry(custom.trim())}
                  disabled={custom.trim().length < 3}
                  className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Agregar
                </button>
              </div>
            </div>
          </>
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
