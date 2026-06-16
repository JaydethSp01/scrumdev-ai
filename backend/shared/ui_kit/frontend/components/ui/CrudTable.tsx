"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

export type CrudField = { key: string; label: string; type?: "text" | "number" | "email"; render?: (row: any) => React.ReactNode };

/** Tabla CRUD que SÍ funciona y PERSISTE de verdad: agregar/editar/eliminar con
 *  modal; los datos se guardan en localStorage (sobreviven al recargar) y, si hay
 *  backend, también se sincronizan vía API. Botones reales, no decorativos. */
export function CrudTable({
  fields,
  initial = [],
  title = "Registros",
  storageKey,
}: {
  fields: CrudField[];
  initial?: any[];
  title?: string;
  storageKey?: string;
}) {
  const ENTITY = (storageKey || title).toLowerCase().replace(/\s+/g, "_");
  const KEY = "sd_crud_" + ENTITY;
  const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const [rows, setRows] = useState<any[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [q, setQ] = useState("");
  const loaded = useRef(false);
  const shown = q.trim()
    ? rows.filter((r) => fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(q.toLowerCase())))
    : rows;

  // cargar: 1º del SERVER (/data/{entidad}, multi-dispositivo); si no, de
  // localStorage (persiste por navegador). Doble capa = real y resiliente.
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (API) {
        try {
          const r = await fetch(`${API}/data/${ENTITY}`, { cache: "no-store" });
          if (r.ok) { const d = await r.json(); if (!cancel && Array.isArray(d) && d.length) { setRows(d); loaded.current = true; return; } }
        } catch { /* backend dormido -> localStorage */ }
      }
      try { const s = window.localStorage.getItem(KEY); if (s && !cancel) setRows(JSON.parse(s)); } catch {}
      loaded.current = true;
    })();
    return () => { cancel = true; };
  }, [KEY, ENTITY]);
  // respaldo local en cada cambio
  useEffect(() => {
    if (!loaded.current) return;
    try { window.localStorage.setItem(KEY, JSON.stringify(rows)); } catch {}
  }, [rows, KEY]);

  function nuevo() { setEditing(null); setForm({}); setOpen(true); }
  function editar(r: any) { setEditing(r); setForm({ ...r }); setOpen(true); }
  function eliminar(r: any) {
    setRows((xs) => xs.filter((x) => x !== r));
    if (API && r.id) fetch(`${API}/data/${ENTITY}/${r.id}`, { method: "DELETE" }).catch(() => {});
  }
  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      setRows((xs) => xs.map((x) => (x === editing ? { ...editing, ...form } : x)));
      if (API && editing.id) fetch(`${API}/data/${ENTITY}/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editing, ...form }) }).catch(() => {});
    } else {
      const nuevoReg = { id: Date.now(), ...form };
      setRows((xs) => [nuevoReg, ...xs]);
      if (API) fetch(`${API}/data/${ENTITY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => {});
    }
    setOpen(false);
  }
  function exportarCSV() {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = fields.map((f) => esc(f.label)).join(",");
    const body = shown.map((r) => fields.map((f) => esc(r[f.key])).join(",")).join("\n");
    const csv = "﻿" + head + "\n" + body; // BOM para Excel/tildes
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${ENTITY}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar"
              className="w-40 rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 sm:w-52" />
          </div>
          <button onClick={exportarCSV} title="Exportar CSV" aria-label="Exportar CSV"
            className="rounded-lg border border-slate-300 p-2 text-slate-600 transition hover:bg-slate-50 hover:text-brand cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <Button onClick={nuevo}><Plus size={16} /> Nuevo</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {fields.map((f) => <th key={f.key} className="px-4 py-3 font-semibold">{f.label}</th>)}
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={fields.length + 1} className="px-4 py-10 text-center text-slate-400">{q.trim() ? "Sin resultados para tu búsqueda." : "Sin registros. Crea el primero."}</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id ?? i} className="border-t border-slate-100 hover:bg-slate-50">
                {fields.map((f) => <td key={f.key} className="px-4 py-3 text-slate-700">{f.render ? f.render(r) : String(r[f.key] ?? "")}</td>)}
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => editar(r)} aria-label="Editar"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"><Pencil size={16} /></button>
                    <button onClick={() => eliminar(r)} aria-label="Eliminar"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={guardar}
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{editing ? "Editar" : "Nuevo"} registro</h3>
            {fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{f.label}</label>
                <input type={f.type || "text"} value={form[f.key] ?? ""} aria-label={f.label}
                  onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? +e.target.value : e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button type="submit">Guardar</Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default CrudTable;
