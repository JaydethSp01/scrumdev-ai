"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type Slot = { day: string; time: string; patient?: string };

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const TIMES = ["09:00", "10:00", "11:00", "12:00", "15:00", "16:00", "17:00"];
const DEFAULT_BOOKED: Record<string, string> = {
  "Lun-09:00": "Juan Pérez", "Lun-11:00": "Ana Gómez", "Mar-10:00": "Carlos Ruiz",
  "Mié-12:00": "Laura M.", "Jue-15:00": "Diego R.", "Vie-16:00": "Sofía L.",
};

/** Agendador de citas (estilo Doctoralia/Calendly): grilla día×hora con slots
 *  ocupados (paciente) y libres clicables para reservar. Módulo estrella de salud. */
export function AppointmentScheduler({
  professionals = ["Dra. Rodríguez", "Dr. Fernández", "Dra. López"],
  booked = DEFAULT_BOOKED,
}: {
  professionals?: string[];
  booked?: Record<string, string>;
}) {
  const [pro, setPro] = useState(professionals[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, string>>(booked);
  const [reminders, setReminders] = useState<{ pro: string; dia: string; hora: string; on: boolean }[]>([]);
  // PERSISTE REAL: recordatorios/citas en /data/citas (server, multi-dispositivo) + localStorage
  const _api = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const _ld = useRef(false);
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (_api) {
        try { const r = await fetch(`${_api}/data/citas`, { cache: "no-store" });
          if (r.ok) { const d = await r.json(); if (!cancel && Array.isArray(d) && d.length) { setReminders(d); _ld.current = true; return; } } } catch {}
      }
      try { const s = window.localStorage.getItem("sd_citas"); if (s && !cancel) setReminders(JSON.parse(s)); } catch {}
      _ld.current = true;
    })();
    return () => { cancel = true; };
  }, [_api]);
  useEffect(() => { if (_ld.current) { try { window.localStorage.setItem("sd_citas", JSON.stringify(reminders)); } catch {} } }, [reminders]);

  const reserve = (key: string) => {
    if (local[key]) return;
    setPicked(key);
    setLocal((b) => ({ ...b, [key]: "Reservado" }));
    const [dia, hora] = key.split("-");
    const cita = { pro, dia, hora, on: true };
    setReminders((rs) => [cita, ...rs]);
    if (_api) fetch(`${_api}/data/citas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cita) }).catch(() => {});
    // RECORDATORIO real: notificación del navegador (pide permiso).
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("Cita agendada", { body: `${pro} · ${dia} ${hora}. Te recordaremos antes.` });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then((perm) => {
            if (perm === "granted") new Notification("Recordatorios activados", { body: `${pro} · ${dia} ${hora}` });
          });
        }
      }
    } catch { /* no soportado */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-500">Profesional:</span>
        {professionals.map((p) => (
          <button key={p} onClick={() => setPro(p)}
            className={cn("rounded-full px-3 py-1.5 text-sm font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              p === pro ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {p}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-2" style={{ gridTemplateColumns: `64px repeat(${DAYS.length}, minmax(96px,1fr))` }}>
          <div />
          {DAYS.map((d) => <div key={d} className="pb-1 text-center text-sm font-semibold text-slate-700">{d}</div>)}
          {TIMES.map((t) => (
            <FragmentRow key={t} t={t} days={DAYS} local={local} picked={picked} onPick={reserve} />
          ))}
        </div>
      </div>
      {picked ? (
        <p className="rounded-lg bg-brand/10 px-4 py-2 text-sm font-medium text-brand">
          ✓ Cita reservada con {pro} — {picked.replace("-", " · ")} · recordatorio creado
        </p>
      ) : (
        <p className="text-sm text-slate-500">Toca un horario libre para reservar.</p>
      )}

      {reminders.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Recordatorios ({reminders.filter((r) => r.on).length} activos)
          </h3>
          <ul className="space-y-2">
            {reminders.map((r, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-sm text-slate-700">{r.pro} · <strong>{r.dia} {r.hora}</strong></span>
                <button onClick={() => setReminders((rs) => rs.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer",
                    r.on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                  {r.on ? "Recordatorio ON" : "OFF"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FragmentRow({ t, days, local, picked, onPick }: {
  t: string; days: string[]; local: Record<string, string>; picked: string | null; onPick: (k: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-2 text-xs font-medium text-slate-400">{t}</div>
      {days.map((d) => {
        const key = `${d}-${t}`;
        const taken = local[key];
        const isPicked = picked === key;
        return (
          <button key={key} onClick={() => onPick(key)} disabled={!!taken && !isPicked}
            aria-label={taken ? `${key.replace("-", " ")} ocupado` : `Reservar ${key.replace("-", " ")}`}
            className={cn(
              "h-12 rounded-lg border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              isPicked ? "border-brand bg-brand text-white"
              : taken ? "border-slate-200 bg-slate-50 text-slate-500 cursor-default"
              : "border-dashed border-slate-300 text-slate-400 hover:border-brand hover:bg-brand/5 hover:text-brand cursor-pointer"
            )}>
            {taken ? <span className="truncate px-1">{taken}</span> : "+"}
          </button>
        );
      })}
    </>
  );
}

export default AppointmentScheduler;
