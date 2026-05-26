"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Rocket,
  Compass,
  Tag,
  ListChecks,
  CheckCircle2,
} from "lucide-react";
import type { AuthUser } from "@/app/auth/_lib";
import {
  createProject,
  listProjects,
  normalizeKey,
  type Project,
} from "@/lib/projects";
import { apiSaveVision } from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  onCreated?: (project: Project) => void;
};

type Step = 1 | 2 | 3;

const STACKS = [
  { value: "fastapi-next", label: "FastAPI + Next.js" },
  { value: "spring-react", label: "Spring Boot + React" },
  { value: "node-vue", label: "Node + Vue" },
  { value: "other", label: "Otro" },
];

const VISION_PLACEHOLDER = `Ejemplo:
"Una plataforma SaaS donde gerentes de PYME suben sus ventas mensuales en Excel y obtienen un dashboard con prediccion de demanda y alertas de stock bajo. Los usuarios pueden invitar a su equipo y exportar reportes a PDF."`;

export function ProjectCreateWizard({ open, onClose, user, onCreated }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vision, setVision] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [stack, setStack] = useState<string>("fastapi-next");
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setKey("");
    setName("");
    setDescription("");
    setVision("");
    setTargetUsers("");
    setStack("fastapi-next");
    setError(null);
    setSubmitting(false);
    listProjects(user.user_id)
      .then((list) => setExistingKeys(new Set(list.map((p) => p.key))))
      .catch(() => setExistingKeys(new Set()));
  }, [open, user.user_id]);

  const normalizedKey = useMemo(() => normalizeKey(key), [key]);
  const keyTaken = normalizedKey.length > 0 && existingKeys.has(normalizedKey);

  function next() {
    setError(null);
    if (step === 1) {
      if (!normalizedKey) {
        setError("La clave es obligatoria (A-Z, 0-9, _, -).");
        return;
      }
      if (keyTaken) {
        setError("Ya tienes un proyecto con esa clave.");
        return;
      }
      if (!name.trim()) {
        setError("Ponle un nombre al proyecto.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!vision.trim() || vision.trim().length < 30) {
        setError("Describe la vision con al menos 30 caracteres.");
        return;
      }
      setStep(3);
      return;
    }
  }

  function back() {
    if (step === 1) return;
    setStep((s) => (s === 3 ? 2 : 1));
    setError(null);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const project = await createProject({
        key: normalizedKey,
        name: name.trim(),
        description: description.trim(),
        ownerId: user.user_id,
      });
      try {
        await apiSaveVision({
          project_key: project.key,
          vision: vision.trim(),
          target_users: targetUsers.trim() || undefined,
          stack_preference: stack,
        });
      } catch {
        // Vision is best-effort; project still exists.
      }
      onCreated?.(project);
      onClose();
      router.push(`/projects/${encodeURIComponent(project.key)}?just_created=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              Paso {step} de 3
            </p>
            <h3 className="font-semibold tracking-tight">
              {step === 1 && "Identidad del proyecto"}
              {step === 2 && "Vision del producto"}
              {step === 3 && "Confirma y crea"}
            </h3>
          </div>
          <button
            onClick={() => {
              if (!submitting) onClose();
            }}
            aria-label="Cerrar"
            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <X size={16} />
          </button>
        </div>

        <Stepper step={step} />

        <div className="px-6 py-5 min-h-[280px]">
          {step === 1 && (
            <div className="space-y-4">
              <Field
                label="Clave"
                hint="Identificador unico en mayusculas (A-Z, 0-9). Ej: MIAPP, SHOPYARN."
              >
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onBlur={(e) => setKey(normalizeKey(e.target.value))}
                  placeholder="MIAPP"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
                {normalizedKey && !keyTaken && (
                  <p className="text-[11px] text-green-600 dark:text-green-400 mt-1 inline-flex items-center gap-1">
                    <CheckCircle2 size={11} /> {normalizedKey} disponible
                  </p>
                )}
                {keyTaken && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                    Ya existe un proyecto con esa clave.
                  </p>
                )}
              </Field>
              <Field label="Nombre">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mi App"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </Field>
              <Field
                label="Descripcion corta"
                hint="Una linea: que hace este sistema?"
              >
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Predice demanda y alertas de stock para PYMEs"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field
                label="Cuentame que vas a construir"
                hint="Mientras mas claro, mejor backlog generan los agentes."
              >
                <textarea
                  value={vision}
                  onChange={(e) => setVision(e.target.value)}
                  rows={8}
                  placeholder={VISION_PLACEHOLDER}
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none leading-relaxed"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  {vision.trim().length} caracteres
                </p>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="A quien va dirigido (opcional)">
                  <input
                    value={targetUsers}
                    onChange={(e) => setTargetUsers(e.target.value)}
                    placeholder="Gerentes de PYME, equipos de 3-10 personas"
                    className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                </Field>
                <Field label="Stack preferido">
                  <select
                    value={stack}
                    onChange={(e) => setStack(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                  >
                    {STACKS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <SummaryRow icon={Tag} label="Clave" value={normalizedKey} mono />
              <SummaryRow icon={Compass} label="Nombre" value={name} />
              {description && (
                <SummaryRow
                  icon={ListChecks}
                  label="Descripcion"
                  value={description}
                />
              )}
              <SummaryRow
                icon={Rocket}
                label="Stack"
                value={STACKS.find((s) => s.value === stack)?.label || stack}
              />
              {targetUsers && (
                <SummaryRow icon={Compass} label="Usuarios" value={targetUsers} />
              )}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-900">
                <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                  Vision
                </p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{vision}</p>
              </div>
              <p className="text-xs text-neutral-500">
                Al crear el proyecto guardaremos la vision y podras lanzar la
                generacion completa desde el panel.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-4">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex items-center justify-between gap-3">
          <button
            onClick={back}
            disabled={step === 1 || submitting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40"
          >
            <ArrowLeft size={14} /> Atras
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!submitting) onClose();
              }}
              className="px-3 py-2 text-sm rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              Cancelar
            </button>
            {step < 3 ? (
              <button
                onClick={next}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark font-medium"
              >
                Continuar <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark font-medium disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Rocket size={14} />
                )}
                Crear proyecto
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: "Identidad" },
    { n: 2, label: "Vision" },
    { n: 3, label: "Confirmar" },
  ];
  return (
    <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
      {items.map((it, i) => {
        const done = step > it.n;
        const active = step === it.n;
        return (
          <div key={it.n} className="flex items-center gap-2 flex-1">
            <span
              className={`grid place-items-center w-6 h-6 rounded-full text-[11px] font-semibold transition ${
                done
                  ? "bg-brand text-white"
                  : active
                  ? "bg-brand/15 text-brand ring-2 ring-brand/30"
                  : "bg-neutral-200 dark:bg-neutral-800 text-neutral-500"
              }`}
            >
              {done ? <CheckCircle2 size={12} /> : it.n}
            </span>
            <span
              className={`text-xs ${
                active || done
                  ? "text-neutral-900 dark:text-neutral-100 font-medium"
                  : "text-neutral-500"
              }`}
            >
              {it.label}
            </span>
            {i < items.length - 1 && (
              <span
                className={`flex-1 h-px ${
                  done ? "bg-brand/50" : "bg-neutral-200 dark:bg-neutral-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Tag;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid place-items-center w-8 h-8 rounded-lg bg-brand/10 text-brand shrink-0">
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
        <p className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}

export default ProjectCreateWizard;
