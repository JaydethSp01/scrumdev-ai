"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/components/ui/Sidebar";
import { Sidebar } from "@/components/ui/Sidebar";

/** App-shell completo: sidebar fijo (desktop) + header con acción + drawer móvil.
 *  Es el contenedor que envuelve TODAS las páginas de una app con datos. */
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
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Sidebar items={items} title={title} />
      {/* drawer móvil */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-neutral-950">
            <nav className="space-y-1 p-3 pt-6">
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    pathname === it.href ? "bg-brand/10 text-brand" : "text-neutral-600 hover:bg-neutral-100"
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
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-neutral-200 bg-white/80 px-4 backdrop-blur sm:px-6 dark:border-neutral-800 dark:bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:hover:bg-neutral-900"
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <h1 className="text-lg font-semibold tracking-tight">{current}</h1>
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </header>
        <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
