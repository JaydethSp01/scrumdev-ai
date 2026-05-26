"use client";

import { API } from "@/lib/api";
import { readJSON, removeKey, STORAGE_KEYS, writeJSON } from "@/lib/storage";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  correlation_id?: string;
  imageUrls?: string[];
  action?: unknown;
};

type BackendMsg = {
  id: string;
  role: string;
  content: string;
  image_urls?: string[] | null;
  action?: unknown | null;
  created_at: string;
};

function mapFromBackend(m: BackendMsg): ChatMessage {
  return {
    id: m.id,
    role: (m.role === "user" ? "user" : "assistant") as ChatMessage["role"],
    content: m.content,
    createdAt: m.created_at,
    imageUrls: m.image_urls || undefined,
    action: m.action || undefined,
  };
}

// --- Cache local (offline / arranque rapido). Atado a user_id para privacidad.
function localKey(projectKey: string, userId: string): string {
  return `scrumdev.chat.${userId}.${projectKey}`;
}

function loadLocalCache(projectKey: string, userId: string): ChatMessage[] {
  return readJSON<ChatMessage[]>(localKey(projectKey, userId), []);
}

function saveLocalCache(
  projectKey: string,
  userId: string,
  messages: ChatMessage[]
): void {
  writeJSON(localKey(projectKey, userId), messages);
}

function clearLocalCache(projectKey: string, userId: string): void {
  removeKey(localKey(projectKey, userId));
  // Limpia tambien la key vieja sin user_id (migracion silenciosa)
  removeKey(`scrumdev.chat.${projectKey}`);
}

// --- API publica: fetch desde backend con fallback a cache local
export async function fetchChatThread(
  projectKey: string,
  userId: string
): Promise<ChatMessage[]> {
  try {
    const res = await fetch(
      `${API}/projects/${encodeURIComponent(projectKey)}/chat?user_id=${encodeURIComponent(userId)}&limit=200`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { messages?: BackendMsg[] };
    const msgs = (data.messages || []).map(mapFromBackend);
    saveLocalCache(projectKey, userId, msgs);
    return msgs;
  } catch {
    return loadLocalCache(projectKey, userId);
  }
}

export function loadCachedThread(
  projectKey: string,
  userId: string
): ChatMessage[] {
  return loadLocalCache(projectKey, userId);
}

export function saveCachedThread(
  projectKey: string,
  userId: string,
  messages: ChatMessage[]
): void {
  saveLocalCache(projectKey, userId, messages);
}

export async function clearChatThread(
  projectKey: string,
  userId: string
): Promise<void> {
  clearLocalCache(projectKey, userId);
  try {
    await fetch(
      `${API}/projects/${encodeURIComponent(projectKey)}/chat?user_id=${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
  } catch {
    // Ignorar: el cache local ya se limpio
  }
}

// --- Compat con codigo viejo que llamaba con (projectKey) sin userId
export function loadChatThread(projectKey: string): ChatMessage[] {
  return readJSON<ChatMessage[]>(STORAGE_KEYS.chatThread(projectKey), []);
}

export function saveChatThread(
  projectKey: string,
  messages: ChatMessage[]
): void {
  writeJSON(STORAGE_KEYS.chatThread(projectKey), messages);
}
