"use client";

/**
 * Feedback de despliegue para el CLIENTE FINAL: lenguaje humano, animado y
 * moderno. Explica en cada momento qué se está haciendo, sin jerga técnica.
 *
 * Accesible: aria-live="polite" anuncia cada cambio de fase a lectores de
 * pantalla; el progreso tiene role="progressbar" con aria-valuenow; respeta
 * prefers-reduced-motion (sin animaciones); contraste AA.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  PackageCheck,
  ShieldCheck,
  Globe,
  PartyPopper,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { DeployStage } from "@/components/DeployFlowDiagram";

type Props = {
  stage: DeployStage;
  vercelUrl?: string;
  renderUrl?: string;
  errorMessage?: string;
};

type Phase = {
  key: string;
  // stages que pertenecen a esta fase
  stages: DeployStage[];
  title: string;
  hint: string;
  icon: typeof Sparkles;
};

const PHASES: Phase[] = [
  {
    key: "prepare",
    stages: ["generating_code"],
    title: "Preparando tu aplicación",
    hint: "Empaquetamos todo el código de tu sistema.",
    icon: PackageCheck,
  },
  {
    key: "secure",
    stages: ["pushing_git"],
    title: "Guardando tu código de forma segura",
    hint: "Lo subimos a un repositorio privado para tenerlo siempre a salvo.",
    icon: ShieldCheck,
  },
  {
    key: "publish",
    stages: ["creating_vercel", "building_vercel", "configuring_db"],
    title: "Publicando en internet",
    hint: "Construimos y conectamos tu app para que cualquiera pueda usarla.",
    icon: Globe,
  },
];

function phaseIndexForStage(stage: DeployStage): number {
  const idx = PHASES.findIndex((p) => p.stages.includes(stage));
  if (stage === "ready") return PHASES.length; // todo hecho
  return idx < 0 ? 0 : idx;
}

export function DeployProgress({ stage, vercelUrl, renderUrl, errorMessage }: Props) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const isError = stage === "error";
  const isReady = stage === "ready";
  const liveUrl = renderUrl || vercelUrl || "";

  const activeIdx = phaseIndexForStage(stage);
  // progreso 0..100 (suave): cada fase aporta su tramo
  const pct = useMemo(() => {
    if (isReady) return 100;
    if (isError) return Math.min(((activeIdx + 0.5) / PHASES.length) * 100, 95);
    return Math.min(((activeIdx + 0.5) / PHASES.length) * 100, 95);
  }, [activeIdx, isReady, isError]);

  // mensaje en vivo para lectores de pantalla
  const liveMsg = isReady
    ? "Tu aplicación ya está en vivo en internet."
    : isError
    ? "Ocurrió un problema durante la publicación."
    : `${PHASES[activeIdx]?.title ?? "Publicando"}. Paso ${activeIdx + 1} de ${PHASES.length}.`;

  if (isError) {
    return (
      <section
        className="rounded-2xl border border-red-500/30 bg-red-50/60 dark:bg-red-950/20 p-6 text-center"
        aria-live="assertive"
      >
        <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-red-500/15 text-red-600 dark:text-red-300">
          <AlertTriangle size={24} aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold mt-4">No pudimos publicar tu app esta vez</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 max-w-md mx-auto">
          No te preocupes, tu código está a salvo. Puedes reintentar el
          despliegue; normalmente funciona al segundo intento.
        </p>
        {errorMessage && (
          <p className="text-[11px] text-neutral-500 mt-3 font-mono break-all max-w-md mx-auto">
            {errorMessage}
          </p>
        )}
      </section>
    );
  }

  if (isReady) {
    return (
      <section
        className="relative rounded-2xl border border-green-500/30 bg-gradient-to-b from-green-50 to-white dark:from-green-950/30 dark:to-neutral-950 p-8 text-center overflow-hidden"
        aria-live="polite"
      >
        {!reduce && <Confetti />}
        <div className="relative grid place-items-center w-16 h-16 mx-auto rounded-2xl bg-green-500/15 text-green-600 dark:text-green-300">
          <PartyPopper size={28} aria-hidden="true" />
        </div>
        <h3 className="text-2xl font-bold tracking-tight mt-4">
          ¡Tu aplicación está en vivo! 🎉
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 max-w-md mx-auto">
          Ya está publicada en internet y lista para compartir con quien quieras.
        </p>
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 transition"
          >
            <Globe size={16} aria-hidden="true" /> Abrir mi aplicación
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </section>
    );
  }

  // en progreso
  const ActiveIcon = PHASES[activeIdx]?.icon ?? Sparkles;
  return (
    <section
      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6"
      aria-live="polite"
    >
      <div className="flex items-center gap-4">
        <div className="relative grid place-items-center w-14 h-14 rounded-2xl bg-brand/10 text-brand shrink-0">
          {!reduce && (
            <span className="absolute inset-0 rounded-2xl bg-brand/20 animate-ping" aria-hidden="true" />
          )}
          <ActiveIcon size={24} aria-hidden="true" className="relative" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">
            {PHASES[activeIdx]?.title}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
            {PHASES[activeIdx]?.hint}
          </p>
        </div>
      </div>

      {/* barra de progreso */}
      <div
        className="mt-5 h-2.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso del despliegue"
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r from-brand to-fuchsia-500 ${
            reduce ? "" : "transition-[width] duration-700 ease-out"
          } ${reduce ? "" : "animate-pulse"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* pasos */}
      <ol className="mt-5 space-y-2.5">
        {PHASES.map((p, idx) => {
          const done = idx < activeIdx;
          const active = idx === activeIdx;
          const Icon = p.icon;
          return (
            <li key={p.key} className="flex items-center gap-3">
              <span
                className={`grid place-items-center w-7 h-7 rounded-lg shrink-0 transition ${
                  done
                    ? "bg-green-500/15 text-green-600 dark:text-green-300"
                    : active
                    ? "bg-brand/15 text-brand"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                }`}
              >
                {active && !reduce ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : done ? (
                  <ShieldCheck size={14} aria-hidden="true" />
                ) : (
                  <Icon size={14} aria-hidden="true" />
                )}
              </span>
              <span
                className={`text-sm ${
                  active
                    ? "font-medium text-neutral-900 dark:text-neutral-100"
                    : done
                    ? "text-neutral-500 line-through decoration-neutral-300"
                    : "text-neutral-500"
                }`}
              >
                {p.title}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-[11px] text-neutral-500 mt-5 text-center">
        Esto suele tardar menos de un minuto. Puedes quedarte en esta pantalla.
      </p>

      {/* mensaje accesible (no visible, anunciado a lectores de pantalla) */}
      <span className="sr-only">{liveMsg}</span>
    </section>
  );
}

/** Confeti CSS puro (decorativo) para el momento de éxito. */
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: (i * 37) % 100,
      delay: (i % 7) * 0.18,
      hue: (i * 53) % 360,
      dur: 2.4 + ((i % 5) * 0.4),
    }))
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // limpia la animación tras unos segundos para no consumir CPU
    const el = ref.current;
    const t = setTimeout(() => el?.style && (el.style.display = "none"), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            top: -12,
            left: `${p.left}%`,
            width: 8,
            height: 8,
            background: `hsl(${p.hue} 90% 60%)`,
            borderRadius: 2,
            animation: `sd-confetti ${p.dur}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
      <style>{`@keyframes sd-confetti{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(360px) rotate(540deg);opacity:0}}`}</style>
    </div>
  );
}

export default DeployProgress;
