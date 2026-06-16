"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, DEFAULT_ADMIN, seedAuth } from "@/lib/auth";
import { GenerativePattern } from "@/components/ui/GenerativePattern";

/** Pantalla de login branded (gradiente del color de marca). Muestra las
 *  credenciales del superadmin sembrado para que el demo entre de una. */
export function LoginForm({ appName = "Panel" }: { appName?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    seedAuth();
    const u = login(email, password);
    if (u) {
      router.replace("/");
    } else {
      setError("Credenciales incorrectas.");
      setLoading(false);
    }
  }

  function fillAdmin() {
    setEmail(DEFAULT_ADMIN.email);
    setPassword(DEFAULT_ADMIN.password);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* panel branded */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand bg-gradient-to-br from-brand-dark to-brand p-12 text-white lg:flex">
        <GenerativePattern seed={appName} />
        <div className="relative text-2xl font-black tracking-tight">{appName}</div>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight">Bienvenido de nuevo</h2>
          <p className="mt-3 max-w-sm text-white/80">
            Gestiona tu operación desde un panel rápido, seguro y con control de roles.
          </p>
        </div>
        <p className="relative text-sm text-white/60">Generado con ScrumDev AI</p>
      </div>
      {/* formulario */}
      <div className="grid place-items-center bg-slate-50 p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Iniciar sesión</h1>
            <p className="mt-1 text-sm text-slate-500">Ingresa tus credenciales para continuar.</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">Correo</label>
            <input
              id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              placeholder="tucorreo@ejemplo.com"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">Contraseña</label>
            <input
              id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
          <button
            type="submit" disabled={loading}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
          <button
            type="button" onClick={fillAdmin}
            className="w-full rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs text-slate-500 transition hover:bg-slate-50 cursor-pointer"
          >
            Usar superadmin de demo · {DEFAULT_ADMIN.email} / {DEFAULT_ADMIN.password}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginForm;
