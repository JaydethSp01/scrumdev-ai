"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot, Send, Loader2, Paperclip, User as UserIcon, ShieldCheck,
  CheckCircle2, Lock,
} from "lucide-react";
import http from "@/lib/http";
import { API, apiVisionFromDocument, apiStartLifecycle, apiGetPipeline, apiApproveGate } from "@/lib/api";

type Gate = {
  is_gate?: boolean; gate_n?: number; current_state?: string;
  gate_review?: {
    title?: string; summary?: string;
    stories?: { story_key: string; title: string; dor?: { ready: boolean } }[];
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

export default function ConversationCenter({
  projectKey,
  onState,
}: {
  projectKey: string;
  onState?: (state: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const lastState = useRef<string | null>(null);
  const idRef = useRef(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const push = useCallback((m: Omit<Msg, "id">) => {
    setMsgs((prev) => [...prev, { ...m, id: idRef.current++ }]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  // Narra el estado del pipeline en el chat (agente) cuando cambia.
  const syncPipeline = useCallback(async () => {
    try {
      const p = (await apiGetPipeline(projectKey)) as Gate;
      const state = p.current_state || "BACKLOG";
      onState?.(state);
      if (state !== lastState.current) {
        lastState.current = state;
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

  // Saludo inicial + estado actual.
  useEffect(() => {
    let cancelled = false;
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
            "¡Hola! Soy el PO Agent de ScrumDev AI. Cuéntame qué quieres construir " +
            "(o sube un documento de requerimientos) y arranco el ciclo: genero el " +
            "Product Backlog y nos detenemos en cada decisión para que tú apruebes.",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [projectKey, push, syncPipeline]);

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

  const onSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (!started) { void startFlow(text); return; }
    // Conversación post-arranque: el PO comenta / pide cambios.
    push({ role: "human", content: text });
    setInput("");
    push({ role: "agent", content: "Anotado. Puedes seguir el avance aquí y aprobar cuando te lo pida; los cambios/errores entran al backlog desde el panel de Aprobaciones." });
  }, [input, started, startFlow, push]);

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
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {msgs.map((m) => (
          <div key={m.id} className={`flex gap-2.5 ${m.role === "human" ? "flex-row-reverse" : ""}`}>
            <span className={`grid place-items-center w-8 h-8 rounded-full shrink-0 ${m.role === "agent" ? "bg-brand/10 text-brand" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-500"}`}>
              {m.role === "agent" ? <Bot size={15} /> : <UserIcon size={15} />}
            </span>
            <div className={`max-w-[80%] space-y-2`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm ${m.role === "agent" ? "bg-neutral-100 dark:bg-neutral-900" : "bg-brand text-white"}`}>
                {m.content}
              </div>
              {m.gate && <GateCard gate={m.gate} onApprove={approve} busy={busy} />}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2 items-center text-neutral-400 text-sm pl-10">
            <Loader2 size={14} className="animate-spin" /> Procesando…
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
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder={started ? "Escribe un mensaje…" : "Escribe tus requerimientos…"}
          disabled={busy}
          className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
        />
        <button onClick={onSend} disabled={busy || !input.trim()}
          className="p-2.5 rounded-xl bg-brand text-white hover:bg-brand-dark disabled:opacity-60">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function GateCard({ gate, onApprove, busy }: { gate: Gate; onApprove: () => void; busy: boolean }) {
  const r = gate.gate_review || {};
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-200 font-semibold text-sm">
        <Lock size={15} /> {r.title || `Aprobación requerida (Gate #${gate.gate_n})`}
      </div>
      {r.summary && <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1.5">{r.summary}</p>}

      {r.dor_summary && (
        <p className="text-xs mt-2 text-neutral-500">DoR: {r.dor_summary.ready}/{r.dor_summary.total} historias listas</p>
      )}
      {r.stories && r.stories.length > 0 && (
        <ul className="mt-2 space-y-1">
          {r.stories.slice(0, 8).map((s) => (
            <li key={s.story_key} className="text-xs flex items-center gap-1.5">
              <span className="font-mono text-brand">{s.story_key}</span>
              <span className="text-neutral-600 dark:text-neutral-300 truncate">{s.title}</span>
              {s.dor && (s.dor.ready ? <CheckCircle2 size={11} className="text-emerald-500 shrink-0" /> : <Lock size={11} className="text-amber-500 shrink-0" />)}
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

      <button onClick={onApprove} disabled={busy}
        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-medium shadow disabled:opacity-60">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Apruebo, continuar
      </button>
    </div>
  );
}
