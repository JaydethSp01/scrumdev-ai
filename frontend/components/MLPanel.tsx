// Replanteado: se reactivara como Personalizacion Adaptativa (aprendizaje profundo del estilo del cliente para mejorar generacion).
"use client";

import { useState } from "react";
import { analyzeStory, type FullAnalysis } from "@/lib/ml";
import { AlertTriangle, BarChart3, Brain, Loader2, Tag, Target } from "lucide-react";

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
};

const RISK_LABEL: Record<string, string> = {
  minimal: "minimo",
  low: "bajo",
  medium: "medio",
  high: "alto",
};

function Bar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden">
      <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function MLPanel() {
  const [text, setText] = useState("");
  const [data, setData] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeStory(text);
      setData(result);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-5 h-5 text-brand" />
          <h2 className="text-lg font-semibold">Analisis ML de historias</h2>
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          Embeddings locales (sentence-transformers). Clasifica tipo y area,
          estima esfuerzo y detecta riesgos sin LLM ni API externa.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pega aqui una historia o requerimiento (Cmd/Ctrl+Enter para analizar)..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
          }}
          rows={5}
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm resize-none"
        />
        <button
          onClick={run}
          disabled={loading || !text.trim()}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-md hover:bg-brand-dark transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          Analizar
        </button>
        {error && (
          <p className="text-sm text-red-500 mt-2">{error}</p>
        )}
      </div>

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
            <header className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand" />
              <h3 className="font-semibold">Clasificacion</h3>
            </header>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Tipo</p>
              <p className="text-lg font-mono">{data.classification.type}</p>
              <Bar value={data.classification.type_confidence} />
              <p className="text-xs text-neutral-500 mt-1">
                confianza {(data.classification.type_confidence * 100).toFixed(1)}%
              </p>
            </div>
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Area</p>
              <p className="text-lg font-mono">{data.classification.area}</p>
              <Bar value={data.classification.area_confidence} />
              <p className="text-xs text-neutral-500 mt-1">
                confianza {(data.classification.area_confidence * 100).toFixed(1)}%
              </p>
            </div>
            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer">top 3</summary>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <p className="font-semibold">Tipo</p>
                  {data.classification.type_top3.map((t) => (
                    <p key={t.label} className="font-mono">
                      {t.label}: {(t.score * 100).toFixed(0)}%
                    </p>
                  ))}
                </div>
                <div>
                  <p className="font-semibold">Area</p>
                  {data.classification.area_top3.map((t) => (
                    <p key={t.label} className="font-mono">
                      {t.label}: {(t.score * 100).toFixed(0)}%
                    </p>
                  ))}
                </div>
              </div>
            </details>
          </section>

          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
            <header className="flex items-center gap-2">
              <Target className="w-4 h-4 text-brand" />
              <h3 className="font-semibold">Esfuerzo estimado</h3>
            </header>
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-bold text-brand">{data.effort.story_points}</p>
              <p className="text-sm text-neutral-500">story points</p>
            </div>
            <p className="text-sm">
              Patron: <span className="font-mono">{data.effort.pattern}</span>{" "}
              <span className="text-xs text-neutral-500">
                ({(data.effort.pattern_confidence * 100).toFixed(0)}%)
              </span>
            </p>
            <p className="text-sm">
              Rango horas:{" "}
              <span className="font-mono">
                {data.effort.estimated_hours_range[0]} - {data.effort.estimated_hours_range[1]}h
              </span>
            </p>
            <div className="text-xs space-y-1">
              <p className="text-neutral-500">Keywords detectadas:</p>
              {Object.entries(data.effort.matched_keywords).map(([bucket, words]) =>
                words.length ? (
                  <div key={bucket}>
                    <span className="font-semibold uppercase text-[10px]">{bucket}:</span>{" "}
                    <span className="font-mono">{words.join(", ")}</span>
                  </div>
                ) : null
              )}
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
            <header className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-brand" />
              <h3 className="font-semibold">Riesgos</h3>
            </header>
            <div
              className={`inline-block px-3 py-1 rounded text-sm border ${
                SEVERITY_COLOR[data.risks.overall_risk] ||
                "bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700"
              }`}
            >
              Nivel: {RISK_LABEL[data.risks.overall_risk] || data.risks.overall_risk} (
              score {data.risks.risk_score})
            </div>
            {data.risks.risks.length === 0 ? (
              <p className="text-sm text-neutral-500">No se detectaron riesgos relevantes.</p>
            ) : (
              <ul className="space-y-2">
                {data.risks.risks.map((r) => (
                  <li
                    key={r.type}
                    className={`text-xs border rounded p-2 ${
                      SEVERITY_COLOR[r.severity] ||
                      "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    <p className="font-semibold uppercase">{r.type}</p>
                    <p className="text-neutral-600 dark:text-neutral-400">{r.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {data && (
        <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 text-xs text-neutral-500 flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5" />
          Texto analizado: {data.effort.text_length_chars} chars - score riesgos{" "}
          {data.risks.risk_score} - keywords {data.effort.keyword_score}
        </div>
      )}
    </div>
  );
}
