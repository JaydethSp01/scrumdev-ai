"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readJSON,
  readString,
  removeKey,
  STORAGE_KEYS,
  writeJSON,
  writeString,
} from "@/lib/storage";
import { apiLogin, apiRegister, HttpError } from "@/lib/api";

export type AuthUser = {
  user_id: string;
  email: string;
  name: string;
  createdAt: string;
};

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getCurrentUser(): AuthUser | null {
  return readJSON<AuthUser | null>(STORAGE_KEYS.user, null);
}

const AUTH_EVENT = "scrumdev:auth-change";

function emitAuthChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

export function setCurrentUser(user: AuthUser | null): void {
  if (user === null) {
    removeKey(STORAGE_KEYS.user);
  } else {
    writeJSON(STORAGE_KEYS.user, user);
  }
  emitAuthChange();
}

export function getToken(): string | null {
  return readString(STORAGE_KEYS.token);
}

export function setToken(token: string | null): void {
  if (token === null) {
    removeKey(STORAGE_KEYS.token);
  } else {
    writeString(STORAGE_KEYS.token, token);
  }
  emitAuthChange();
}

function friendlyAuthError(e: unknown, mode: "login" | "register"): Error {
  if (e instanceof HttpError) {
    if (mode === "login" && e.status === 401) {
      return new Error("Credenciales incorrectas.");
    }
    if (mode === "register" && e.status === 409) {
      return new Error("Ya existe una cuenta con ese email.");
    }
    if (e.status === 400 || e.status === 422) {
      return new Error("Datos invalidos. Revisa los campos.");
    }
    if (e.status >= 500) {
      return new Error("El backend no respondio correctamente. Intenta de nuevo.");
    }
    return new Error(e.message);
  }
  if (e instanceof TypeError) {
    return new Error("No se pudo conectar con el backend.");
  }
  return e instanceof Error ? e : new Error(String(e));
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.user) {
        setUser(getCurrentUser());
      }
    };
    const onAuthChange = () => {
      setUser(getCurrentUser());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUTH_EVENT, onAuthChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUTH_EVENT, onAuthChange);
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
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
    async (email: string, password: string, name: string): Promise<AuthUser> => {
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

  const loginAsGuest = useCallback(async (): Promise<AuthUser> => {
    const u: AuthUser = {
      user_id: `guest_${genId()}`,
      email: "guest@scrumdev.ai",
      name: "Invitado",
      createdAt: new Date().toISOString(),
    };
    setToken(null);
    setCurrentUser(u);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
    setUser(null);
  }, []);

  return { user, ready, login, register, loginAsGuest, logout };
}
