"use client";

import { useEffect, useState } from "react";
import {
  Compass,
  Palette,
  Rocket,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Bot,
  Code2,
  Cloud,
} from "lucide-react";

type Step = {
  icon: typeof Compass;
  title: string;
  desc: string;
  example: string;
  iconBg: string;
};

const STEPS: Step[] = [
  {
    icon: Compass,
    title: "Define tu idea",
    desc: "Cuentale a la IA qué quieres construir y para quién.",
    example: "Ej: Marketplace de cafeterías para baristas freelance en Latam",
    iconBg: "from-brand to-fuchsia-500",
  },
  {
    icon: Palette,
    title: "Personaliza la marca",
    desc: "Colores, tipografía e imágenes. Tu app sale única, no genérica.",
    example: "Sube tu logo, escoge paleta café/ámbar, fuente Playfair Display",
    iconBg: "from-fuchsia-500 to-pink-500",
  },
  {
    icon: Rocket,
    title: "Click y se despliega",
    desc: "Agentes generan backlog Scrum, código, base de datos y publican online.",
    example: "Recibes URL pública con la app funcionando en 2-3 minutos",
    iconBg: "from-cyan-500 to-emerald-500",
  },
];

const FEATURES = [
  { icon: Bot, label: "Agentes IA Claude" },
  { icon: Code2, label: "Stack Next + FastAPI" },
  { icon: Cloud, label: "Deploy a Vercel" },
  { icon: CheckCircle2, label: "Postgres incluido" },
];

export function OnboardingHero({ onStart, userName }: { onStart: () => void; userName?: string }) {
  const [activeStep, setActiveStep] = useState(0);

  // Auto-advance del carousel para hint visual
  useEffect(() => {
    const t = setInterval(() => {
      setActiveStep((s) => (s + 1) % STEPS.length);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-brand/8 via-fuchsia-500/4 to-cyan-500/6 dark:from-brand/15 dark:via-fuchsia-500/8 dark:to-cyan-500/10 p-6 sm:p-10">
      <div className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full bg-brand/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-fuchsia-500/15 blur-3xl" />

      <div className="relative">
        {/* Hero header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 text-brand backdrop-blur">
            <Sparkles size={11} /> Empieza aqui
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mt-4 leading-tight">
            {userName ? (
              <>Hola <span className="bg-gradient-to-r from-brand to-fuchsia-500 bg-clip-text text-transparent">{userName}</span>, vamos a crear tu primera app</>
            ) : (
              <>De una idea a una <span className="bg-gradient-to-r from-brand to-fuchsia-500 bg-clip-text text-transparent">app online</span> en 3 pasos</>
            )}
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-3 max-w-lg mx-auto">
            No tienes que saber codigo. Tu cuentas que quieres construir y los agentes IA
            arman todo: backlog Scrum, codigo, base de datos y deploy a internet.
          </p>
        </div>

        {/* 3 steps interactivos */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = activeStep === i;
            return (
              <button
                key={s.title}
                onClick={() => setActiveStep(i)}
                className={`group relative text-left rounded-2xl border-2 transition-all duration-300 p-5 ${
                  isActive
                    ? "border-brand/60 bg-white dark:bg-neutral-900 shadow-2xl shadow-brand/20 scale-[1.02]"
                    : "border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/60 hover:border-brand/30"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br ${s.iconBg} text-white shadow-lg transition-transform ${
                      isActive ? "scale-110" : "scale-100"
                    }`}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Paso {i + 1}
                  </div>
                </div>
                <h3 className="font-semibold text-lg tracking-tight">{s.title}</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  {s.desc}
                </p>
                <p className="text-[11px] italic text-neutral-500 dark:text-neutral-400 mt-3 pt-3 border-t border-neutral-200/50 dark:border-neutral-800/50">
                  {s.example}
                </p>
                {isActive && (
                  <span className="absolute top-3 right-3 inline-block w-2 h-2 rounded-full bg-brand animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* CTA principal */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            onClick={onStart}
            className="group inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-brand to-fuchsia-500 text-white rounded-xl hover:shadow-xl hover:shadow-brand/40 hover:scale-[1.02] active:scale-[0.98] transition-all font-semibold text-base shadow-lg shadow-brand/30"
          >
            <Rocket size={18} className="group-hover:rotate-12 transition-transform" />
            Crear mi primera app
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Toma 2-3 minutos. Sin tarjeta de credito. Tu app queda en tu cuenta GitHub.
          </p>
        </div>

        {/* Feature ribbon */}
        <div className="mt-10 pt-6 border-t border-neutral-200/50 dark:border-neutral-800/50 flex flex-wrap justify-center gap-4 sm:gap-8">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.label}
                className="inline-flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400"
              >
                <span className="grid place-items-center w-7 h-7 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-brand">
                  <Icon size={13} />
                </span>
                {f.label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default OnboardingHero;
