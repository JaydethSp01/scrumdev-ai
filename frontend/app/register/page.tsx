"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles, UserPlus } from "lucide-react";
import { useAuth } from "@/app/auth/_lib";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name || !email || !password) {
      setError("Completa todos los campos.");
      return;
    }
    if (password.length < 6) {
      setError("La contrasena debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contrasenas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name);
      router.push("/projects?welcome=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-gradient-to-b from-white to-brand/5 dark:from-neutral-950 dark:to-brand/10">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center gap-2 mb-6">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-brand to-brand-dark text-white">
            <Sparkles size={18} />
          </span>
          <span className="font-semibold tracking-tight">ScrumDev AI</span>
        </Link>
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-7 bg-white dark:bg-neutral-950 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">
            Empieza a generar tus sistemas
          </h1>
          <p className="text-sm text-neutral-500 mt-1.5">
            Crea una cuenta para guardar proyectos y orquestar agentes.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Nombre
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como te llamamos?"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Contrasena
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Confirmar contrasena
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repite la contrasena"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-dark transition disabled:opacity-50 font-medium"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              Crear cuenta gratis
            </button>
          </form>
          <p className="text-sm text-neutral-500 text-center mt-5">
            Ya tienes cuenta?{" "}
            <Link href="/login" className="text-brand hover:underline">
              Inicia sesion
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
