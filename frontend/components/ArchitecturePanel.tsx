"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Layers,
  FilePlus,
  ShieldAlert,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Info,
} from "lucide-react";
import {
  apiEvaluatePolicy,
  apiGenerateAdr,
  type AdrResponse,
  type PolicyEvaluation,
  type PolicyViolation,
} from "@/lib/api";
import { readJSON, STORAGE_KEYS, writeJSON } from "@/lib/storage";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import PrettyMarkdown from "@/components/PrettyMarkdown";
import { ToastStack, useToasts } from "@/components/Toast";

type Props = {
  projectKey: string;
};

type StoredEval = {
  id: string;
  createdAt: string;
  artifact_type: string;
  policies: string[];
  contentPreview: string;
  result: PolicyEvaluation;
};

type StoredAdr = {
  id: string;
  createdAt: string;
  adr_number: number;
  topic: string;
  markdown: string;
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  critical: "bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/40",
};

const POLICY_OPTIONS = ["architecture", "twelve-factor", "security"];

export function ArchitecturePanel({ projectKey }: Props) {
  const toasts = useToasts();
  const [adrOpen, setAdrOpen] = useState(false);
  const [adrNumber, setAdrNumber] = useState(1);
  const [adrTopic, setAdrTopic] = useState("");
  const [adrContext, setAdrContext] = useState("");
  const [adrSubmitting, setAdrSubmitting] = useState(false);
  const [adrResult, setAdrResult] = useState<AdrResponse | null>(null);

  const [policyOpen, setPolicyOpen] = useState(false);
  const [artifactType, setArtifactType] = useState("code");
  const [policyContent, setPolicyContent] = useState("");
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>(["architecture"]);
  const [policySubmitting, setPolicySubmitting] = useState(false);
  const [policyResult, setPolicyResult] = useState<PolicyEvaluation | null>(null);

  const [evals, setEvals] = useState<StoredEval[]>([]);
  const [adrs, setAdrs] = useState<StoredAdr[]>([]);

  useEffect(() => {
    setEvals(readJSON<StoredEval[]>(STORAGE_KEYS.policyEvals(projectKey), []));
    setAdrs(readJSON<StoredAdr[]>(STORAGE_KEYS.adrs(projectKey), []));
  }, [projectKey]);

  function persistEvals(next: StoredEval[]) {
    setEvals(next);
    writeJSON(STORAGE_KEYS.policyEvals(projectKey), next);
  }
  function persistAdrs(next: StoredAdr[]) {
    setAdrs(next);
    writeJSON(STORAGE_KEYS.adrs(projectKey), next);
  }

  const nextAdrNumber = useMemo(() => {
    const max = adrs.reduce((m, a) => (a.adr_number > m ? a.adr_number : m), 0);
    return max + 1;
  }, [adrs]);

  function openAdr() {
    setAdrNumber(nextAdrNumber);
    setAdrTopic("");
    setAdrContext("");
    setAdrResult(null);
    setAdrOpen(true);
  }

  async function submitAdr() {
    if (!adrTopic.trim() || !adrContext.trim()) {
      toasts.error("Topic y contexto son obligatorios.");
      return;
    }
    setAdrSubmitting(true);
    try {
      const res = await apiGenerateAdr({
        project_key: projectKey,
        adr_number: adrNumber,
        topic: adrTopic.trim(),
        context: adrContext.trim(),
      });
      const md = res.markdown || res.content || "";
      setAdrResult(res);
      if (md) {
        const stored: StoredAdr = {
          id: `adr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          createdAt: new Date().toISOString(),
          adr_number: adrNumber,
          topic: adrTopic.trim(),
          markdown: md,
        };
        persistAdrs([stored, ...adrs].slice(0, 50));
      }
      toasts.success("ADR generado.");
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAdrSubmitting(false);
    }
  }

  function openPolicy() {
    setArtifactType("code");
    setPolicyContent("");
    setSelectedPolicies(["architecture"]);
    setPolicyResult(null);
    setPolicyOpen(true);
  }

  async function submitPolicy() {
    if (!policyContent.trim() || selectedPolicies.length === 0) {
      toasts.error("Debes incluir contenido y al menos una policy.");
      return;
    }
    setPolicySubmitting(true);
    try {
      const res = await apiEvaluatePolicy({
        project_key: projectKey,
        artifact_type: artifactType,
        content: policyContent,
        policies: selectedPolicies,
      });
      setPolicyResult(res);
      const stored: StoredEval = {
        id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        artifact_type: artifactType,
        policies: [...selectedPolicies],
        contentPreview: policyContent.slice(0, 200),
        result: res,
      };
      persistEvals([stored, ...evals].slice(0, 50));
      const total = res.violations?.length || 0;
      if (total === 0) {
        toasts.success("Policy evaluation: sin violaciones.");
      } else {
        toasts.info(`Policy evaluation: ${total} violacion(es).`);
      }
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPolicySubmitting(false);
    }
  }

  function togglePolicy(name: string) {
    setSelectedPolicies((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  }

  function removeEval(id: string) {
    persistEvals(evals.filter((e) => e.id !== id));
  }
  function removeAdr(id: string) {
    persistAdrs(adrs.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-brand" />
          <h2 className="text-lg font-semibold">Decisiones del proyecto y por qué</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openAdr}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark"
          >
            <FilePlus size={14} /> Documentar decisión
          </button>
          <button
            onClick={openPolicy}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <ShieldAlert size={14} /> Revisar buenas prácticas
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-brand/30 bg-gradient-to-br from-brand/10 to-transparent p-4 flex items-start gap-3">
        <div className="grid place-items-center w-9 h-9 rounded-lg bg-brand/15 text-brand shrink-0">
          <Info size={18} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold tracking-tight">
            ¿Qué es esto? (en simple)
          </p>
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
            Aquí queda registrado <b>por qué</b> tu software se construyó de cierta
            forma. Por ejemplo: &ldquo;guardamos los datos en una base que permite
            búsquedas inteligentes&rdquo;. Es como el acta de decisiones del
            proyecto: si mañana entra otro equipo (o tú vuelves en 6 meses),
            entienden las decisiones sin adivinar. El sistema lo escribe solo.
            <span className="text-neutral-500"> (técnicamente: ADR — Architecture Decision Record)</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <h3 className="text-sm font-semibold mb-2">ADRs recientes</h3>
          {adrs.length === 0 ? (
            <EmptyState
              title="Aún no hay decisiones documentadas"
              description="Se generan solas al definir la arquitectura, o crea una con el botón de arriba."
              icon={FilePlus}
            />
          ) : (
            <ul className="space-y-2">
              {adrs.map((a) => (
                <li
                  key={a.id}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 bg-white dark:bg-neutral-950"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand">
                      ADR-{String(a.adr_number).padStart(3, "0")}
                    </span>
                    <span className="text-sm font-medium truncate flex-1">{a.topic}</span>
                    <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
                      <Clock size={11} /> {new Date(a.createdAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => removeAdr(a.id)}
                      aria-label="Eliminar ADR"
                      className="p-1 rounded hover:bg-red-500/10 text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-neutral-500">
                      Ver decision completa
                    </summary>
                    <div className="mt-2 max-h-72 overflow-y-auto bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-3">
                      <PrettyMarkdown>{a.markdown}</PrettyMarkdown>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2">Evaluaciones de policy</h3>
          {evals.length === 0 ? (
            <EmptyState
              title="Sin evaluaciones"
              description="Lanza una evaluacion para ver violaciones por severidad."
              icon={ShieldAlert}
            />
          ) : (
            <ul className="space-y-2">
              {evals.map((ev) => {
                const violations = ev.result.violations || [];
                const ok = violations.length === 0;
                return (
                  <li
                    key={ev.id}
                    className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 bg-white dark:bg-neutral-950"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand/10 text-brand">
                        {ev.artifact_type}
                      </span>
                      {ev.policies.map((p) => (
                        <span
                          key={p}
                          className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800"
                        >
                          {p}
                        </span>
                      ))}
                      <span
                        className={`ml-auto text-xs inline-flex items-center gap-1 ${
                          ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {ok ? (
                          <>
                            <CheckCircle2 size={12} /> sin violaciones
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={12} /> {violations.length} violacion(es)
                          </>
                        )}
                      </span>
                      <button
                        onClick={() => removeEval(ev.id)}
                        aria-label="Eliminar evaluacion"
                        className="p-1 rounded hover:bg-red-500/10 text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1 truncate">
                      {ev.contentPreview}
                    </p>
                    {violations.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {violations.map((v, idx) => (
                          <ViolationItem key={idx} v={v} />
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-neutral-500 mt-2 inline-flex items-center gap-1">
                      <Clock size={10} /> {new Date(ev.createdAt).toLocaleString()}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ADR Modal */}
      <Modal
        open={adrOpen}
        onClose={() => {
          if (!adrSubmitting) setAdrOpen(false);
        }}
        title="Generar ADR"
        footer={
          <>
            <button
              onClick={() => {
                if (!adrSubmitting) setAdrOpen(false);
              }}
              className="px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              Cerrar
            </button>
            <button
              onClick={submitAdr}
              disabled={adrSubmitting}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white inline-flex items-center gap-2 disabled:opacity-60"
            >
              {adrSubmitting && <Loader2 size={14} className="animate-spin" />}
              Generar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Numero
              </label>
              <input
                type="number"
                min={1}
                value={adrNumber}
                onChange={(e) => setAdrNumber(Number(e.target.value) || 1)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Topic
              </label>
              <input
                value={adrTopic}
                onChange={(e) => setAdrTopic(e.target.value)}
                placeholder="Elegir broker de mensajeria"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Contexto
            </label>
            <textarea
              value={adrContext}
              onChange={(e) => setAdrContext(e.target.value)}
              rows={6}
              placeholder="Describe el problema, restricciones y opciones consideradas."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
            />
          </div>
          {adrResult && (adrResult.markdown || adrResult.content) && (
            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-3 max-h-72 overflow-y-auto">
              <PrettyMarkdown>
                {adrResult.markdown || adrResult.content || ""}
              </PrettyMarkdown>
            </div>
          )}
        </div>
      </Modal>

      {/* Policy Modal */}
      <Modal
        open={policyOpen}
        onClose={() => {
          if (!policySubmitting) setPolicyOpen(false);
        }}
        title="Evaluar policy"
        footer={
          <>
            <button
              onClick={() => {
                if (!policySubmitting) setPolicyOpen(false);
              }}
              className="px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              Cerrar
            </button>
            <button
              onClick={submitPolicy}
              disabled={policySubmitting}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white inline-flex items-center gap-2 disabled:opacity-60"
            >
              {policySubmitting && <Loader2 size={14} className="animate-spin" />}
              Evaluar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Tipo de artefacto
            </label>
            <select
              value={artifactType}
              onChange={(e) => setArtifactType(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
            >
              <option value="code">code</option>
              <option value="config">config</option>
              <option value="architecture">architecture</option>
              <option value="documentation">documentation</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Policies
            </label>
            <div className="flex flex-wrap gap-2 mt-1">
              {POLICY_OPTIONS.map((p) => {
                const active = selectedPolicies.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePolicy(p)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition ${
                      active
                        ? "bg-brand/10 border-brand text-brand"
                        : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Contenido
            </label>
            <textarea
              value={policyContent}
              onChange={(e) => setPolicyContent(e.target.value)}
              rows={8}
              placeholder="Pega el codigo / config / texto a evaluar."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
            />
          </div>
          {policyResult && (
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-3 text-sm space-y-2">
              <p className="font-medium">
                Resultado: {policyResult.violations?.length || 0} violacion(es)
              </p>
              {(policyResult.violations || []).map((v, idx) => (
                <ViolationItem key={idx} v={v} />
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function ViolationItem({ v }: { v: PolicyViolation }) {
  const sev = (v.severity || "medium").toLowerCase();
  const style =
    SEVERITY_STYLES[sev] ||
    "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700";
  return (
    <div className={`text-xs border rounded p-2 ${style}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono">{v.policy}</span>
        {v.rule && <span className="opacity-75">/ {v.rule}</span>}
        <span className="ml-auto uppercase text-[10px] tracking-wider">{sev}</span>
      </div>
      {v.message && <p className="mt-1">{v.message}</p>}
      {v.details && <p className="opacity-75 mt-1">{v.details}</p>}
    </div>
  );
}

export default ArchitecturePanel;
