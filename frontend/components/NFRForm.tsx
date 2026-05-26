"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ClipboardList,
  Loader2,
  Send,
  Activity,
  ShieldCheck,
  Plug,
  Zap,
  Server,
  Wrench,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { advanceWorkflow, apiSubmitNFR } from "@/lib/api";
import type { AuthUser } from "@/app/auth/_lib";
import { ToastStack, useToasts } from "@/components/Toast";

type TriState = "si" | "no" | "no_se";

type NFRState = {
  scalability: {
    expected_users: number | "";
    high_growth: TriState;
    concurrent_users: number | "";
  };
  availability: {
    twenty_four_seven: TriState;
    max_downtime: string;
  };
  security: {
    sensitive_data: boolean;
    auth_required: boolean;
    roles_permissions: boolean;
    auditing: boolean;
  };
  integrations: {
    required: boolean;
    which: string;
  };
  performance: {
    response_time: string;
    heavy_ops: TriState;
  };
  deployment: {
    target: "local" | "cloud" | "web" | "no_se";
    budget: string;
  };
  maintainability: {
    multiple_devs: TriState;
    easy_modules: boolean;
  };
};

const defaultState: NFRState = {
  scalability: { expected_users: "", high_growth: "no_se", concurrent_users: "" },
  availability: { twenty_four_seven: "no_se", max_downtime: "" },
  security: {
    sensitive_data: false,
    auth_required: false,
    roles_permissions: false,
    auditing: false,
  },
  integrations: { required: false, which: "" },
  performance: { response_time: "", heavy_ops: "no_se" },
  deployment: { target: "no_se", budget: "" },
  maintainability: { multiple_devs: "no_se", easy_modules: false },
};

type Props = {
  projectKey: string;
  user: AuthUser;
};

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
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <label
          key={o.v}
          className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer transition ${
            value === o.v
              ? "bg-brand/10 border-brand text-brand"
              : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          }`}
        >
          <input
            type="radio"
            className="sr-only"
            name={name}
            checked={value === o.v}
            onChange={() => onChange(o.v)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-white dark:bg-neutral-950">
      <header className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-brand" />
        <h3 className="font-semibold">{title}</h3>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
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
      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-brand"
      />
      {label}
    </label>
  );
}

export function NFRForm({ projectKey, user }: Props) {
  const [s, setS] = useState<NFRState>(defaultState);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toasts = useToasts();

  async function submit() {
    setError(null);
    setOutput(null);
    setSubmitting(true);
    try {
      const nfrData = {
        scalability: {
          expected_users: s.scalability.expected_users || 0,
          high_growth: s.scalability.high_growth,
          concurrent_users: s.scalability.concurrent_users || 0,
        },
        availability: {
          twenty_four_seven: s.availability.twenty_four_seven,
          max_downtime: s.availability.max_downtime,
        },
        security: { ...s.security },
        integrations: { ...s.integrations },
        performance: { ...s.performance },
        deployment: { ...s.deployment },
        maintainability: { ...s.maintainability },
      };
      await apiSubmitNFR({
        user_id: user.user_id,
        project_key: projectKey,
        nfr_data: nfrData,
      });
      toasts.success("NFR enviado correctamente.");
      setSubmitting(false);
      setAdvancing(true);
      try {
        const adv = await advanceWorkflow({
          user_id: user.user_id,
          project_key: projectKey,
          target_state: "ARCHITECTURE_INCEPTION",
          context: {
            requirements: JSON.stringify(nfrData),
            story: "(NFR submitted)",
          },
        });
        const text =
          adv?.result?.output ||
          (adv as { output?: string }).output ||
          (typeof adv === "string" ? adv : JSON.stringify(adv, null, 2));
        setOutput(typeof text === "string" ? text : JSON.stringify(text, null, 2));
        toasts.success("Architecture inception generado.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`NFR ok, pero el avance fallo: ${msg}`);
      } finally {
        setAdvancing(false);
      }
    } catch (e) {
      setSubmitting(false);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toasts.error(`Error al enviar NFR: ${msg}`);
    }
  }

  const busy = submitting || advancing;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={18} className="text-brand" />
        <h2 className="text-lg font-semibold">Requisitos no funcionales</h2>
      </div>
      <p className="text-sm text-neutral-500 -mt-2">
        Define los NFR del proyecto. Al enviar, se avanzara automaticamente a la inception de arquitectura.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Escalabilidad" icon={Activity}>
          <Field label="Usuarios esperados">
            <input
              type="number"
              min={0}
              value={s.scalability.expected_users}
              onChange={(e) =>
                setS({
                  ...s,
                  scalability: {
                    ...s.scalability,
                    expected_users: e.target.value === "" ? "" : Number(e.target.value),
                  },
                })
              }
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
          <Field label="Crece alto?">
            <TriRadio
              name="high_growth"
              value={s.scalability.high_growth}
              onChange={(v) => setS({ ...s, scalability: { ...s.scalability, high_growth: v } })}
            />
          </Field>
          <Field label="Usuarios concurrentes">
            <input
              type="number"
              min={0}
              value={s.scalability.concurrent_users}
              onChange={(e) =>
                setS({
                  ...s,
                  scalability: {
                    ...s.scalability,
                    concurrent_users: e.target.value === "" ? "" : Number(e.target.value),
                  },
                })
              }
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
        </Section>

        <Section title="Disponibilidad" icon={CheckCircle2}>
          <Field label="Requiere 24/7?">
            <TriRadio
              name="twenty_four_seven"
              value={s.availability.twenty_four_seven}
              onChange={(v) =>
                setS({ ...s, availability: { ...s.availability, twenty_four_seven: v } })
              }
            />
          </Field>
          <Field label="Downtime maximo tolerable" hint="Ej: 1h/mes, 99.9%, etc.">
            <input
              value={s.availability.max_downtime}
              onChange={(e) =>
                setS({
                  ...s,
                  availability: { ...s.availability, max_downtime: e.target.value },
                })
              }
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
        </Section>

        <Section title="Seguridad" icon={ShieldCheck}>
          <Checkbox
            label="Maneja datos sensibles"
            checked={s.security.sensitive_data}
            onChange={(v) => setS({ ...s, security: { ...s.security, sensitive_data: v } })}
          />
          <Checkbox
            label="Autenticacion requerida"
            checked={s.security.auth_required}
            onChange={(v) => setS({ ...s, security: { ...s.security, auth_required: v } })}
          />
          <Checkbox
            label="Roles / permisos"
            checked={s.security.roles_permissions}
            onChange={(v) => setS({ ...s, security: { ...s.security, roles_permissions: v } })}
          />
          <Checkbox
            label="Auditoria de acciones"
            checked={s.security.auditing}
            onChange={(v) => setS({ ...s, security: { ...s.security, auditing: v } })}
          />
        </Section>

        <Section title="Integraciones" icon={Plug}>
          <Checkbox
            label="Requiere integraciones externas"
            checked={s.integrations.required}
            onChange={(v) =>
              setS({ ...s, integrations: { ...s.integrations, required: v } })
            }
          />
          <Field label="Cuales?" hint="Ej: Stripe, Shopify, ERP, etc.">
            <textarea
              value={s.integrations.which}
              onChange={(e) =>
                setS({ ...s, integrations: { ...s.integrations, which: e.target.value } })
              }
              rows={2}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
            />
          </Field>
        </Section>

        <Section title="Rendimiento" icon={Zap}>
          <Field label="Tiempo de respuesta esperado" hint="Ej: <200ms p95">
            <input
              value={s.performance.response_time}
              onChange={(e) =>
                setS({
                  ...s,
                  performance: { ...s.performance, response_time: e.target.value },
                })
              }
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
          <Field label="Operaciones pesadas?">
            <TriRadio
              name="heavy_ops"
              value={s.performance.heavy_ops}
              onChange={(v) =>
                setS({ ...s, performance: { ...s.performance, heavy_ops: v } })
              }
            />
          </Field>
        </Section>

        <Section title="Despliegue" icon={Server}>
          <Field label="Target">
            <div className="flex flex-wrap gap-2 mt-1">
              {(["local", "cloud", "web", "no_se"] as const).map((t) => (
                <label
                  key={t}
                  className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer transition ${
                    s.deployment.target === t
                      ? "bg-brand/10 border-brand text-brand"
                      : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="deployment_target"
                    checked={s.deployment.target === t}
                    onChange={() =>
                      setS({ ...s, deployment: { ...s.deployment, target: t } })
                    }
                  />
                  {t === "no_se" ? "No se" : t.charAt(0).toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Presupuesto" hint="Aproximado mensual o total.">
            <input
              value={s.deployment.budget}
              onChange={(e) =>
                setS({ ...s, deployment: { ...s.deployment, budget: e.target.value } })
              }
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
        </Section>

        <Section title="Mantenibilidad" icon={Wrench}>
          <Field label="Trabajaran multiples devs?">
            <TriRadio
              name="multiple_devs"
              value={s.maintainability.multiple_devs}
              onChange={(v) =>
                setS({
                  ...s,
                  maintainability: { ...s.maintainability, multiple_devs: v },
                })
              }
            />
          </Field>
          <Checkbox
            label="Modulos faciles de extender"
            checked={s.maintainability.easy_modules}
            onChange={(v) =>
              setS({ ...s, maintainability: { ...s.maintainability, easy_modules: v } })
            }
          />
        </Section>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-dark transition disabled:opacity-60 font-medium"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {submitting
            ? "Guardando NFR..."
            : advancing
            ? "Avanzando a Architecture..."
            : "Enviar NFR y avanzar"}
        </button>
      </div>

      {output && (
        <section className="border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-950 overflow-hidden">
          <header className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 text-sm font-medium flex items-center gap-2">
            <Layers size={14} className="text-brand" /> Salida del agente de arquitectura
          </header>
          <div className="prose-chat text-sm p-4 max-h-[60vh] overflow-y-auto">
            <ReactMarkdown>{output}</ReactMarkdown>
          </div>
        </section>
      )}

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

export default NFRForm;
