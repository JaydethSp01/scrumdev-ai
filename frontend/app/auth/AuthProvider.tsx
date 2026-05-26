"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  apiLogin,
  apiRegister,
  HttpError,
} from "@/lib/api";
import {
  readJSON,
  readString,
  removeKey,
  STORAGE_KEYS,
  writeJSON,
  writeString,
} from "@/lib/storage";
import type { AuthUser } from "@/app/auth/_lib";

const AUTH_EVENT = "scrumdev:auth-change";

function getCurrentUser(): AuthUser | null {
  return readJSON<AuthUser | null>(STORAGE_KEYS.user, null);
}

function setCurrentUser(user: AuthUser | null): void {
  if (user === null) removeKey(STORAGE_KEYS.user);
  else writeJSON(STORAGE_KEYS.user, user);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT));
  }
}

function setToken(token: string | null): void {
  if (token === null) removeKey(STORAGE_KEYS.token);
  else writeString(STORAGE_KEYS.token, token);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT));
  }
}

function friendlyAuthError(e: unknown, mode: "login" | "register"): Error {
  if (e instanceof HttpError) {
    if (mode === "login" && e.status === 401) return new Error("Credenciales incorrectas.");
    if (mode === "register" && e.status === 409) return new Error("Ya existe una cuenta con ese email.");
    if (e.status === 400 || e.status === 422) return new Error("Datos invalidos.");
    if (e.status >= 500) return new Error("Backend no respondio.");
    return new Error(e.message);
  }
  if (e instanceof TypeError) return new Error("No se pudo conectar con el backend.");
  return e instanceof Error ? e : new Error(String(e));
}

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, name: string) => Promise<AuthUser>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
    setReady(true);
    const onAuthChange = () => setUser(getCurrentUser());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.user) setUser(getCurrentUser());
    };
    window.addEventListener(AUTH_EVENT, onAuthChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUTH_EVENT, onAuthChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const session = await apiLogin({ email, password });
      const u: AuthUser = {
        user_id: session.user.id,
        email: session.user.email,
        name: session.user.name || email.split("@")[0] || "Usuario",
        createdAt: new Date().toISOString(),
      };
      setToken(session.access_token);
      setCurrentUser(u);
      setUser(u);
      return u;
    } catch (e) {
      throw friendlyAuthError(e, "login");
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      try {
        const session = await apiRegister({ email, password, name });
        const u: AuthUser = {
          user_id: session.user.id,
          email: session.user.email,
          name: session.user.name || name || email.split("@")[0] || "Usuario",
          createdAt: new Date().toISOString(),
        };
        setToken(session.access_token);
        setCurrentUser(u);
        setUser(u);
        return u;
      } catch (e) {
        throw friendlyAuthError(e, "register");
      }
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback al hook legacy (_lib useAuth) si el provider no envolvio
    // — evita explotar componentes que aun importan useAuth sin migrar
    throw new Error("useAuthContext debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}
