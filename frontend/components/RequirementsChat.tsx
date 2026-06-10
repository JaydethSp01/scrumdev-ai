"use client";

import { useCallback, useRef, useState } from "react";
import { Bot, Send, Loader2, Paperclip, Rocket, User as UserIcon } from "lucide-react";
import http from "@/lib/http";
import { apiVisionFromDocument, apiStartLifecycle } from "@/lib/api";

type Msg = { role: "agent" | "user"; text: string };

/**
 * Chat conversacional como mecanismo PRINCIPAL de captura de requerimientos
 * (Taller 4 A/I): el PO escribe requerimientos como texto libre o sube un
 * documento; el agente los registra (visión) y ofrece iniciar el ciclo de vida.
 * Usa el cliente Axios centralizado (`http`).
 */
export default function RequirementsChat({
  projectKey,
  onCaptured,
}: {
  projectKey: string;
  onCaptured?: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "agent",
      text:
        "¡Hola! Soy el PO Agent. Cuéntame en tus palabras qué quieres construir " +
        "(o sube un documento de requerimientos). Con eso genero el Product Backlog " +
        "y arrancamos el ciclo de vida — tú apruebas cada fase.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const push = (m: Msg) => setMsgs((prev) => [...prev, m]);

  const sendRequirements = useCallback(
    async (text: string) => {
      const vision = text.trim();
      if (!vision) return;
      push({ role: "user", text: vision });
      setInput("");
      setBusy(true);
      try {
        // Cliente Axios centralizado (Taller 4 I).
        await http.post(`/projects/${encodeURIComponent(projectKey)}/vision`, {
          project_key: projectKey,
          vision,
        });
        setCaptured(true);
        push({
          role: "agent",
          text:
            "Registré tus requerimientos. Al iniciar el ciclo, el PO Agent genera " +
            "las historias con criterios de aceptación y se detiene para que apruebes " +
            "el Product Backlog. ¿Arrancamos?",
        });
        onCaptured?.();
      } catch {
        push({ role: "agent", text: "No pude registrar los requerimientos. Intenta de nuevo." });
      } finally {
        setBusy(false);
      }
    },
    [projectKey, onCaptured]
  );

  const onUpload = useCallback(
    async (file: File) => {
      push({ role: "user", text: `📄 ${file.name}` });
      setBusy(true);
      try {
        const ext = await apiVisionFromDocument(file);
        push({
          role: "agent",
          text: `Leí el documento. Resumen: ${ext.summary || ext.vision.slice(0, 160)}…`,
        });
        await sendRequirements(ext.vision);
      } catch {
        push({ role: "agent", text: "No pude leer el documento. Prueba con PDF, Word o TXT." });
      } finally {
        setBusy(false);
      }
    },
    [sendRequirements]
  );

  const startLifecycle = useCallback(async () => {
    setStarting(true);
    try {
      await apiStartLifecycle(projectKey);
      push({
        role: "agent",
        text: "🚀 Ciclo iniciado. Ve al tab Pipeline: generaré el backlog y me detendré para que apruebes.",
      });
    } finally {
      setStarting(false);
    }
  }, [projectKey]);

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex flex-col h-[520px]">
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand/10 text-brand"><Bot size={16} /></span>
        <div>
          <div className="text-sm font-semibold">Captura de requerimientos</div>
          <div className="text-[11px] text-neutral-500">Conversa con el PO Agent</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span className={`grid place-items-center w-7 h-7 rounded-full shrink-0 ${m.role === "agent" ? "bg-brand/10 text-brand" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-500"}`}>
              {m.role === "agent" ? <Bot size={14} /> : <UserIcon size={14} />}
            </span>
            <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${m.role === "agent" ? "bg-neutral-100 dark:bg-neutral-900" : "bg-brand text-white"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2 items-center text-neutral-400 text-sm">
            <Loader2 size={14} className="animate-spin" /> Procesando…
          </div>
        )}
        {captured && (
          <div className="pl-9">
            <button
              onClick={() => void startLifecycle()}
              disabled={starting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-brand to-fuchsia-500 text-white text-sm font-medium shadow disabled:opacity-60"
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              Iniciar ciclo de vida
            </button>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }}
        />
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="p-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900" title="Subir documento">
          <Paperclip size={16} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendRequirements(input); } }}
          placeholder="Escribe tus requerimientos…"
          disabled={busy}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent"
        />
        <button onClick={() => void sendRequirements(input)} disabled={busy || !input.trim()} className="p-2 rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
