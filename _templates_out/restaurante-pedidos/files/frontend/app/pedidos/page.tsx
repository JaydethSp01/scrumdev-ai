"use client";
import { useState } from 'react';

const MOCK_DATA = {
  pedidos: [
    { id: 1, mesa: 'Mesa 1', cliente: 'Juan Pérez', estado: 'Pendiente', total: 45.50 },
    { id: 2, mesa: 'Mesa 3', cliente: 'María López', estado: 'En preparación', total: 78.00 },
    { id: 3, mesa: 'Mesa 5', cliente: 'Carlos García', estado: 'Servido', total: 32.20 },
    { id: 4, mesa: 'Mesa 2', cliente: 'Ana Torres', estado: 'Pendiente', total: 56.10 }
  ]
};

export default function PedidosPage() {
  const [pedidos] = useState(MOCK_DATA.pedidos);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Pedidos</h1>
        <p className="text-neutral-500 mt-1">Visualiza y gestiona los pedidos actuales</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pedidos.map((pedido) => (
          <div
            key={pedido.id}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="text-sm text-neutral-500">Mesa: {pedido.mesa}</p>
            <p className="text-lg font-semibold">Cliente: {pedido.cliente}</p>
            <p className="mt-2 text-sm text-neutral-500">Estado: {pedido.estado}</p>
            <p className="mt-1 text-xl font-bold">Total: ${pedido.total.toFixed(2)}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Lista de Pedidos</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Mesa</th>
              <th className="py-2">Cliente</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((pedido) => (
              <tr key={pedido.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{pedido.mesa}</td>
                <td className="py-3">{pedido.cliente}</td>
                <td className="py-3">{pedido.estado}</td>
                <td className="py-3">${pedido.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}