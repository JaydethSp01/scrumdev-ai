"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot, Send, Loader2, Paperclip, ShieldCheck,
  CheckCircle2, Lock, HelpCircle,
} from "lucide-react";
import http from "@/lib/http";
import { API, apiVisionFromDocument, apiStartLifecycle, apiGetPipeline, apiApproveGate, apiAssistant } from "@/lib/api";

import BacklogReview, { type ReviewStory } from "@/components/conversation/BacklogReview";

type Gate = {
  is_gate?: boolean; gate_n?: number; current_state?: string;
  gate_review?: {
    title?: string; summary?: string;
    stories?: ReviewStory[];
    dor_summary?: { ready: number; total: number };
    adrs?: { number: number; title: string }[];
    evidence?: { checks?: { name: string; ok: boolean }[] };
    dod?: { done: boolean };
    planner?: { ok: boolean; blockers: number };
    needs_nfr_form?: boolean;
  };
};
type Msg = { id: number; role: "human" | "agent"; content: string; gate?: Gate };

const PHASE_LABEL: Record<string, string> = {
  BACKLOG: "Generando el Product Backlog…",
  REFINEMENT: "Backlog listo. Necesito tu aprobación.",
  NFR_CAPTURE: "Define los requisitos no funcionales (NFR).",
  ARCHITECTURE_INCEPTION: "El Architect Agent está diseñando la arquitectura…",
  ARCHITECTURE_APPROVAL_PENDING: "Arquitectura propuesta. Necesito tu aprobación.",
  READY_FOR_DEVELOPMENT: "Planificando sprints…",
  DEVELOPMENT: "El Developer Agent está generando el código…",
  CODE_REVIEW: "Revisión de código y políticas en curso…",
  QA: "El QA Agent está ejecutando las pruebas…",
  PO_REVIEW: "Evidencia lista (Sprint Review). Necesito tu aprobación.",
  RELEASE_APPROVAL_PENDING: "Listo para publicar a staging. Aprueba el release.",
  STAGING_DEPLOYMENT: "Desplegando a staging…",
  PRODUCTION_DEPLOYMENT: "Aprueba el despliegue a producción.",
  RELEASED: "🚀 Producto desplegado y disponible.",
};

const SHORT_GATE: Record<string, string> = {
  REFINEMENT: "backlog", NFR_CAPTURE: "nfr", ARCHITECTURE_APPROVAL_PENDING: "arquitectura",
  PO_REVIEW: "evidencia", RELEASE_APPROVAL_PENDING: "release", PRODUCTION_DEPLOYMENT: "producción",
};

// Detalle de QUÉ está haciendo el sistema en cada fase de trabajo (para que el
// PO nunca quede a ciegas) + tiempo estimado.
const WORKING_DETAIL: Record<string, { detail: string; eta: string }> = {
  BACKLOG: {
    detail: "El PO Agent está analizando tus requerimientos y redactando las historias de usuario: título, criterios de aceptación, estimación en puntos y prioridad.",
    eta: "~1-2 min",
  },
  ARCHITECTURE_INCEPTION: {
    detail: "El Architect Agent está decidiendo la arquitectura: estilo, base de datos y autenticación (3 ADRs que tú aprobarás).",
    eta: "~1-2 min",
  },
  READY_FOR_DEVELOPMENT: {
    detail: "Agrupando las historias en sprints según sus puntos y prioridad.",
    eta: "~30 s",
  },
  DEVELOPMENT: {
    detail: "El Developer Agent está escribiendo el código real del sprint: backend, frontend y pruebas. Es el paso más largo porque genera software de verdad, no plantillas.",
    eta: "~5-8 min",
  },
  CODE_REVIEW: {
    detail: "Revisando el código contra patrones de arquitectura, políticas y seguridad.",
    eta: "~1 min",
  },
  QA: {
    detail: "El QA Agent está ejecutando las pruebas y validando los criterios de aceptación.",
    eta: "~1-2 min",
  },
  STAGING_DEPLOYMENT: {
    detail: "Publicando la aplicación en el ambiente de pruebas (staging).",
    eta: "~2-3 min",
  },
};

// Umbral (segundos) tras el cual ofrecemos "Detener y regenerar" por fase.
const STUCK_AFTER: Record<string, number> = {
  BACKLOG: 150, ARCHITECTURE_INCEPTION: 180, READY_FOR_DEVELOPMENT: 120,
  DEVELOPMENT: 600, CODE_REVIEW: 240, QA: 240, STAGING_DEPLOYMENT: 360,
};

export default function ConversationCenter({
  projectKey,
  userId,
  onState,
}: {
  projectKey: string;
  userId?: string;
  onState?: (state: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [meta, setMeta] = useState<{ idx: number; total: number; gate: boolean; label: string; state: string } | null>(null);
  const [reviewStories, setReviewStories] = useState<ReviewStory[] | null>(null);
  const lastState = useRef<string | null>(null);
  const idRef = useRef(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // cronómetro de la fase actual (para mostrar el tiempo transcurrido)
  const phaseStart = useRef<number>(Date.now());
  const [, setTickCount] = useState(0);
  const STORAGE = `scrumdev.conv.${projectKey}`;

  const resetInputHeight = () => {
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  // tick cada segundo mientras hay trabajo en curso (refresca el cronómetro)
  useEffect(() => {
    const id = setInterval(() => setTickCount((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // PERSISTENCIA del chat: guardar en localStorage para que recargar NO borre
  // la conversación (bug crítico de flujo).
  useEffect(() => {
    if (typeof window === "undefined" || msgs.length === 0) return;
    try {
      window.localStorage.setItem(STORAGE, JSON.stringify({
        msgs: msgs.slice(-60), started, lastState: lastState.current,
        nextId: idRef.current, phaseStart: phaseStart.current,
      }));
    } catch { /* storage lleno: ignorar */ }
  }, [msgs, started, STORAGE]);

  const push = useCallback((m: Omit<Msg, "id">) => {
    setMsgs((prev) => [...prev, { ...m, id: idRef.current++ }]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  // Narra el estado del pipeline en el chat (agente) cuando cambia.
  const syncPipeline = useCallback(async () => {
    try {
      const p = (await apiGetPipeline(projectKey)) as Gate & { current_index?: number; total?: number };
      const state = p.current_state || "BACKLOG";
      onState?.(state);
      setMeta({
        idx: p.current_index ?? 0, total: p.total ?? 14, gate: !!p.is_gate,
        label: SHORT_GATE[state] || state.toLowerCase(), state,
      });
      if (state !== lastState.current) {
        lastState.current = state;
        phaseStart.current = Date.now();
        const label = PHASE_LABEL[state] || state;
        if (p.is_gate) {
          push({ role: "agent", content: label, gate: p });
        } else {
          push({ role: "agent", content: label });
        }
      } else if (p.is_gate) {
        // refrescar la tarjeta del gate (datos pueden haber llegado)
        setMsgs((prev) => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].gate) { copy[i] = { ...copy[i], gate: p }; break; }
          }
          return copy;
        });
      }
    } catch {
      /* backend despertando */
    }
  }, [projectKey, onState, push]);

  // Restaurar conversación guardada + saludo inicial / estado actual.
  useEffect(() => {
    let cancelled = false;
    // 1) restaurar del localStorage (recargar NO borra el chat)
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.msgs) && saved.msgs.length > 0) {
          setMsgs(saved.msgs);
          idRef.current = saved.nextId || saved.msgs.length + 1;
          setStarted(!!saved.started);
          lastState.current = saved.lastState ?? null;
          if (saved.phaseStart) phaseStart.current = saved.phaseStart;
          void syncPipeline(); // refresca el gate/estado al día
          return;
        }
      }
    } catch { /* storage corrupto: seguir al flujo normal */ }
    // 2) sin conversación guardada: detectar estado o saludar
    (async () => {
      const p = (await apiGetPipeline(projectKey).catch(() => null)) as Gate | null;
      if (cancelled) return;
      const state = p?.current_state || "BACKLOG";
      const hasBacklog = (p?.gate_review?.stories?.length || 0) > 0 || state !== "BACKLOG";
      if (hasBacklog) {
        setStarted(true);
        lastState.current = null;
        void syncPipeline();
      } else {
        push({
          role: "agent",
          content:
            "¡Hola! Soy ScrumDev AI — tu equipo de agentes (Architect, Developer, QA, " +
            "Security). Tú eres el Product Owner: cuéntame qué quieres construir (escribe " +
            "tus requerimientos o sube un documento) y arranco el ciclo. Genero el Product " +
            "Backlog y me detengo en cada decisión para que TÚ apruebes.",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [projectKey, push, syncPipeline, STORAGE]);

  // Polling de respaldo + WebSocket para tiempo real.
  useEffect(() => {
    if (!started) return;
    const poll = setInterval(() => { if (!busy) void syncPipeline(); }, 5000);
    let ws: WebSocket | null = null;
    let closed = false;
    try {
      const base = (process.env.NEXT_PUBLIC_WS_URL || API).replace(/^http/, "ws");
      ws = new WebSocket(`${base}/_svc/orchestrator/projects/${encodeURIComponent(projectKey)}/events/ws`);
      ws.onmessage = () => { void syncPipeline(); };
    } catch { /* noop */ }
    return () => { closed = true; clearInterval(poll); try { ws?.close(); } catch { /* noop */ } void closed; };
  }, [started, busy, projectKey, syncPipeline]);

  const startFlow = useCallback(async (requirements: string) => {
    const vision = requirements.trim();
    if (!vision) return;
    push({ role: "human", content: vision });
    setInput("");
    resetInputHeight();
    setBusy(true);
    try {
      await http.post(`/projects/${encodeURIComponent(projectKey)}/vision`, {
        project_key: projectKey, vision,
      });
      push({ role: "agent", content: "Registré tus requerimientos. Arranco el ciclo y genero el Product Backlog…" });
      await apiStartLifecycle(projectKey);
      setStarted(true);
      lastState.current = null;
      setTimeout(() => void syncPipeline(), 2500);
    } catch {
      push({ role: "agent", content: "No pude registrar los requerimientos. Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  }, [projectKey, push, syncPipeline]);

  const onUpload = useCallback(async (file: File) => {
    push({ role: "human", content: `📄 ${file.name}` });
    setBusy(true);
    try {
      const ext = await apiVisionFromDocument(file);
      push({ role: "agent", content: `Leí el documento: ${ext.summary || ext.vision.slice(0, 140)}…` });
      await startFlow(ext.vision);
    } catch {
      push({ role: "agent", content: "No pude leer el documento (usa PDF, Word o TXT)." });
    } finally {
      setBusy(false);
    }
  }, [push, startFlow]);

  // Q&A LIBRE (Adam I, profundización): post-arranque el PO le pregunta lo que
  // sea a los agentes; se responde con la MEMORIA del proyecto.
  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    if (!started) { void startFlow(text); return; }
    push({ role: "human", content: text });
    setInput("");
    resetInputHeight();
    setBusy(true);
    try {
      const r = await apiAssistant(projectKey, { user_id: userId || "po", message: text });
      push({ role: "agent", content: r.reply || "…" });
    } catch {
      push({ role: "agent", content: "No pude responder ahora. Intenta de nuevo en un momento." });
    } finally {
      setBusy(false);
    }
  }, [input, started, startFlow, push, projectKey, userId]);

  // "Explícame más a fondo" (que el PO entienda qué va a aprobar).
  const explainGate = useCallback(async (g: Gate) => {
    const title = g.gate_review?.title || `gate #${g.gate_n}`;
    push({ role: "human", content: "Explícame más a fondo qué voy a aprobar." });
    setBusy(true);
    try {
      const r = await apiAssistant(projectKey, {
        user_id: userId || "po",
        message: `Soy el Product Owner. Explícame en lenguaje claro y a fondo qué voy a aprobar en "${title}": qué generó el equipo, por qué, qué implica aprobarlo y qué pasa si pido cambios. Quiero decidir con criterio.`,
      });
      push({ role: "agent", content: r.reply || "…" });
    } catch {
      push({ role: "agent", content: "No pude generar la explicación ahora." });
    } finally {
      setBusy(false);
    }
  }, [projectKey, userId, push]);

  const approve = useCallback(async () => {
    setBusy(true);
    try {
      await apiApproveGate(projectKey);
      push({ role: "human", content: "✅ Apruebo." });
      lastState.current = null;
      setTimeout(() => void syncPipeline(), 2000);
      setTimeout(() => void syncPipeline(), 6000);
    } finally {
      setBusy(false);
    }
  }, [projectKey, push, syncPipeline]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-950">
      <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2 shrink-0">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-fuchsia-500 text-white"><Bot size={16} /></span>
        <div>
          <div className="text-sm font-semibold">ScrumDev AI — Conversación</div>
          <div className="text-[11px] text-neutral-500">Conversas con los agentes y apruebas las decisiones</div>
        </div>
        {meta && (
          <span className="ml-auto text-[11px] px-2.5 py-1 rounded-full bg-brand/10 text-brand font-medium">
            fase {meta.idx + 1}/{meta.total}{meta.gate ? ` · gate: ${meta.label}` : ""}
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {msgs.map((m) => (
          <div key={m.id} className={`flex gap-2.5 ${m.role === "human" ? "flex-row-reverse" : ""}`}>
            <span className={`grid place-items-center w-8 h-8 rounded-full shrink-0 ${m.role === "agent" ? "bg-brand/10 text-brand" : "bg-neutral-800 dark:bg-neutral-700 text-white"}`} title={m.role === "human" ? "Product Owner (tú)" : "ScrumDev AI"}>
              {m.role === "agent" ? <Bot size={15} /> : <span className="text-[10px] font-bold">PO</span>}
            </span>
            <div className={`max-w-[80%] space-y-2`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm ${m.role === "agent" ? "bg-neutral-100 dark:bg-neutral-900" : "bg-brand text-white"}`}>
                {m.content}
              </div>
              {m.gate && (
                <GateCard
                  gate={m.gate}
                  onApprove={approve}
                  onRequestChanges={() => push({ role: "agent", content: "Claro — dime qué te gustaría cambiar y lo ajusto antes de continuar." })}
                  onExplain={() => m.gate && explainGate(m.gate)}
                  onReviewStories={
                    (m.gate.gate_review?.stories?.length || 0) > 0
                      ? () => setReviewStories(m.gate!.gate_review!.stories!)
                      : undefined
                  }
                  busy={busy}
                />
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2 items-center text-neutral-400 text-sm pl-10">
            <Loader2 size={14} className="animate-spin" /> Procesando…
          </div>
        )}
        {/* Trabajo en curso: QUÉ está haciendo el equipo + ETA + cronómetro
            (el PO nunca queda a ciegas mientras "genera"). */}
        {started && !busy && meta && !meta.gate && WORKING_DETAIL[meta.state] && (
          <div className="flex gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-full shrink-0 bg-brand/10 text-brand">
              <Loader2 size={15} className="animate-spin" />
            </span>
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-brand/5 border border-brand/15">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-brand">{PHASE_LABEL[meta.state] || meta.state}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                  {WORKING_DETAIL[meta.state].eta}
                </span>
                <span className="text-[11px] text-neutral-400 tabular-nums">
                  {(() => { const s = Math.max(0, Math.floor((Date.now() - phaseStart.current) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} transcurridos`; })()}
                </span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1.5">
                {WORKING_DETAIL[meta.state].detail}
              </p>
              <div className="mt-2 h-1 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-brand to-fuchsia-500 animate-[slide_1.6s_ease-in-out_infinite]" />
              </div>
              <style jsx>{`@keyframes slide { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }`}</style>
              {/* Si tardó más de lo normal: ofrecer detener y regenerar */}
              {Math.floor((Date.now() - phaseStart.current) / 1000) > (STUCK_AFTER[meta.state] ?? 600) && (
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Está tardando más de lo normal.
                  </span>
                  <button
                    onClick={() => {
                      push({ role: "human", content: "🔄 Detener y regenerar." });
                      phaseStart.current = Date.now();
                      void apiStartLifecycle(projectKey).then(() => {
                        push({ role: "agent", content: "Listo — reinicié la generación de esta fase. Te aviso cuando esté." });
                        setTimeout(() => void syncPipeline(), 4000);
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  >
                    <Loader2 size={12} /> Detener y regenerar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2 shrink-0">
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} title="Subir documento"
          className="p-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900">
          <Paperclip size={16} />
        </button>
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          onChange={(e) => {
            setInput(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
          }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder={started ? "Escribe un mensaje… (Shift+Enter = salto de línea)" : "Pega tus requerimientos aquí… (Shift+Enter = salto de línea)"}
          disabled={busy}
          className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent resize-none leading-relaxed max-h-[200px] overflow-y-auto"
        />
        <button onClick={onSend} disabled={busy || !input.trim()}
          className="p-2.5 rounded-xl bg-brand text-white hover:bg-brand-dark disabled:opacity-60 self-end">
          <Send size={16} />
        </button>
      </div>

      {/* Revisión completa del backlog: ver TODO, descargar y aprobar (Adam B) */}
      {reviewStories && (
        <BacklogReview
          stories={reviewStories}
          projectKey={projectKey}
          busy={busy}
          onClose={() => setReviewStories(null)}
          onApprove={() => { setReviewStories(null); void approve(); }}
        />
      )}
    </div>
  );
}

function GateCard({ gate, onApprove, onRequestChanges, onExplain, onReviewStories, busy }: { gate: Gate; onApprove: () => void; onRequestChanges: () => void; onExplain: () => void; onReviewStories?: () => void; busy: boolean }) {
  const r = gate.gate_review || {};
  const nMock = (r.stories || []).filter((s) => s.mockup).length;
  const chips: string[] = [];
  if (r.stories && r.stories.length) chips.push(`📄 backlog (${r.stories.length})`);
  if (nMock) chips.push(`🖼 ${nMock} mockups`);
  if (r.adrs && r.adrs.length) chips.push(`📐 ${r.adrs.length} ADRs`);
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-200 font-semibold text-sm">
        <Lock size={15} /> {r.title || `Aprobación requerida (Gate #${gate.gate_n})`}
      </div>
      {r.summary && <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1.5">{r.summary}</p>}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {chips.map((c, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300">{c}</span>
          ))}
        </div>
      )}

      {r.dor_summary && (
        <p className="text-xs mt-2 text-neutral-500">DoR: {r.dor_summary.ready}/{r.dor_summary.total} historias listas</p>
      )}
      {r.stories && r.stories.length > 0 && (
        <ul className="mt-2 space-y-1">
          {r.stories.slice(0, 8).map((s) => (
            <li key={s.story_key} className="text-xs">
              <details>
                <summary className="flex items-center gap-1.5 cursor-pointer list-none">
                  <span className="font-mono text-brand">{s.story_key}</span>
                  <span className="text-neutral-600 dark:text-neutral-300 truncate">{s.title}</span>
                  {s.dor && (s.dor.ready ? <CheckCircle2 size={11} className="text-emerald-500 shrink-0" /> : <Lock size={11} className="text-amber-500 shrink-0" />)}
                  {s.mockup && <span className="ml-auto text-[10px] text-neutral-400">mockup ▾</span>}
                </summary>
                {s.mockup && (
                  <div className="mt-1.5 max-w-[260px] rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800"
                    dangerouslySetInnerHTML={{ __html: s.mockup }} />
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
      {r.adrs && r.adrs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {r.adrs.map((a) => <li key={a.number} className="text-xs text-neutral-600 dark:text-neutral-300">ADR-{String(a.number).padStart(3, "0")}: {a.title}</li>)}
        </ul>
      )}
      {r.planner && (
        <p className={`text-xs mt-2 ${r.planner.ok ? "text-emerald-600" : "text-red-600"}`}>
          Validación previa: {r.planner.ok ? "sin bloqueantes" : `${r.planner.blockers} bloqueante(s)`}
        </p>
      )}
      {r.evidence?.checks && (
        <ul className="mt-2 space-y-1">
          {r.evidence.checks.map((c, i) => (
            <li key={i} className="text-xs flex items-center gap-1.5">
              {c.ok ? <CheckCircle2 size={11} className="text-emerald-500" /> : <Lock size={11} className="text-amber-500" />} {c.name}
            </li>
          ))}
        </ul>
      )}
      {r.needs_nfr_form && (
        <p className="text-xs mt-2 text-amber-700 dark:text-amber-300">Completa el formulario NFR en el panel de la derecha, luego aprueba.</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button onClick={onApprove} disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-medium shadow disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Aprobar
        </button>
        <button onClick={onRequestChanges} disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-60">
          Pedir cambios
        </button>
        {onReviewStories && (
          <button onClick={onReviewStories} disabled={busy} title="Ver cada historia completa, descargarlas y aprobar"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-brand/40 text-brand hover:bg-brand/10 disabled:opacity-60 font-medium">
            Ver historias completas
          </button>
        )}
        <button onClick={onExplain} disabled={busy} title="Que el equipo te explique a fondo qué vas a aprobar"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-brand hover:bg-brand/10 disabled:opacity-60">
          <HelpCircle size={14} /> Explícame
        </button>
      </div>
    </div>
  );
}
