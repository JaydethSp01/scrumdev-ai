"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { HandCoins, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Aporte = { id: number; miembro: string; tipo: string; monto: number; fecha: string };
const TIPOS = ["Diezmo", "Ofrenda", "Primicia", "Pacto"];
const money = (n: number) => "$" + (n || 0).toLocaleString("es-CO");
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const SEED: Aporte[] = [
  { id: 1, miembro: "Hermano Pedro", tipo: "Diezmo", monto: 150000, fecha: hoy() },
  { id: 2, miembro: "Hermana María", tipo: "Ofrenda", monto: 50000, fecha: hoy() },
  { id: 3, miembro: "Familia Gómez", tipo: "Pacto", monto: 200000, fecha: hoy() },
];

/** Diezmos y ofrendas (módulo de dominio REAL de iglesia): registra aportes por
 *  miembro y tipo, calcula totales del mes y desglose. Persiste vía API si está. */
export function DiezmosModule() {
  const [aportes, setAportes] = useState<Aporte[]>(SEED);
  const [f, setF] = useState({ miembro: "", tipo: "Diezmo", monto: "" });
  // PERSISTE REAL: 1º del SERVER (/data/diezmos, multi-dispositivo), si no, localStorage.
  const _ld = useRef(false);
  const _api = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (_api) {
        try { const r = await fetch(`${_api}/data/diezmos`, { cache: "no-store" });
          if (r.ok) { const d = await r.json(); if (!cancel && Array.isArray(d) && d.length) { setAportes(d); _ld.current = true; return; } } } catch {}
      }
      try { const s = window.localStorage.getItem("sd_diezmos"); if (s && !cancel) setAportes(JSON.parse(s)); } catch {}
      _ld.current = true;
    })();
    return () => { cancel = true; };
  }, [_api]);
  useEffect(() => { if (_ld.current) { try { window.localStorage.setItem("sd_diezmos", JSON.stringify(aportes)); } catch {} } }, [aportes]);

  const total = useMemo(() => aportes.reduce((a, x) => a + x.monto, 0), [aportes]);
  const porTipo = useMemo(() => {
    const m: Record<string, number> = {};
    aportes.forEach((a) => { m[a.tipo] = (m[a.tipo] || 0) + a.monto; });
    return m;
  }, [aportes]);

  function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.miembro || !f.monto) return;
    const nuevo = { id: Date.now(), miembro: f.miembro, tipo: f.tipo, monto: Number(f.monto), fecha: hoy() };
    setAportes((a) => [nuevo, ...a]);
    if (_api) fetch(`${_api}/data/diezmos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nuevo) }).catch(() => {});
    setF({ miembro: "", tipo: "Diezmo", monto: "" });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-brand" />
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand"><HandCoins size={20} /></span>
          <p className="mt-3 text-3xl font-bold text-slate-900">{money(total)}</p>
          <p className="text-sm text-slate-500">Recaudado total</p>
        </Card>
        {TIPOS.map((t) => (
          <Card key={t}><p className="text-sm text-slate-500">{t}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{money(porTipo[t] || 0)}</p></Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={registrar} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Registrar aporte</h3>
          <input value={f.miembro} onChange={(e) => setF({ ...f, miembro: e.target.value })} placeholder="Miembro" aria-label="Miembro"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} aria-label="Tipo"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30">
            {TIPOS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input type="number" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder="Monto" aria-label="Monto"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
          <Button type="submit" className="w-full justify-center"><HandCoins size={16} /> Registrar</Button>
        </form>

        <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <h3 className="text-base font-semibold text-slate-900">Aportes recientes</h3>
            <Badge tone="brand">{aportes.length}</Badge>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr><th className="px-4 py-2 font-semibold">Miembro</th><th className="px-4 py-2 font-semibold">Tipo</th><th className="px-4 py-2 text-right font-semibold">Monto</th><th className="px-4 py-2 font-semibold">Fecha</th></tr>
            </thead>
            <tbody>
              {aportes.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{a.miembro}</td>
                  <td className="px-4 py-2"><Badge tone={a.tipo === "Diezmo" ? "brand" : "info"}>{a.tipo}</Badge></td>
                  <td className="px-4 py-2 text-right font-semibold text-brand">{money(a.monto)}</td>
                  <td className="px-4 py-2 text-slate-500">{a.fecha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DiezmosModule;
