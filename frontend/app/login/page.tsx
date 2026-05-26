"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Loader2,
  LogIn,
  Sparkles,
  Zap,
  Bot,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/app/auth/_lib";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Ingresa email y contrasena");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      router.push("/projects");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* --- BRAND PANEL --- */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
        {/* Decorative gradient blobs */}
        <div className="pointer-events-none absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-brand/40 blur-[120px] opacity-50" />
        <div className="pointer-events-none absolute top-1/3 -right-32 w-[480px] h-[480px] rounded-full bg-fuchsia-500/30 blur-[120px] opacity-50" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 w-[420px] h-[420px] rounded-full bg-cyan-500/20 blur-[120px] opacity-50" />
        {/* Grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <Link href="/" className="relative z-10 flex items-center gap-2.5">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-fuchsia-500 text-white shadow-lg shadow-brand/40">
            <Sparkles size={20} />
          </span>
          <span className="font-semibold text-lg tracking-tight">ScrumDev AI</span>
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-semibold tracking-tight leading-tight">
            De una idea
            <br />
            <span className="bg-gradient-to-r from-brand via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
              a una app desplegada
            </span>
            <br />
            en minutos.
          </h2>
          <p className="text-neutral-400 mt-4 text-base leading-relaxed">
            Tu plataforma con agentes IA: backlog Scrum, codigo fullstack
            personalizado y deploy automatico a Vercel.
          </p>

          <ul className="mt-8 space-y-3.5">
            <FeatureBullet
              icon={<Bot size={16} />}
              title="Agentes especializados"
              desc="PO, Arquitecto, Dev y QA trabajan en paralelo."
            />
            <FeatureBullet
              icon={<Zap size={16} />}
              title="Personalizacion real"
              desc="Tus colores, fonts e imagenes en el codigo generado."
            />
            <FeatureBullet
              icon={<Rocket size={16} />}
              title="Deploy fullstack"
              desc="Next.js + FastAPI + Postgres a Vercel con 1 click."
            />
            <FeatureBullet
              icon={<ShieldCheck size={16} />}
              title="Tu codigo, tu repo"
              desc="Todo va a tu GitHub. Sin lock-in."
            />
          </ul>
        </div>

        <p className="relative z-10 text-xs text-neutral-500">
          (c) {new Date().getFullYear()} ScrumDev AI - hecho para emprendedores.
        </p>
      </div>

      {/* --- FORM PANEL --- */}
      <div className="relative grid place-items-center p-6 bg-gradient-to-b from-neutral-950 to-neutral-900">
        <div className="absolute top-6 left-6 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-brand to-fuchsia-500 text-white">
              <Sparkles size={18} />
            </span>
            <span className="font-semibold tracking-tight">ScrumDev AI</span>
          </Link>
        </div>

        <div className="w-full max-w-md">
          <div className="relative border border-white/10 rounded-2xl p-8 bg-white/[0.03] backdrop-blur-xl shadow-2xl">
            <div className="absolute inset-0 rounded-2xl pointer-events-none bg-gradient-to-br from-brand/10 via-transparent to-fuchsia-500/10" />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full bg-brand/15 text-brand border border-brand/20">
                <LogIn size={11} /> Acceso
              </span>
              <h1 className="text-3xl font-semibold tracking-tight mt-3">
                Bienvenido de vuelta
              </h1>
              <p className="text-sm text-neutral-400 mt-2">
                Inicia sesion para retomar tus proyectos generados con agentes IA.
              </p>

              <form onSubmit={submit} className="mt-7 space-y-4">
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="tu@correo.com"
                  autoComplete="email"
                />
                <Field
                  label="Contrasena"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="********"
                  autoComplete="current-password"
                />
                {error && (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-brand to-fuchsia-500 text-white rounded-xl hover:opacity-95 transition disabled:opacity-50 font-semibold shadow-lg shadow-brand/30"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                  Entrar
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">o</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <Link
                href="/register"
                className="block w-full text-center text-sm px-4 py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:bg-white/5 transition"
              >
                Crear cuenta nueva
              </Link>
            </div>
          </div>

          <p className="text-center text-xs text-neutral-500 mt-6">
            Al continuar aceptas usar tus credenciales solo para esta sesion local.
          </p>
        </div>
      </div>
    </main>
  );
}

function FeatureBullet({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-brand shrink-0 mt-0.5">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-neutral-100">{title}</p>
        <p className="text-sm text-neutral-400">{desc}</p>
      </div>
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/40 transition"
      />
    </div>
  );
}
