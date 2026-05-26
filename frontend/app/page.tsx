"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Lightbulb,
  ListChecks,
  Layers,
  Code2,
  Rocket,
} from "lucide-react";
import { getCurrentUser } from "@/app/auth/_lib";

export default function HomePage() {
  const router = useRouter();
  const [hasUser, setHasUser] = useState<boolean | null>(null);

  useEffect(() => {
    setHasUser(!!getCurrentUser());
  }, []);

  function go() {
    if (hasUser) router.push("/projects");
    else router.push("/register");
  }

  const highlights = [
    {
      icon: ListChecks,
      title: "Backlog Scrum automatico",
      desc: "Historias de usuario refinadas con criterios de aceptacion claros y estimacion en story points.",
    },
    {
      icon: Code2,
      title: "Codigo real generado",
      desc: "Archivos de implementacion listos para tu stack, organizados por historia y revisados por policies.",
    },
    {
      icon: Layers,
      title: "Trazabilidad completa",
      desc: "Vision, ADRs, decisiones humanas y auditoria de cada agente, todo conectado por proyecto.",
    },
  ];

  const flow = [
    { icon: Lightbulb, label: "Idea" },
    { icon: ListChecks, label: "Backlog" },
    { icon: Layers, label: "Arquitectura" },
    { icon: Code2, label: "Codigo" },
    { icon: Rocket, label: "Deploy" },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-white to-brand/5 dark:from-neutral-950 dark:via-neutral-950 dark:to-brand/10">
      <header className="border-b border-neutral-200/70 dark:border-neutral-800/70">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 mr-auto">
            <span className="grid place-items-center w-8 h-8 rounded-md bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm">
              <Sparkles size={16} />
            </span>
            <span className="font-semibold tracking-tight">ScrumDev AI</span>
          </Link>
          <Link
            href="/login"
            className="text-sm px-3 py-1.5 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="text-sm px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand-dark transition"
          >
            Crear cuenta
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border border-brand/30 text-brand bg-brand/5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          Multiagentes Scrum + generacion de codigo
        </div>
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight mt-5 leading-[1.05] max-w-4xl">
          Genera tu sistema desde
          <br />
          una idea con{" "}
          <span className="bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
            agentes IA
          </span>
          .
        </h1>
        <p className="text-lg sm:text-xl text-neutral-600 dark:text-neutral-400 mt-6 max-w-2xl leading-relaxed">
          Describe tu producto en una frase y obten un backlog refinado,
          decisiones de arquitectura, archivos de codigo y trazabilidad
          completa, generados por una crew de agentes especializados.
        </p>
        <div className="flex flex-wrap gap-3 mt-9">
          <button
            onClick={go}
            disabled={hasUser === null}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand-dark transition font-medium shadow-sm disabled:opacity-60"
          >
            {hasUser ? "Ir a mis proyectos" : "Empezar gratis"}{" "}
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 sm:p-10 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-6">
            El flujo, end-to-end
          </p>
          <FlowDiagram steps={flow} />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20 grid sm:grid-cols-3 gap-4">
        {highlights.map((h) => {
          const Icon = h.icon;
          return (
            <div
              key={h.title}
              className="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 bg-white dark:bg-neutral-950 hover:border-brand/40 hover:shadow-sm transition"
            >
              <div className="grid place-items-center w-11 h-11 rounded-xl bg-brand/10 text-brand">
                <Icon size={20} />
              </div>
              <h3 className="font-semibold text-lg mt-4">{h.title}</h3>
              <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
                {h.desc}
              </p>
            </div>
          );
        })}
      </section>

      <footer className="border-t border-neutral-200 dark:border-neutral-800 mt-8">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={12} className="text-brand" /> ScrumDev AI
          </span>
          <span>Plataforma multiagente para construir software</span>
        </div>
      </footer>
    </main>
  );
}

type FlowStep = { icon: typeof Lightbulb; label: string };

function FlowDiagram({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox="0 0 760 140"
        className="w-full min-w-[680px] h-auto"
        aria-label="Flujo end to end"
      >
        <defs>
          <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5b6cff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#5b6cff" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {steps.map((s, i) => {
          const x = 60 + i * 165;
          const y = 70;
          const nextX = 60 + (i + 1) * 165;
          return (
            <g key={s.label}>
              {i < steps.length - 1 && (
                <line
                  x1={x + 36}
                  y1={y}
                  x2={nextX - 36}
                  y2={y}
                  stroke="url(#flowGrad)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={32}
                fill="white"
                stroke="#5b6cff"
                strokeOpacity={0.35}
                strokeWidth={1.5}
              />
              <foreignObject x={x - 16} y={y - 16} width={32} height={32}>
                <div className="w-8 h-8 grid place-items-center text-brand">
                  <s.icon size={20} strokeWidth={1.8} />
                </div>
              </foreignObject>
              <text
                x={x}
                y={y + 56}
                textAnchor="middle"
                fontSize={13}
                fontWeight={500}
                fill="currentColor"
                className="fill-neutral-700 dark:fill-neutral-300"
              >
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
