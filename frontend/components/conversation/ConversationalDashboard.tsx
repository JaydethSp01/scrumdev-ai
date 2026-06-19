"use client";

import { useState } from "react";
import { MessageSquare, Workflow, Bot, Gavel } from "lucide-react";
import type { AuthUser } from "@/app/auth/_lib";
import ConversationCenter from "@/components/conversation/ConversationCenter";
import LiveContextPanel from "@/components/conversation/LiveContextPanel";
import AgentTracePanel from "@/components/conversation/AgentTracePanel";
import DecisionsPanel from "@/components/DecisionsPanel";

type Panel = "flujos" | "agentes" | "decisiones";

const NAV: { key: Panel; label: string; icon: typeof Workflow }[] = [
  { key: "flujos", label: "Flujos", icon: Workflow },
  { key: "agentes", label: "Agentes", icon: Bot },
  { key: "decisiones", label: "Decisiones", icon: Gavel },
];

export default function ConversationalDashboard({
  projectKey,
  user,
}: {
  projectKey: string;
  user: AuthUser;
}) {
  const [panel, setPanel] = useState<Panel>("flujos");

  return (
    <div className="flex h-[calc(100vh-124px)] min-h-[600px] rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950 shadow-sm">
      {/* Riel izquierdo mínimo: el chat es el protagonista */}
      <nav className="w-14 sm:w-40 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex flex-col py-2">
        <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 text-sm text-brand font-semibold">
          <MessageSquare size={17} className="shrink-0" />
          <span className="hidden sm:inline">Chat</span>
        </div>
        <div className="px-3 sm:px-4 pt-2 pb-1 text-[9px] uppercase tracking-wider text-neutral-400 hidden sm:block">Contexto en vivo</div>
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => setPanel(n.key)}
            className={`flex items-center gap-2.5 px-3 sm:px-4 py-2.5 text-sm transition ${
              panel === n.key
                ? "text-brand bg-brand/10 border-r-2 border-brand font-medium"
                : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <n.icon size={16} className="shrink-0" />
            <span className="hidden sm:inline">{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Centro: el CHAT (espina dorsal) */}
      <div className="flex-1 min-w-0 border-r border-neutral-200 dark:border-neutral-800">
        <ConversationCenter projectKey={projectKey} userId={user.user_id} />
      </div>

      {/* Derecha: contexto en vivo, solo-lectura (WebSocket) */}
      <aside className="w-[340px] xl:w-[400px] shrink-0 overflow-y-auto p-5 bg-neutral-50/50 dark:bg-neutral-900/30 hidden lg:block">
        {panel === "flujos" && <LiveContextPanel projectKey={projectKey} />}
        {panel === "agentes" && <AgentTracePanel projectKey={projectKey} />}
        {panel === "decisiones" && <DecisionsPanel projectKey={projectKey} user={user} />}
      </aside>
    </div>
  );
}
