"use client";

import { useEffect, useRef } from "react";
import { API } from "@/lib/api";

/**
 * Suscripción en tiempo real por WebSocket (Taller 4 I): se conecta al
 * notification_service (`/ws/{userId}`) y llama `onEvent` con cada evento
 * (respuestas de agentes, eventos de workflow, cambios de estado de historias).
 * Reconecta solo. Si el WS no está disponible, falla en silencio y los
 * componentes siguen con su refresco por HTTP (degradación elegante).
 */
export function useRealtime(
  userId: string | null | undefined,
  onEvent: (event: unknown) => void
) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const base =
      process.env.NEXT_PUBLIC_WS_URL || API.replace(/^http/, "ws");
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      try {
        ws = new WebSocket(`${base}/ws/${encodeURIComponent(userId)}`);
        ws.onmessage = (e) => {
          try {
            cb.current(JSON.parse(e.data));
          } catch {
            cb.current(null);
          }
        };
        ws.onclose = () => {
          if (!closed) retry = setTimeout(connect, 5000);
        };
        ws.onerror = () => {
          try {
            ws?.close();
          } catch {
            /* noop */
          }
        };
      } catch {
        if (!closed) retry = setTimeout(connect, 5000);
      }
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
  }, [userId]);
}
