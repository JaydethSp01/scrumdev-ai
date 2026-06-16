"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/** Facturación electrónica REAL (PYMES Colombia). Crea facturas contra el API
 *  (FastAPI + Postgres): el servidor calcula IVA/retención, asigna consecutivo y
 *  CUFE (estructura DIAN). NO es demo: persiste de verdad. */
const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const money = (n: number) => "$" + (n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0 });
type Item = { descripcion: string; cantidad: number; valor_unitario: number };
type Factura = any;

export function FacturacionModule() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cliente, setCliente] = useState({ nombre: "", nit: "", email: "" });
  const [items, setItems] = useState<Item[]>([{ descripcion: "", cantidad: 1, valor_unitario: 0 }]);
  const [ivaPct, setIvaPct] = useState(19);
  const [retePct, setRetePct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<Factura | null>(null);

  const subtotal = items.reduce((a, i) => a + (i.cantidad || 0) * (i.valor_unitario || 0), 0);
  const iva = subtotal * ivaPct / 100;
  const rete = subtotal * retePct / 100;
  const total = subtotal + iva - rete;

  async function load() {
    setLoading(true); setError("");
    // Render free "duerme" tras inactividad -> el 1er request puede tardar/fallar
    // (cold start ~50s). Reintentamos con espera para no mostrar un falso error.
    for (let intento = 0; intento < 5; intento++) {
      try {
        const r = await fetch(`${API}/facturas`, { cache: "no-store" });
        if (r.ok) { setFacturas(await r.json()); setError(""); setLoading(false); return; }
      } catch { /* reintentar */ }
      if (intento === 0) setError("Conectando con el servidor…");
      await new Promise((res) => setTimeout(res, 4000));
    }
    setError("No se pudo conectar con el API de facturación.");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((xs) => xs.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function emitir(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente.nombre || items.every((i) => !i.descripcion)) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`${API}/facturas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_nombre: cliente.nombre, cliente_nit: cliente.nit, cliente_email: cliente.email,
          items: items.filter((i) => i.descripcion), iva_pct: ivaPct, retefuente_pct: retePct,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const f = await r.json();
      setSel(f);
      setCliente({ nombre: "", nit: "", email: "" });
      setItems([{ descripcion: "", cantidad: 1, valor_unitario: 0 }]);
      await load();
    } catch (err: any) {
      setError("No se pudo emitir la factura. " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* formulario de emisión */}
      <form onSubmit={emitir} className="space-y-4 lg:col-span-2">
        <Card>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Datos del cliente</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <input required value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })}
              aria-label="Nombre o razón social" placeholder="Nombre / razón social"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
            <input value={cliente.nit} onChange={(e) => setCliente({ ...cliente, nit: e.target.value })}
              aria-label="NIT" placeholder="NIT / Cédula"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
            <input value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })}
              aria-label="Correo" placeholder="Correo" type="email"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Ítems</h3>
            <Button type="button" variant="secondary" onClick={() => setItems([...items, { descripcion: "", cantidad: 1, valor_unitario: 0 }])}>
              <Plus size={16} /> Ítem
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <input value={it.descripcion} onChange={(e) => setItem(i, { descripcion: e.target.value })}
                  aria-label="Descripción" placeholder="Descripción"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
                <input type="number" min="0" value={it.cantidad} onChange={(e) => setItem(i, { cantidad: +e.target.value })}
                  aria-label="Cantidad" placeholder="Cant."
                  className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
                <input type="number" min="0" value={it.valor_unitario} onChange={(e) => setItem(i, { valor_unitario: +e.target.value })}
                  aria-label="Valor unitario" placeholder="Valor unit."
                  className="w-32 rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
                <button type="button" onClick={() => setItems(items.filter((_, x) => x !== i))}
                  aria-label="Quitar ítem" className="rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600 cursor-pointer">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">IVA %
              <input type="number" value={ivaPct} onChange={(e) => setIvaPct(+e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
            </label>
            <label className="text-sm text-slate-600">Retefuente %
              <input type="number" value={retePct} onChange={(e) => setRetePct(+e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
            </label>
          </div>
        </Card>

        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
        <Card>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-medium">{money(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">IVA ({ivaPct}%)</dt><dd className="font-medium">{money(iva)}</dd></div>
            {retePct > 0 ? <div className="flex justify-between text-rose-600"><dt>Retefuente ({retePct}%)</dt><dd>−{money(rete)}</dd></div> : null}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base"><dt className="font-semibold">Total</dt><dd className="font-bold text-slate-900">{money(total)}</dd></div>
          </dl>
          <Button type="submit" disabled={saving} className="mt-4 w-full justify-center">
            <FileText size={16} /> {saving ? "Emitiendo…" : "Emitir factura electrónica"}
          </Button>
        </Card>
      </form>

      {/* facturas emitidas */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Facturas emitidas</h3>
        {loading ? <p className="text-sm text-slate-400">Cargando…</p>
          : facturas.length === 0 ? <p className="text-sm text-slate-400">Aún no hay facturas. Emite la primera.</p>
          : facturas.map((f) => (
            <button key={f.id} onClick={() => setSel(f)}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:shadow-md cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{f.numero}</span>
                <Badge tone={f.estado === "Pagada" ? "success" : "warning"}>{f.estado}</Badge>
              </div>
              <p className="truncate text-sm text-slate-500">{f.cliente_nombre}</p>
              <p className="text-sm font-bold text-brand">{money(f.total)}</p>
            </button>
          ))}
      </div>

      {/* detalle (CUFE) */}
      {sel ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setSel(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Factura {sel.numero}</h3>
              <Badge tone="brand">Electrónica · DIAN</Badge>
            </div>
            <p className="text-sm text-slate-600">{sel.cliente_nombre} · NIT {sel.cliente_nit || "—"}</p>
            <p className="text-sm text-slate-500">Fecha: {sel.fecha}</p>
            <div className="my-3 space-y-1 border-y border-slate-100 py-3 text-sm">
              {(sel.items || []).map((it: any, i: number) => (
                <div key={i} className="flex justify-between"><span>{it.cantidad} × {it.descripcion}</span><span>{money(it.cantidad * it.valor_unitario)}</span></div>
              ))}
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{money(sel.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">IVA ({sel.iva_pct}%)</dt><dd>{money(sel.iva_valor)}</dd></div>
              {sel.retefuente_valor > 0 ? <div className="flex justify-between text-rose-600"><dt>Retefuente</dt><dd>−{money(sel.retefuente_valor)}</dd></div> : null}
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{money(sel.total)}</dd></div>
            </dl>
            <p className="mt-3 break-all rounded-lg bg-slate-50 p-2 text-[10px] text-slate-500">CUFE: {sel.cufe}</p>
            <Button variant="secondary" className="mt-4 w-full justify-center" onClick={() => setSel(null)}>Cerrar</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default FacturacionModule;
