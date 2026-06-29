"use client";

import { useEffect, useState } from "react";
import {
  Compass,
  Loader2,
  Save,
  CheckCircle2,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
  Activity,
  Zap,
  Plug,
  Server,
  Wrench,
} from "lucide-react";
import {
  apiGetVision,
  apiSaveVision,
  apiListNFR,
  apiSubmitNFR,
  apiVisionAssist,
  type ProductVision,
} from "@/lib/api";
import type { AuthUser } from "@/app/auth/_lib";
import EmptyState from "@/components/EmptyState";
import Spinner from "@/components/Spinner";
import { ToastStack, useToasts } from "@/components/Toast";

const STACKS = [
  { value: "fastapi-next", label: "FastAPI + Next.js" },
  { value: "spring-react", label: "Spring Boot + React" },
  { value: "node-vue", label: "Node + Vue" },
  { value: "other", label: "Otro" },
];

type TriState = "si" | "no" | "no_se";

type NFRState = {
  expected_users: number | "";
  twenty_four_seven: TriState;
  sensitive_data: boolean;
  auth_required: boolean;
  integrations_required: boolean;
  integrations_which: string;
  deployment_target: "local" | "cloud" | "web" | "no_se";
};

const defaultNFR: NFRState = {
  expected_users: "",
  twenty_four_seven: "no_se",
  sensitive_data: false,
  auth_required: false,
  integrations_required: false,
  integrations_which: "",
  deployment_target: "no_se",
};

type Props = {
  projectKey: string;
  user?: AuthUser | null;
};

export function VisionForm({ projectKey, user }: Props) {
  const [loading, setLoading] = useState(true);
  const [vision, setVision] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [stack, setStack] = useState("fastapi-next");
  const [existing, setExisting] = useState<ProductVision | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [nfrOpen, setNfrOpen] = useState(false);
  const [nfr, setNfr] = useState<NFRState>(defaultNFR);
  const [nfrSaving, setNfrSaving] = useState(false);
  const [hasNfr, setHasNfr] = useState(false);
  // Asistente de visión (IA menor): pule la idea y sugiere entidades. No toca el ciclo.
  const [assisting, setAssisting] = useState(false);
  const [suggestedEntities, setSuggestedEntities] = useState<string[]>([]);

  const handleAssist = async () => {
    if (assisting) return;
    const idea = vision.trim();
    if (idea.length < 3) {
      toasts.error("Escribe tu idea primero (aunque sea informal).");
      return;
    }
    setAssisting(true);
    try {
      const r = await apiVisionAssist(idea);
      if (r.ok && r.vision) {
        setVision(r.vision);
        if (r.target_users && !targetUsers.trim()) setTargetUsers(r.target_users);
        setSuggestedEntities(r.entities || []);
        toasts.success("Visión mejorada con IA ✨");
      } else {
        toasts.error(r.reason || "No se pudo mejorar ahora, intenta de nuevo.");
      }
    } finally {
      setAssisting(false);
    }
  };
  const toasts = useToasts();

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([apiGetVision(projectKey), apiListNFR(projectKey)])
      .then(([visionRes, nfrRes]) => {
        if (!active) return;
        if (visionRes.status === "fulfilled" && visionRes.value) {
          const v = visionRes.value;
          setExisting(v);
          setVision(v.vision || "");
          setTargetUsers(v.target_users || "");
          setStack(v.stack_preference || "fastapi-next");
          setShowForm(true);
        } else {
          setExisting(null);
          setShowForm(false);
        }
        if (nfrRes.status === "fulfilled" && nfrRes.value.length > 0) {
          setHasNfr(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectKey]);

  async function save() {
    if (!vision.trim()) {
      toasts.error("La vision no puede estar vacia.");
      return;
    }
    setSaving(true);
    try {
      const saved = await apiSaveVision({
        project_key: projectKey,
        vision: vision.trim(),
        target_users: targetUsers.trim() || undefined,
        stack_preference: stack,
      });
      setExisting(saved);
      toasts.success("Vision guardada.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveNFR() {
    if (!user) {
      toasts.error("Necesitas iniciar sesion.");
      return;
    }
    setNfrSaving(true);
    try {
      const nfrData = {
        scalability: {
          expected_users: nfr.expected_users || 0,
          high_growth: "no_se",
          concurrent_users: 0,
        },
        availability: {
          twenty_four_seven: nfr.twenty_four_seven,
          max_downtime: "",
        },
        security: {
          sensitive_data: nfr.sensitive_data,
          auth_required: nfr.auth_required,
          roles_permissions: false,
          auditing: false,
        },
        integrations: {
          required: nfr.integrations_required,
          which: nfr.integrations_which,
        },
        performance: { response_time: "", heavy_ops: "no_se" },
        deployment: { target: nfr.deployment_target, budget: "" },
        maintainability: { multiple_devs: "no_se", easy_modules: false },
      };
      await apiSubmitNFR({
        user_id: user.user_id,
        project_key: projectKey,
        nfr_data: nfrData,
      });
      setHasNfr(true);
      toasts.success("Requisitos guardados.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      setNfrSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[30vh] grid place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!showForm && !existing) {
    return (
      <div className="space-y-4">
        <SectionHeader />
        <EmptyState
          title="Aun no defines la vision"
          description="Describe el producto que quieres construir. Los agentes la usan para generar tu backlog."
          icon={Lightbulb}
          action={
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition"
            >
              <Compass size={14} /> Definir vision
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader />

      {existing && (
        <div className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 size={12} /> Vision guardada
          {existing.updated_at &&
            ` - actualizada ${new Date(existing.updated_at).toLocaleString()}`}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Vision del producto
            </label>
            <button
              type="button"
              onClick={handleAssist}
              disabled={assisting}
              title="La IA pule tu idea y sugiere usuarios y entidades"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-60 transition"
            >
              {assisting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {assisting ? "Mejorando…" : "Mejorar con IA"}
            </button>
          </div>
          <textarea
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            rows={8}
            placeholder="Describe tu idea, aunque sea informal (ej: 'una app para mi peluquería, citas y clientes'). Luego pulsa 'Mejorar con IA'."
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none leading-relaxed"
          />
          <p className="text-[11px] text-neutral-500 mt-1">
            {vision.trim().length} caracteres
          </p>
          {suggestedEntities.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-neutral-500">La IA detectó que gestionarás:</span>
              {suggestedEntities.map((e) => (
                <span key={e} className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-brand/10 text-brand capitalize">
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1.5">
              Usuarios objetivo
            </label>
            <input
              value={targetUsers}
              onChange={(e) => setTargetUsers(e.target.value)}
              placeholder="Ej: equipos de ventas en retail"
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1.5">
              Stack preferido
            </label>
            <select
              value={stack}
              onChange={(e) => setStack(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
            >
              {STACKS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-dark transition disabled:opacity-60 font-medium"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar vision
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setNfrOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition text-left"
        >
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand/10 text-brand shrink-0">
            <Sparkles size={16} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">
              Requisitos no funcionales{" "}
              <span className="font-normal text-neutral-500">(opcional)</span>
            </span>
            <span className="block text-xs text-neutral-500 mt-0.5">
              Cuentanos cuantos usuarios esperas, si manejas datos sensibles y
              donde quieres desplegar. Ayuda a los agentes a tomar mejores
              decisiones tecnicas.
            </span>
          </span>
          {hasNfr && (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 shrink-0">
              <CheckCircle2 size={12} /> Guardado
            </span>
          )}
          {nfrOpen ? (
            <ChevronUp size={16} className="text-neutral-500 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-neutral-500 shrink-0" />
          )}
        </button>
        {nfrOpen && (
          <div className="px-4 py-5 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NfrField
                icon={Activity}
                label="Cuantos usuarios esperas?"
                hint="Aproximado del primer ano."
              >
                <input
                  type="number"
                  min={0}
                  value={nfr.expected_users}
                  onChange={(e) =>
                    setNfr({
                      ...nfr,
                      expected_users:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                  placeholder="Ej: 500"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </NfrField>

              <NfrField icon={Zap} label="Necesitas que funcione 24/7?">
                <TriRadio
                  name="247"
                  value={nfr.twenty_four_seven}
                  onChange={(v) => setNfr({ ...nfr, twenty_four_seven: v })}
                />
              </NfrField>

              <NfrField icon={ShieldCheck} label="Seguridad">
                <div className="space-y-2 mt-1">
                  <SimpleCheck
                    label="Maneja datos sensibles de personas o empresas"
                    checked={nfr.sensitive_data}
                    onChange={(v) => setNfr({ ...nfr, sensitive_data: v })}
                  />
                  <SimpleCheck
                    label="Los usuarios deben iniciar sesion"
                    checked={nfr.auth_required}
                    onChange={(v) => setNfr({ ...nfr, auth_required: v })}
                  />
                </div>
              </NfrField>

              <NfrField icon={Plug} label="Integraciones externas">
                <div className="space-y-2 mt-1">
                  <SimpleCheck
                    label="Necesito conectar con otros sistemas"
                    checked={nfr.integrations_required}
                    onChange={(v) =>
                      setNfr({ ...nfr, integrations_required: v })
                    }
                  />
                  {nfr.integrations_required && (
                    <input
                      value={nfr.integrations_which}
                      onChange={(e) =>
                        setNfr({ ...nfr, integrations_which: e.target.value })
                      }
                      placeholder="Ej: Stripe, Shopify, Mailchimp..."
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  )}
                </div>
              </NfrField>

              <NfrField
                icon={Server}
                label="Donde quieres desplegarla?"
              >
                <div className="flex flex-wrap gap-2 mt-1">
                  {(
                    [
                      { v: "web", label: "Web publica" },
                      { v: "cloud", label: "Cloud privada" },
                      { v: "local", label: "Local" },
                      { v: "no_se", label: "No se" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() =>
                        setNfr({ ...nfr, deployment_target: opt.v })
                      }
                      className={`px-3 py-1.5 text-sm rounded-md border transition ${
                        nfr.deployment_target === opt.v
                          ? "bg-brand/10 border-brand text-brand"
                          : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </NfrField>
            </div>

            <div className="flex items-center justify-end pt-1">
              <button
                onClick={saveNFR}
                disabled={nfrSaving || !user}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark transition disabled:opacity-60 font-medium"
              >
                {nfrSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Wrench size={14} />
                )}
                Guardar requisitos
              </button>
            </div>
          </div>
        )}
      </div>

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function SectionHeader() {
  return (
    <header>
      <div className="flex items-center gap-2">
        <Compass size={18} className="text-brand" />
        <h2 className="text-lg font-semibold tracking-tight">Vision del producto</h2>
      </div>
      <p className="text-sm text-neutral-500 mt-1">
        Es la fuente de verdad que usan los agentes para refinar tu backlog.
      </p>
    </header>
  );
}

function NfrField({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: typeof Activity;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className="text-brand" />
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </span>
      </div>
      {children}
      {hint && <p className="text-[11px] text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

function TriRadio({
  name,
  value,
  onChange,
}: {
  name: string;
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  const opts: { v: TriState; label: string }[] = [
    { v: "si", label: "Si" },
    { v: "no", label: "No" },
    { v: "no_se", label: "No se" },
  ];
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 text-sm rounded-md border transition ${
            value === o.v
              ? "bg-brand/10 border-brand text-brand"
              : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          }`}
          aria-pressed={value === o.v}
          aria-label={`${name} ${o.label}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SimpleCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 accent-brand"
      />
      <span className="text-neutral-700 dark:text-neutral-300 leading-snug">
        {label}
      </span>
    </label>
  );
}

export default VisionForm;
