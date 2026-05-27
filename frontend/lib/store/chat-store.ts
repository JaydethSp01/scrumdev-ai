"use client";

/**
 * Zustand store global del chat IA (Spec Delfin T4 §12.2-12.3).
 *
 * Reemplaza el patron de useState local + fetch ad-hoc. Cubre:
 *  - mensajes del thread actual
 *  - estado loading
 *  - drafts de attachments
 *  - cache cross-page (entre tabs del proyecto)
 *
 * El backend sigue siendo source of truth (lib/chat.ts.fetchChatThread),
 * el store es solo cache reactivo en cliente.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ChatMessage } from "@/lib/chat";

type ChatThread = {
  messages: ChatMessage[];
  loading: boolean;
  lastSyncedAt: string | null;
};

type ChatStore = {
  threads: Record<string, ChatThread>; // key: `${projectKey}:${userId}`
  setThread: (projectKey: string, userId: string, messages: ChatMessage[]) => void;
  setLoading: (projectKey: string, userId: string, loading: boolean) => void;
  appendMessage: (projectKey: string, userId: string, msg: ChatMessage) => void;
  clearThread: (projectKey: string, userId: string) => void;
  getThread: (projectKey: string, userId: string) => ChatThread;
};

const empty: ChatThread = { messages: [], loading: false, lastSyncedAt: null };

const _k = (p: string, u: string) => `${p}:${u}`;

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      threads: {},
      setThread: (projectKey, userId, messages) =>
        set((s) => ({
          threads: {
            ...s.threads,
            [_k(projectKey, userId)]: {
              messages,
              loading: false,
              lastSyncedAt: new Date().toISOString(),
            },
          },
        })),
      setLoading: (projectKey, userId, loading) =>
        set((s) => {
          const cur = s.threads[_k(projectKey, userId)] || empty;
          return {
            threads: { ...s.threads, [_k(projectKey, userId)]: { ...cur, loading } },
          };
        }),
      appendMessage: (projectKey, userId, msg) =>
        set((s) => {
          const cur = s.threads[_k(projectKey, userId)] || empty;
          return {
            threads: {
              ...s.threads,
              [_k(projectKey, userId)]: {
                ...cur,
                messages: [...cur.messages, msg],
              },
            },
          };
        }),
      clearThread: (projectKey, userId) =>
        set((s) => {
          const next = { ...s.threads };
          delete next[_k(projectKey, userId)];
          return { threads: next };
        }),
      getThread: (projectKey, userId) =>
        get().threads[_k(projectKey, userId)] || empty,
    }),
    {
      name: "scrumdev.chat-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
