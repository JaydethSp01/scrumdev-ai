"use client";

import { useState } from "react";
import { X, Download, CheckCircle2, Lock, FileText, Table2, ShieldCheck } from "lucide-react";

export type ReviewStory = {
  story_key: string;
  title: string;
  description?: string;
  acceptance_criteria?: string[];
  story_points?: number;
  priority?: string;
  dor?: { ready: boolean; checks: { name: string; ok: boolean }[] };
  tech_tasks?: { module: string; title: string; depends_on?: string[] }[];
  mockup?: string;
};

function toMarkdown(stories: ReviewStory[], projectKey: string): string {
  const lines: string[] = [
    `# Product Backlog — ${projectKey}`,
    "",
    `Total: ${stories.length} historias · ${stories.reduce((a, s) => a + (s.story_points || 0), 0)} puntos`,
    "",
  ];
  for (const s of stories) {
    lines.push(`## ${s.story_key} — ${s.title}`);
    lines.push("");
    if (s.description) lines.push(s.description, "");
    lines.push(`- **Puntos:** ${s.story_points ?? "-"}  |  **Prioridad:** ${s.priority ?? "-"}  |  **DoR:** ${s.dor?.ready ? "✅ lista" : "⚠ incompleta"}`);
    if (s.acceptance_criteria?.length) {
      lines.push("", "**Criterios de aceptación:**");
      for (const c of s.acceptance_criteria) lines.push(`- [ ] ${c}`);
    }
    if (s.tech_tasks?.length) {
      lines.push("", "**Tareas técnicas:**");
      for (const t of s.tech_tasks) lines.push(`- (${t.module}) ${t.title}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function toCSV(stories: ReviewStory[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["story_key", "titulo", "descripcion", "criterios_aceptacion", "puntos", "prioridad", "dor_lista"].join(";"),
    ...stories.map((s) =>
      [
        esc(s.story_key), esc(s.title), esc(s.description),
        esc((s.acceptance_criteria || []).join(" | ")),
        s.story_points ?? "", esc(s.priority), s.dor?.ready ? "si" : "no",
      ].join(";")
    ),
  ];
  return "﻿" + rows.join("\n"); // BOM -> Excel abre con acentos OK
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Revisión COMPLETA del Product Backlog (Adam B): el PO ve cada historia entera
 * (descripción, criterios, puntos, DoR, tareas, mockup), puede DESCARGARLAS
 * (.md / .csv) y aprobar desde aquí. Todo lo necesario para validar.
 */
export default function BacklogReview({
  stories,
  projectKey,
  onApprove,
  onClose,
  busy,
}: {
  stories: ReviewStory[];
  projectKey: string;
  onApprove: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(stories[0]?.story_key ?? null);
  const totalPts = stories.reduce((a, s) => a + (s.story_points || 0), 0);
  const dorReady = stories.filter((s) => s.dor?.ready).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-3 sm:p-6 grid place-items-center">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold">Product Backlog — revisión completa</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {stories.length} historias · {totalPts} puntos · DoR {dorReady}/{stories.length}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => download(`backlog-${projectKey}.md`, toMarkdown(stories, projectKey), "text/markdown")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              title="Descargar como Markdown"
            >
              <FileText size={13} /> .md
            </button>
            <button
              onClick={() => download(`backlog-${projectKey}.csv`, toCSV(stories), "text/csv")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              title="Descargar como CSV (Excel)"
            >
              <Table2 size={13} /> .csv
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Historias */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {stories.map((s) => {
            const expanded = open === s.story_key;
            return (
              <div key={s.story_key} className={`rounded-xl border ${expanded ? "border-brand/40 bg-brand/5" : "border-neutral-200 dark:border-neutral-800"}`}>
                <button
                  onClick={() => setOpen(expanded ? null : s.story_key)}
                  className="w-full text-left px-4 py-3 flex items-center gap-2 flex-wrap"
                >
                  <span className="font-mono text-xs text-brand">{s.story_key}</span>
                  <span className="font-medium text-sm">{s.title}</span>
                  {s.dor && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${s.dor.ready ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                      {s.dor.ready ? <CheckCircle2 size={9} /> : <Lock size={9} />} DoR
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-neutral-500">
                    {s.priority && <span className="uppercase px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">{s.priority}</span>}
                    <span className="px-1.5 py-0.5 rounded bg-brand/10 text-brand">{s.story_points ?? "-"} pts</span>
                  </span>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {s.description && (
                      <p className="text-sm text-neutral-700 dark:text-neutral-300">{s.description}</p>
                    )}
                    {s.acceptance_criteria && s.acceptance_criteria.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Criterios de aceptación</p>
                        <ul className="space-y-1">
                          {s.acceptance_criteria.map((c, i) => (
                            <li key={i} className="text-sm flex gap-2 text-neutral-600 dark:text-neutral-300">
                              <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" /> {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {s.dor && (
                      <div className="flex flex-wrap gap-2">
                        {s.dor.checks.map((c, i) => (
                          <span key={i} className={`text-[11px] inline-flex items-center gap-1 ${c.ok ? "text-emerald-600" : "text-amber-600"}`}>
                            {c.ok ? <CheckCircle2 size={11} /> : <Lock size={11} />} {c.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.tech_tasks && s.tech_tasks.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Tareas técnicas</p>
                        <ul className="space-y-0.5">
                          {s.tech_tasks.map((t, i) => (
                            <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">
                              <span className="uppercase text-[9px] px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 mr-1.5">{t.module}</span>
                              {t.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {s.mockup && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Mockup</p>
                        <div className="max-w-md rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800"
                          dangerouslySetInnerHTML={{ __html: s.mockup }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer: aprobar desde la revisión */}
        <div className="px-5 py-3.5 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-3 shrink-0 bg-neutral-50 dark:bg-neutral-900/50">
          <p className="text-xs text-neutral-500 flex-1">
            Revisa cada historia (clic para expandir). Si todo está bien, aprueba aquí mismo.
          </p>
          <button
            onClick={onApprove}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-semibold shadow disabled:opacity-60"
          >
            <ShieldCheck size={15} /> Aprobar Product Backlog
          </button>
        </div>
      </div>
    </div>
  );
}
