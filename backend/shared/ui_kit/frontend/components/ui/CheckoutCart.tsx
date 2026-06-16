"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

export type CartItem = { id: string; name: string; variant?: string; price: number; qty: number };

const DEFAULT: CartItem[] = [
  { id: "c1", name: "Vestido floral", variant: "Talla M", price: 49.9, qty: 1 },
  { id: "c2", name: "Chaqueta denim", variant: "Talla L", price: 79.0, qty: 1 },
  { id: "c3", name: "Zapatillas urbanas", variant: "42", price: 64.5, qty: 2 },
];
const money = (n: number) => "$" + n.toFixed(2);

/** Checkout/carrito optimizado (estilo Shopify): líneas con variante y cantidad,
 *  cupón, resumen (subtotal/envío/total) y CTA de pago. Módulo estrella ecommerce. */
export function CheckoutCart({ items = DEFAULT }: { items?: CartItem[] }) {
  const [cart, setCart] = useState<CartItem[]>(items);
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState(0);
  const setQty = (id: string, d: number) =>
    setCart((c) => c.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + d) } : i)));
  const remove = (id: string) => setCart((c) => c.filter((i) => i.id !== id));
  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const shipping = subtotal > 100 || subtotal === 0 ? 0 : 6.9;
  const total = subtotal + shipping - applied;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-3">
        {cart.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">Tu carrito está vacío.</div>
        ) : cart.map((i) => (
          <div key={i.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand/20 to-brand/5 text-brand">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{i.name}</p>
              {i.variant ? <p className="text-sm text-slate-500">{i.variant}</p> : null}
              <p className="text-sm font-bold text-brand">{money(i.price)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setQty(i.id, -1)} className="h-7 w-7 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">−</button>
              <span className="w-6 text-center text-sm font-semibold">{i.qty}</span>
              <button onClick={() => setQty(i.id, 1)} className="h-7 w-7 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">+</button>
            </div>
            <button onClick={() => remove(i.id)} className="text-sm font-medium text-rose-600 hover:underline cursor-pointer">Quitar</button>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Resumen</h3>
        <div className="flex gap-2">
          <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Cupón (DESC10)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
          <button onClick={() => setApplied(coupon.toUpperCase() === "DESC10" ? subtotal * 0.1 : 0)}
            className="rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">Aplicar</button>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-medium">{money(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Envío</dt><dd className="font-medium">{shipping === 0 ? "Gratis" : money(shipping)}</dd></div>
          {applied > 0 ? <div className="flex justify-between text-emerald-600"><dt>Descuento</dt><dd>−{money(applied)}</dd></div> : null}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><dt className="font-semibold">Total</dt><dd className="font-bold text-slate-900">{money(total)}</dd></div>
        </dl>
        <button disabled={total <= 0} className="mt-4 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40 cursor-pointer">
          Pagar {money(total)}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">Pago seguro · 256-bit SSL</p>
      </div>
    </div>
  );
}

export default CheckoutCart;
