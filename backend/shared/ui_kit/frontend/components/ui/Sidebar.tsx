"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon?: React.ReactNode };

/** Sidebar branded: fondo con gradiente del color de marca del sector (no
 *  blanco/negro genérico), texto claro, ítem activo en pastilla. Da identidad
 *  visual inmediata por sector y elimina el look "todo gris/negro". */
export function Sidebar({
  items,
  title = "Panel",
  footer,
}: {
  items: NavItem[];
  title?: string;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-brand bg-gradient-to-b from-brand-dark to-brand text-white">
      <div className="flex h-16 items-center gap-2.5 px-5 text-lg font-bold tracking-tight">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-sm font-black">
          {(title || "P").trim().charAt(0).toUpperCase()}
        </span>
        <span className="truncate">{title}</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-3">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/" && pathname?.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                active
                  ? "bg-white/20 text-white shadow-sm"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              )}
            >
              {it.icon}
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/15 p-4 text-xs text-white/70">
        {footer ?? "ScrumDev AI"}
      </div>
    </aside>
  );
}

export default Sidebar;
