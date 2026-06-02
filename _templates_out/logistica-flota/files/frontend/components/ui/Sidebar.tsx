"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon?: React.ReactNode };

/** Sidebar fijo del app-shell. Resalta la ruta activa con el color de marca. */
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
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex h-16 items-center px-6 text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
        {title}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/" && pathname?.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand/10 text-brand"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
              )}
            >
              {it.icon}
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      {footer ? <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">{footer}</div> : null}
    </aside>
  );
}

export default Sidebar;
