"use client";

/**
 * Tour guiado (spotlight) accesible para onboarding.
 *
 * Resalta elementos reales de la UI (por `data-tour="<id>"`) y muestra una
 * tarjeta explicativa paso a paso. Pasos sin `target` se muestran centrados
 * (intro/outro).
 *
 * Accesibilidad (objetivo AA/AAA):
 *  - role="dialog" aria-modal, aria-labelledby + aria-describedby.
 *  - Focus trap: el foco queda dentro de la tarjeta; al cerrar vuelve al origen.
 *  - Teclado: Esc cierra, ←/→ navegan, Enter avanza.
 *  - aria-live="polite" anuncia cada paso a lectores de pantalla.
 *  - Respeta prefers-reduced-motion (sin transiciones ni scroll suave).
 *  - El recorte de spotlight es decorativo (aria-hidden); el contenido va aparte.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { X, ArrowLeft, ArrowRight, Check, Compass } from "lucide-react";

export type TourStep = {
  /** Selector CSS del elemento a resaltar. Omitir para paso centrado. */
  target?: string;
  title: string;
  body: string;
  /** Preferencia de colocación de la tarjeta respecto al target. */
  placement?: "top" | "bottom" | "left" | "right" | "auto";
};

type Props = {
  steps: TourStep[];
  open: boolean;
  onClose: (completed: boolean) => void;
  labelledById?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8; // padding del recorte alrededor del target
const CARD_W = 340;
const CARD_GAP = 14;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function Tour({ steps, open, onClose, labelledById }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const reduce = prefersReducedMotion();

  const step = steps[i];
  const total = steps.length;

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // al cambiar de paso: scroll al target + medir
  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = step.target
      ? document.querySelector<HTMLElement>(step.target)
      : null;
    if (el) {
      el.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: reduce ? "auto" : "smooth",
      });
    }
    // medir tras el scroll
    const t = setTimeout(measure, reduce ? 0 : 260);
    return () => clearTimeout(t);
  }, [open, step, measure, reduce]);

  // recalcular en resize/scroll
  useEffect(() => {
    if (!open) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open, measure]);

  // guardar/restaurar foco + foco inicial en la tarjeta
  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => cardRef.current?.focus(), 60);
    return () => {
      clearTimeout(t);
      lastFocused.current?.focus?.();
    };
  }, [open]);

  const close = useCallback(
    (completed: boolean) => onClose(completed),
    [onClose]
  );
  const nextStep = useCallback(() => {
    setI((v) => {
      if (v >= total - 1) {
        close(true);
        return v;
      }
      return v + 1;
    });
  }, [total, close]);
  const prevStep = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

  // teclado
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        nextStep();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevStep();
      } else if (e.key === "Tab") {
        // focus trap simple: mantener el foco en la tarjeta
        const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, nextStep, prevStep, close]);

  // resetear al primer paso cuando se abre
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  if (!open || !step) return null;

  const cardStyle = computeCardPosition(rect, step.placement);
  const titleId = labelledById || "tour-title";

  return (
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {/* Overlay con recorte spotlight (decorativo) */}
      <Spotlight rect={rect} reduce={reduce} onClickOutside={() => close(false)} />

      {/* Tarjeta */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby="tour-body"
        tabIndex={-1}
        style={cardStyle}
        className={`fixed w-[min(340px,calc(100vw-24px))] rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl outline-none ${
          reduce ? "" : "transition-all duration-200"
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="flex items-center gap-2 text-brand">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-brand/10">
              <Compass size={15} aria-hidden="true" />
            </span>
            <span className="text-[11px] uppercase tracking-wider font-semibold">
              Tour · {i + 1}/{total}
            </span>
          </div>
          <button
            onClick={() => close(false)}
            aria-label="Cerrar el tour"
            className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-4">
          <h2
            id={titleId}
            className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
          >
            {step.title}
          </h2>
          <p
            id="tour-body"
            className="text-sm text-neutral-600 dark:text-neutral-300 mt-1.5 leading-relaxed"
          >
            {step.body}
          </p>
        </div>

        {/* progreso */}
        <div className="px-4 pb-2 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === i
                  ? "w-5 bg-brand"
                  : idx < i
                  ? "w-1.5 bg-brand/50"
                  : "w-1.5 bg-neutral-300 dark:bg-neutral-700"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={() => close(false)}
            className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded px-1"
          >
            Saltar tour
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={prevStep}
              disabled={i === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft size={14} aria-hidden="true" /> Atrás
            </button>
            <button
              onClick={nextStep}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {i >= total - 1 ? (
                <>
                  <Check size={14} aria-hidden="true" /> Empezar
                </>
              ) : (
                <>
                  Siguiente <ArrowRight size={14} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spotlight({
  rect,
  reduce,
  onClickOutside,
}: {
  rect: Rect | null;
  reduce: boolean;
  onClickOutside: () => void;
}) {
  // Sin target -> overlay liso. Con target -> recorte vía box-shadow gigante.
  if (!rect) {
    return (
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClickOutside}
      />
    );
  }
  return (
    <div className="absolute inset-0" aria-hidden="true" onClick={onClickOutside}>
      <div
        className={reduce ? "" : "transition-all duration-200"}
        style={{
          position: "absolute",
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          outline: "2px solid rgb(124 92 255)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function computeCardPosition(
  rect: Rect | null,
  placement: TourStep["placement"] = "auto"
): React.CSSProperties {
  if (typeof window === "undefined") return {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }
  // elegir lado con más espacio si auto
  let place = placement;
  if (place === "auto") {
    const spaceRight = vw - (rect.left + rect.width);
    const spaceBelow = vh - (rect.top + rect.height);
    if (spaceRight > CARD_W + CARD_GAP) place = "right";
    else if (rect.left > CARD_W + CARD_GAP) place = "left";
    else if (spaceBelow > 220) place = "bottom";
    else place = "top";
  }
  const clampLeft = (l: number) => Math.max(12, Math.min(l, vw - CARD_W - 12));
  const clampTop = (t: number) => Math.max(12, Math.min(t, vh - 240));

  switch (place) {
    case "right":
      return {
        top: clampTop(rect.top),
        left: clampLeft(rect.left + rect.width + CARD_GAP),
      };
    case "left":
      return {
        top: clampTop(rect.top),
        left: clampLeft(rect.left - CARD_W - CARD_GAP),
      };
    case "top":
      return {
        top: clampTop(rect.top - 230),
        left: clampLeft(rect.left),
      };
    default: // bottom
      return {
        top: clampTop(rect.top + rect.height + CARD_GAP),
        left: clampLeft(rect.left),
      };
  }
}

export default Tour;
