"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { currentUser, seedAuth } from "@/lib/auth";

/** Guardia de autenticación: envuelve el contenido protegido. Si no hay sesión
 *  redirige a /login. La ruta /login se renderiza libre. Client-side, válido
 *  para frontends estáticos (demo). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const isPublic = pathname === "/login";

  useEffect(() => {
    seedAuth();
    const u = currentUser();
    if (!u && !isPublic) {
      router.replace("/login");
      return;
    }
    if (u && isPublic) {
      router.replace("/");
      return;
    }
    setReady(true);
  }, [pathname, isPublic, router]);

  if (isPublic) return <>{children}</>;
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}

export default AuthGate;
