"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { apiSubmitNFR } from "@/lib/api";

/**
 * NFR conversacional (Taller 4): el agente PREGUNTA en el chat y el PO responde
 * aquí mismo — sin mandarlo a otro panel. Al guardar, el gate se aprueba y el
 * Architect Agent usa estas respuestas para proponer la arquitectura.
 */
export default function NfrInline({
  projectKey,
  userId,
  onDone,
  busy,
}: {
  projectKey: string;
  userId: string;
  onDone: () => void;
  busy?: boolean;
}) {
  const [users, setUsers] = useState("50");
  const [growth, setGrowth] = useState("no");
  const [always, setAlways] = useState("no");
  const [sensitive, setSensitive] = useState("si");
  const [auth, setAuth] = useState("si");
  const [deploy, setDeploy] = useState("nube_gratuita");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setSaving(true);
    setErr("");
    try {
      await apiSubmitNFR({
        user_id: userId,
        project_key: projectKey,
        nfr_data: {
          scalability: {
            expected_users: Number(users) || 0,
            high_growth: growth === "si",
          },
          availability: { requires_24_7: always === "si" },
          security: {
            sensitive_data: sensitive === "si",
            authentication_required: auth === "si",
          },
          deployment: { target: deploy },
        },
      });
      onDone(); // aprueba el gate y el ciclo continúa
    } catch {
      setErr("No pude guardar los NFR. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </div>
  );

  const YesNo = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="inline-flex rounded-lg border border-neutral-300 dark:border-neutral-700 overflow-hidden text-xs">
      {["si", "no"].map((v) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-3 py-1.5 capitalize ${value === v ? "bg-brand text-white" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
          {v === "si" ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
      <p className="text-sm font-medium mb-1">Respóndeme estas 6 preguntas:</p>
      <p className="text-xs text-neutral-500 mb-3">
        Con esto el Architect Agent decide la arquitectura (escala, seguridad y despliegue).
      </p>

      <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
        <Row label="¿Cuántos usuarios esperas?">
          <input
            type="number" min={1} value={users}
            onChange={(e) => setUsers(e.target.value)}
            className="w-24 px-2.5 py-1.5 text-sm text-right rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent"
          />
        </Row>
        <Row label="¿Esperas crecimiento alto?"><YesNo value={growth} onChange={setGrowth} /></Row>
        <Row label="¿Debe estar disponible 24/7?"><YesNo value={always} onChange={setAlways} /></Row>
        <Row label="¿Maneja datos sensibles (salud, pagos)?"><YesNo value={sensitive} onChange={setSensitive} /></Row>
        <Row label="¿Requiere inicio de sesión?"><YesNo value={auth} onChange={setAuth} /></Row>
        <Row label="¿Dónde se publica?">
          <select value={deploy} onChange={(e) => setDeploy(e.target.value)}
            className="px-2.5 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950">
            <option value="nube_gratuita">Nube gratuita</option>
            <option value="nube_paga">Nube paga</option>
            <option value="no_se">No sé / recomiéndame</option>
          </select>
        </Row>
      </div>

      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      <button
        onClick={() => void submit()}
        disabled={saving || busy}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-semibold shadow disabled:opacity-60"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        Guardar respuestas y continuar
      </button>
    </div>
  );
}
