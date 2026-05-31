"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, ExternalLink, KeyRound, Plug } from "lucide-react";
import { getJiraConfig, setJiraConfig, type JiraConfigStatus } from "@/lib/api";
import { ToastStack, useToasts } from "@/components/Toast";

export default function JiraConnectPanel({ projectKey }: { projectKey: string }) {
  const [cfg, setCfg] = useState<JiraConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ base_url: "", email: "", api_token: "", project_key_jira: "", board_id: "" });
  const toasts = useToasts();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getJiraConfig(projectKey);
      setCfg(c);
      if (c.base_url) setForm((f) => ({ ...f, base_url: c.base_url || "", email: c.email || "", project_key_jira: c.project_key_jira || "", board_id: c.board_id || "" }));
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!form.base_url || !form.email || !form.api_token) {
      toasts.error("Completa URL, email y token");
      return;
    }
    setSaving(true);
    try {
      const r = await setJiraConfig(projectKey, form);
      if (r.connection_ok) toasts.success(r.message);
      else toasts.info(r.message);
      await load();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-brand" /></div>;

  const connectedProject = cfg?.source === "project";

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Plug size={18} className="text-brand" /> Conecta tu Jira
        </h3>
        <p className="text-sm text-neutral-500 mt-1">
          Conecta el tablero Jira de tu empresa para que las tareas que genere el
          sistema aparezcan en tu Jira automáticamente.
        </p>
      </header>

      {/* estado actual */}
      <div className={`rounded-xl border p-4 ${connectedProject ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-neutral-200 dark:border-neutral-800"}`}>
        {connectedProject ? (
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={18} />
            <div>
              <p className="font-medium">Jira de este proyecto conectado</p>
              <p className="text-xs opacity-80">{cfg?.base_url} · {cfg?.email}{cfg?.project_key_jira ? ` · ${cfg.project_key_jira}` : ""}</p>
            </div>
          </div>
        ) : cfg?.source === "global" ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Usando la conexión Jira global de la plataforma. Puedes conectar el Jira
            de <b>este proyecto</b> abajo si prefieres usar el tuyo.
          </p>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Aún no hay Jira conectado. Sigue los pasos para conectarlo.
          </p>
        )}
      </div>

      {/* instrucciones */}
      {cfg?.help && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
          <p className="font-medium text-sm mb-2 flex items-center gap-2"><KeyRound size={15} className="text-brand" /> Cómo obtener tu API token</p>
          <ol className="space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300">
            {cfg.help.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <a href={cfg.help.token_url} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 mt-3 text-sm text-brand hover:underline">
            Crear API token en Atlassian <ExternalLink size={13} />
          </a>
        </div>
      )}

      {/* formulario */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <Field label="URL de tu Jira" placeholder="https://tuempresa.atlassian.net"
          value={form.base_url} onChange={(v) => setForm({ ...form, base_url: v })} />
        <Field label="Email de tu cuenta Atlassian" placeholder="tu@empresa.com"
          value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="API Token" placeholder="pega aquí tu token" type="password"
          value={form.api_token} onChange={(v) => setForm({ ...form, api_token: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project Key (opcional)" placeholder="ej. SCRUM"
            value={form.project_key_jira} onChange={(v) => setForm({ ...form, project_key_jira: v })} />
          <Field label="Board ID (opcional)" placeholder="ej. 1"
            value={form.board_id} onChange={(v) => setForm({ ...form, board_id: v })} />
        </div>
        <button onClick={() => void save()} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white hover:bg-brand-dark font-medium disabled:opacity-60">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
          Conectar y probar
        </button>
      </div>
      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function Field({ label, placeholder, value, onChange, type = "text" }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-brand/40" />
    </div>
  );
}
