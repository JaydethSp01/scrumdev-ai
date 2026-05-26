"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Trash2,
  Loader2,
  Sparkles,
  Bot,
  User as UserIcon,
  Code2,
  Paperclip,
  X,
  Image as ImageIcon,
  AlertTriangle,
} from "lucide-react";
import {
  apiAssistant,
  apiUploadChatImage,
  type AssistantAction,
  type ChatImageUpload,
} from "@/lib/api";
import {
  clearChatThread,
  fetchChatThread,
  loadCachedThread,
  saveCachedThread,
  type ChatMessage,
} from "@/lib/chat";
import type { AuthUser } from "@/app/auth/_lib";
import { ToastStack, useToasts } from "@/components/Toast";

type Props = {
  projectKey: string;
  user: AuthUser;
};

type Suggestion = {
  label: string;
  prompt: string;
};

const SUGGESTIONS: Suggestion[] = [
  {
    label: "Resume el estado del proyecto",
    prompt: "Resume el estado actual del proyecto.",
  },
  {
    label: "Genera el codigo de la historia mas prioritaria",
    prompt: "Genera el codigo de la historia mas prioritaria del backlog.",
  },
  {
    label: "Que historias me faltan completar",
    prompt: "Que historias me faltan completar?",
  },
  {
    label: "Explica la arquitectura propuesta",
    prompt: "Explica la arquitectura propuesta del sistema.",
  },
];

type Attachment = {
  preview: string;
  upload?: ChatImageUpload;
  uploading: boolean;
  error?: string;
  file: File;
};

type ExtendedMessage = ChatMessage & {
  action?: AssistantAction;
};

function isExtended(m: ChatMessage): m is ExtendedMessage {
  return (
    typeof (m as ExtendedMessage).action !== "undefined" ||
    typeof (m as ChatMessage).imageUrls !== "undefined"
  );
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_BYTES = 10 * 1024 * 1024;

export function ProjectChat({ projectKey, user }: Props) {
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toasts = useToasts();

  // Carga inicial: primero cache local (instantanea), despues backend (autoritativo)
  useEffect(() => {
    const cached = loadCachedThread(projectKey, user.user_id) as ExtendedMessage[];
    if (cached.length > 0) setMessages(cached);
    let cancelled = false;
    void fetchChatThread(projectKey, user.user_id).then((remote) => {
      if (!cancelled) setMessages(remote as ExtendedMessage[]);
    });
    return () => {
      cancelled = true;
    };
  }, [projectKey, user.user_id]);

  // Persistimos cache local de respaldo (el backend es la fuente de verdad)
  useEffect(() => {
    saveCachedThread(projectKey, user.user_id, messages);
  }, [projectKey, user.user_id, messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  function genId() {
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toasts.error(`Tipo no soportado: ${file.name}`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toasts.error(`${file.name} excede 10MB`);
        continue;
      }
      const preview = URL.createObjectURL(file);
      const att: Attachment = { preview, uploading: true, file };
      setAttachments((prev) => [...prev, att]);
      try {
        const up = await apiUploadChatImage(projectKey, file);
        setAttachments((prev) =>
          prev.map((a) =>
            a === att ? { ...a, uploading: false, upload: up } : a
          )
        );
      } catch (e) {
        setAttachments((prev) =>
          prev.map((a) =>
            a === att
              ? {
                  ...a,
                  uploading: false,
                  error: e instanceof Error ? e.message : String(e),
                }
              : a
          )
        );
      }
    }
  }

  function removeAttachment(att: Attachment) {
    URL.revokeObjectURL(att.preview);
    setAttachments((prev) => prev.filter((a) => a !== att));
  }

  async function send(text: string) {
    const content = text.trim();
    const readyAttachments = attachments.filter((a) => a.upload && !a.error);
    if ((!content && readyAttachments.length === 0) || loading) return;

    const userMsg: ExtendedMessage = {
      id: genId(),
      role: "user",
      content: content || "(imagen adjunta)",
      createdAt: new Date().toISOString(),
      imageUrls: readyAttachments.map((a) => a.upload!.url),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    // Limpiar previews y attachments enviados
    attachments.forEach((a) => URL.revokeObjectURL(a.preview));
    setAttachments([]);
    setLoading(true);
    try {
      const data = await apiAssistant(projectKey, {
        user_id: user.user_id,
        message: content || "Mira las imagenes que te adjunte y dime que opinas.",
        image_paths: readyAttachments.map((a) => a.upload!.fs_path),
        image_urls: readyAttachments.map((a) => a.upload!.url),
      });
      const replyText = data.reply || "Sin respuesta del asistente.";
      const assistantMsg: ExtendedMessage = {
        id: genId(),
        role: "assistant",
        content: replyText,
        createdAt: new Date().toISOString(),
        action: data.action,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (data.action && data.action.type === "generate_code") {
        const sk = data.action.story_key || "historia";
        toasts.info(`Generando codigo para ${sk}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: "assistant",
          content: `Error: ${msg}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit() {
    void send(input);
  }

  function clickSuggestion(s: Suggestion) {
    setInput(s.prompt);
    void send(s.prompt);
  }

  async function clearConversation() {
    if (!confirm("Limpiar toda la conversacion de este proyecto?")) return;
    await clearChatThread(projectKey, user.user_id);
    setMessages([]);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      e.preventDefault();
      void handleFiles(items);
    }
  }

  const isEmpty = useMemo(
    () => messages.length === 0 && !loading,
    [messages, loading]
  );

  const anyUploading = attachments.some((a) => a.uploading);
  const canSend =
    !loading &&
    !anyUploading &&
    (input.trim().length > 0 || attachments.some((a) => a.upload && !a.error));

  return (
    <div
      className="relative flex flex-col h-[calc(100vh-12rem)] min-h-[480px] border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-950 overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-brand/10 backdrop-blur-sm border-2 border-dashed border-brand rounded-xl pointer-events-none">
          <div className="text-center">
            <ImageIcon size={32} className="mx-auto text-brand" />
            <p className="text-sm font-semibold mt-2 text-brand">
              Suelta tu imagen aqui
            </p>
            <p className="text-xs text-brand/70 mt-1">PNG, JPG, WEBP - max 10MB</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 p-3">
        <div className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-fuchsia-500 text-white shadow-md shadow-brand/30">
          <Sparkles size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">
            Asistente del proyecto
          </p>
          <p className="text-xs text-neutral-500">
            Adjunta imagenes (capturas/mockups) y dale feedback visual.
          </p>
        </div>
        <button
          onClick={clearConversation}
          disabled={messages.length === 0}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40"
        >
          <Trash2 size={14} /> Limpiar
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {isEmpty && (
          <div className="h-full grid place-items-center">
            <div className="text-center max-w-md space-y-3">
              <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-brand/10 text-brand">
                <Bot size={26} />
              </div>
              <h3 className="font-semibold text-lg">
                Conversemos sobre tu proyecto
              </h3>
              <p className="text-sm text-neutral-500">
                Escribe libremente o arrastra una imagen para dar feedback visual.
                El asistente conoce tu vision, backlog, arquitectura y codigo.
              </p>
              <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-400">
                <Paperclip size={11} /> Tip: pega un screenshot con Ctrl+V
              </div>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
          >
            {m.role === "assistant" && (
              <div className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-brand/15 text-brand">
                <Bot size={16} />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-gradient-to-br from-brand to-fuchsia-600 text-white rounded-br-md shadow-lg shadow-brand/20"
                  : "bg-neutral-100 dark:bg-neutral-900 rounded-bl-md"
              }`}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider opacity-70 mb-1">
                <span>{m.role === "user" ? "Tu" : "Asistente"}</span>
                <span>-</span>
                <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
              </div>
              {isExtended(m) && m.imageUrls && m.imageUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 mb-2 max-w-xs">
                  {m.imageUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden border border-white/20 hover:opacity-90 transition"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`adjunto ${i + 1}`} className="w-full h-24 object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <PlainText text={m.content} />
              {isExtended(m) &&
                m.action &&
                m.action.type === "generate_code" && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand/15 text-brand text-xs font-medium border border-brand/30">
                    <Code2 size={12} />
                    Generando codigo para {m.action.story_key || "historia"}
                  </div>
                )}
            </div>
            {m.role === "user" && (
              <div className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-800">
                <UserIcon size={16} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-brand/15 text-brand">
              <Bot size={16} />
            </div>
            <div className="bg-neutral-100 dark:bg-neutral-900 rounded-2xl rounded-bl-md px-4 py-3">
              <p className="text-sm inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                <Loader2 size={14} className="animate-spin text-brand" />
                El asistente esta analizando...
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="relative group rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.preview}
                  alt={att.file.name}
                  className="w-16 h-16 object-cover"
                />
                {att.uploading && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40">
                    <Loader2 size={16} className="animate-spin text-white" />
                  </div>
                )}
                {att.error && (
                  <div className="absolute inset-0 grid place-items-center bg-red-600/70" title={att.error}>
                    <AlertTriangle size={16} className="text-white" />
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(att)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                  aria-label="Quitar"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => clickSuggestion(s)}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-brand/10 hover:border-brand hover:text-brand transition disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="grid place-items-center w-10 h-10 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-brand/10 hover:border-brand hover:text-brand transition disabled:opacity-50"
            title="Adjuntar imagen"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            onPaste={onPaste}
            placeholder="Escribe tu mensaje o pega/arrastra una imagen... (Ctrl/Cmd + Enter para enviar)"
            rows={2}
            className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
          <button
            onClick={submit}
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-brand to-fuchsia-500 text-white rounded-lg hover:opacity-95 transition disabled:opacity-50 disabled:from-neutral-400 disabled:to-neutral-400 font-medium shadow-md shadow-brand/20"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            Enviar
          </button>
        </div>
      </div>

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function PlainText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="text-sm leading-relaxed space-y-1">
      {lines.map((raw, idx) => {
        const line = raw.replace(/\s+$/, "");
        if (line.trim().startsWith("- ")) {
          const content = line.trim().slice(2);
          return (
            <div key={idx} className="flex gap-2 pl-1">
              <span className="text-brand mt-1.5 w-1 h-1 rounded-full bg-current shrink-0" />
              <span className="flex-1 whitespace-pre-wrap">{content}</span>
            </div>
          );
        }
        if (line.length === 0) {
          return <div key={idx} className="h-1.5" />;
        }
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export default ProjectChat;
