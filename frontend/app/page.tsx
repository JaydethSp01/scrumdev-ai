"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { getCurrentUser } from "@/app/auth/_lib";

/**
 * La raíz "/" no muestra landing: redirige al login (página principal) o a
 * /projects si ya hay sesión. La experiencia de marca vive en /login.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getCurrentUser() ? "/projects" : "/login");
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center bg-neutral-950 text-neutral-300">
      <div className="flex items-center gap-2 animate-pulse">
        <span className="grid place-items-center w-8 h-8 rounded-md bg-gradient-to-br from-brand to-brand-dark text-white">
          <Sparkles size={16} />
        </span>
        <span className="font-semibold tracking-tight">ScrumDev AI</span>
      </div>
    </main>
  );
}
