"use client";

import { useState } from "react";
import {
  MessageSquare, Workflow, Bot, Gavel, SlidersHorizontal, Settings2,
} from "lucide-react";
import type { AuthUser } from "@/app/auth/_lib";
import ConversationCenter from "@/components/conversation/ConversationCenter";
import PipelinePanel from "@/components/PipelinePanel";
import AgentsPanel from "@/components/AgentsPanel";
import DecisionsPanel from "@/components/DecisionsPanel";
import NFRForm from "@/components/NFRForm";

type Panel = "workflows" | "agents" | "approvals" | "nfr";

const NAV: { key: Panel; label: string; icon: typeof Workflow }[] = [
  { key: "workflows", label: "Workflows", icon: Workflow },
  { key: "agents", label: "Agentes", icon: Bot },
  { key: "approvals", label: "Aprobaciones", icon: Gavel },
  { key: "nfr", label: "NFR", icon: SlidersHorizontal },
];

export default function ConversationalDashboard({
  projectKey,
  user,
  onOpenAdvanced,
}: {
  projectKey: string;
  user: AuthUser;
  onOpenAdvanced?: () => void;
}) {
  const [panel, setPanel] = useState<Panel>("workflows");
  const [, setState] = useState("BACKLOG");

  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[560px] rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950">
      {/* Rail izquierdo: navegación (chat es el protagonista, lo demás apoyo) */}
      <nav className="w-16 sm:w-44 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex flex-col py-3">
        <RailItem active label="Chat" icon={MessageSquare} highlight />
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-400 hidden sm:block">Paneles de apoyo</div>
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => setPanel(n.key)}
            className={`flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm transition ${
              panel === n.key
                ? "text-brand bg-brand/10 border-r-2 border-brand font-medium"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <n.icon size={17} className="shrink-0" />
            <span className="hidden sm:inline">{n.label}</span>
          </button>
        ))}
        <div className="mt-auto">
          {onOpenAdvanced && (
            <button
              onClick={onOpenAdvanced}
              className="flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 w-full"
            >
              <Settings2 size={17} className="shrink-0" />
              <span className="hidden sm:inline">Avanzado</span>
            </button>
          )}
        </div>
      </nav>

      {/* Centro: el CHAT (protagonista) */}
      <div className="flex-1 min-w-0 border-r border-neutral-200 dark:border-neutral-800">
        <ConversationCenter projectKey={projectKey} onState={setState} />
      </div>

      {/* Derecha: panel de apoyo activo */}
      <aside className="w-[340px] xl:w-[400px] shrink-0 overflow-y-auto p-4 bg-neutral-50/50 dark:bg-neutral-900/30 hidden lg:block">
        {panel === "workflows" && <PipelinePanel projectKey={projectKey} />}
        {panel === "agents" && <AgentsPanel />}
        {panel === "approvals" && <DecisionsPanel projectKey={projectKey} user={user} />}
        {panel === "nfr" && <NFRForm projectKey={projectKey} user={user} />}
      </aside>
    </div>
  );
}

function RailItem({
  label, icon: Icon, active, highlight,
}: { label: string; icon: typeof Workflow; active?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm ${
      highlight ? "text-brand font-semibold" : "text-neutral-600 dark:text-neutral-400"
    } ${active ? "" : ""}`}>
      <Icon size={17} className="shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
