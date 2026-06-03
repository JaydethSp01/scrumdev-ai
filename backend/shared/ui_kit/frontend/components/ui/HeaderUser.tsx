"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { currentUser, logout, type Session } from "@/lib/auth";

/** Chip de usuario + botón Salir en el header. No renderiza nada si no hay
 *  sesión (apps sin auth quedan idénticas). */
export function HeaderUser() {
  const [user, setUser] = useState<Session>(null);
  const router = useRouter();
  useEffect(() => {
    setUser(currentUser());
  }, []);
  if (!user) return null;
  const initials = (user.name || user.email).trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium leading-tight text-slate-800">{user.name || user.email}</p>
        <p className="text-xs capitalize text-slate-500">{user.role}</p>
      </div>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
        {initials}
      </span>
      <button
        onClick={() => {
          logout();
          router.push("/login");
        }}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 cursor-pointer"
      >
        Salir
      </button>
    </div>
  );
}

export default HeaderUser;
