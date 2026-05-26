export const STORAGE_KEYS = {
  user: "scrumdev.user",
  token: "scrumdev.token",
  offline: "scrumdev.offline",
  projects: "scrumdev.projects",
  chatThread: (projectKey: string) => `scrumdev.chat.${projectKey}`,
  workflows: (projectKey: string) => `scrumdev.workflows.${projectKey}`,
  policyEvals: (projectKey: string) => `scrumdev.policy.${projectKey}`,
  adrs: (projectKey: string) => `scrumdev.adrs.${projectKey}`,
} as const;

export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function readString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
