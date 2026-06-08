"use client";

import { useEffect, useState } from "react";
import { apiGetTemplates, TemplateCard, TemplatesResponse } from "@/lib/api";

/**
 * Galería de plantillas 1A (como Vercel/Framer): el usuario describe su software,
 * le mostramos las plantillas que matchean su sector con una IMAGEN de preview, y
 * elige una (rápido) o "desde cero" (a medida, tarda más). Guía visual total.
 */
export default function TemplateGallery({
  projectKey,
  onPick,
  onFromScratch,
}: {
  projectKey: string;
  onPick: (template: TemplateCard) => void;
  onFromScratch: () => void;
}) {
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PER_PAGE = 9;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGetTemplates(projectKey, 50)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectKey]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        No se pudo cargar la galería ({error}). Puedes continuar creando tu app a
        medida.
        <div className="mt-4">
          <button
            onClick={onFromScratch}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Crear desde cero
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Elige un punto de partida
        </h2>
        <p className="mt-1 text-neutral-500">
          Plantillas profesionales que encajan con lo que describiste. Elige una
          y la adaptamos a tu negocio (~{data.template_eta_minutes} min), o créala
          a medida desde cero.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.templates.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((t) => (
          <button
            key={t.id}
            onClick={() => setSelected(t.id)}
            className={`group overflow-hidden rounded-2xl border bg-white text-left transition hover:shadow-md dark:bg-neutral-900 ${
              selected === t.id
                ? "border-neutral-900 ring-2 ring-neutral-900 dark:border-white dark:ring-white"
                : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            <div
              className="relative aspect-[16/10] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800"
              style={{ backgroundColor: t.brand_color + "14" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.preview_url}
                alt={t.name}
                className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <span
                className="absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: t.brand_color }}
              >
                {t.sector_label}
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t.name}</h3>
                <span className="text-xs text-neutral-400">
                  {Math.round(Math.min(100, t.match_score * 7))}% match
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                {t.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {data.templates.length > PER_PAGE ? (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            ← Anterior
          </button>
          <span className="text-sm text-neutral-500">
            Página {page + 1} de {Math.ceil(data.templates.length / PER_PAGE)} ·{" "}
            {data.templates.length} plantillas
          </span>
          <button
            onClick={() =>
              setPage((p) =>
                Math.min(Math.ceil(data.templates.length / PER_PAGE) - 1, p + 1)
              )
            }
            disabled={page >= Math.ceil(data.templates.length / PER_PAGE) - 1}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Siguiente →
          </button>
        </div>
      ) : null}

      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-dashed border-neutral-300 p-5 dark:border-neutral-700 sm:flex-row">
        <div>
          <p className="font-semibold">{data.from_scratch.label}</p>
          <p className="text-sm text-neutral-500">
            {data.from_scratch.description} (~{data.from_scratch.eta_minutes} min)
          </p>
        </div>
        <button
          onClick={onFromScratch}
          className="shrink-0 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Crear a medida
        </button>
      </div>

      {selected ? (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
          <span className="text-sm text-neutral-500">
            Plantilla seleccionada:{" "}
            <strong>
              {data.templates.find((t) => t.id === selected)?.name}
            </strong>
          </span>
          <button
            onClick={() => {
              const t = data.templates.find((x) => x.id === selected);
              if (t) onPick(t);
            }}
            className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-neutral-900"
          >
            Usar esta plantilla →
          </button>
        </div>
      ) : null}
    </div>
  );
}
