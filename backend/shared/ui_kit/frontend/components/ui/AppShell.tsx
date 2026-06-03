"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/components/ui/Sidebar";
import { Sidebar } from "@/components/ui/Sidebar";
import { HeaderUser } from "@/components/ui/HeaderUser";

/** App-shell completo: sidebar branded fijo (desktop) + header con acción +
 *  menú de usuario + drawer móvil. Modo claro forzado (sin dark: que ponía
 *  TODO en negro). Envuelve TODAS las páginas de una app con datos. */
export function AppShell({
  items,
  title = "Panel",
  action,
  children,
}: {
  items: NavItem[];
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = items.find((i) => i.href === pathname)?.label ?? title;
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar items={items} title={title} />
      {/* drawer móvil (branded) */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-brand bg-gradient-to-b from-brand-dark to-brand text-white">
            <div className="flex h-16 items-center px-5 text-lg font-bold">{title}</div>
            <nav className="space-y-1 p-3">
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                    pathname === it.href ? "bg-white/20 text-white" : "text-white/75 hover:bg-white/10"
                  )}
                >
                  {it.icon}
                  <span>{it.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Abrir menú"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <h1 className="text-lg font-semibold tracking-tight">{current}</h1>
          </div>
          <div className="flex items-center gap-2">
            {action}
            <HeaderUser />
          </div>
        </header>
        <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
