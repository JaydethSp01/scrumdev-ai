"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutGrid,
  LogOut,
  User,
  ChevronDown,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/app/auth/_lib";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, ready } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  if (pathname === "/" || pathname === "/login" || pathname === "/register") {
    return null;
  }

  function handleLogout() {
    logout();
    setMenuOpen(false);
    router.push("/login");
  }

  const authLinks =
    ready && user
      ? [{ href: "/projects", label: "Proyectos", icon: LayoutGrid }]
      : [];

  return (
    <nav className="sticky top-0 z-40 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-950/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
        <Link
          href={ready && user ? "/projects" : "/"}
          className="flex items-center gap-2 mr-auto"
        >
          <span className="grid place-items-center w-8 h-8 rounded-md bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm">
            <Sparkles size={16} />
          </span>
          <span className="font-semibold tracking-tight">ScrumDev AI</span>
        </Link>

        <div className="hidden sm:flex items-center gap-1">
          {authLinks.map((l) => {
            const active = pathname.startsWith(l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition ${
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                }`}
              >
                <Icon size={16} />
                {l.label}
              </Link>
            );
          })}
        </div>

        {ready && user ? (
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
            >
              <span className="grid place-items-center w-7 h-7 rounded-full bg-brand/15 text-brand text-xs font-semibold">
                {(user.name || user.email).slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden md:block text-sm">{user.name}</span>
              <ChevronDown size={14} className="opacity-60" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                </div>
                <Link
                  href="/projects"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  <User size={14} /> Mi cuenta
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900 text-red-600 dark:text-red-400"
                >
                  <LogOut size={14} /> Cerrar sesion
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1">
            <Link
              href="/login"
              className="text-sm px-3 py-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="text-sm px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand-dark transition"
            >
              Registrarse
            </Link>
          </div>
        )}

        <button
          aria-label="Menu"
          onClick={() => setMobileOpen((v) => !v)}
          className="sm:hidden p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {mobileOpen && (
        <div className="sm:hidden border-t border-neutral-200 dark:border-neutral-800 px-4 py-2 space-y-1">
          {authLinks.map((l) => {
            const active = pathname.startsWith(l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                }`}
              >
                <Icon size={16} />
                {l.label}
              </Link>
            );
          })}
          {!user && (
            <>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 text-sm rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 text-sm rounded-md bg-brand text-white"
              >
                Registrarse
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

export default Navbar;
