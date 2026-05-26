"use client";

import { Bot, Sparkles } from "lucide-react";

export type Agent = {
  name: string;
  role?: string;
  description?: string;
  provider?: string;
  model?: string;
};

const ROLE_GRADIENT: Record<string, string> = {
  po_agent: "from-fuchsia-500 to-pink-500",
  architect_agent: "from-cyan-500 to-blue-500",
  developer_agent: "from-emerald-500 to-teal-500",
  qa_agent: "from-amber-500 to-orange-500",
  security_agent: "from-red-500 to-rose-500",
};

const ROLE_LABEL: Record<string, string> = {
  po_agent: "Product Owner",
  architect_agent: "Arquitecto",
  developer_agent: "Developer",
  qa_agent: "QA",
  security_agent: "Security",
};

export function AgentCard({ agent }: { agent: Agent }) {
  const gradient = ROLE_GRADIENT[agent.name] || "from-brand to-fuchsia-500";
  const label = ROLE_LABEL[agent.name] || agent.role || agent.name;
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 bg-white dark:bg-neutral-950 hover:border-brand/40 hover:shadow-md transition">
      <div className="flex items-start gap-3">
        <span className={`grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} text-white shrink-0 shadow-md`}>
          <Bot size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{label}</p>
          <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
            {agent.name}
          </p>
          {agent.description && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 line-clamp-2">
              {agent.description}
            </p>
          )}
          {(agent.provider || agent.model) && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {agent.provider && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800">
                  <Sparkles size={10} />
                  {agent.provider}
                </span>
              )}
              {agent.model && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-brand/10 text-brand border border-brand/20">
                  {agent.model}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentCard;
