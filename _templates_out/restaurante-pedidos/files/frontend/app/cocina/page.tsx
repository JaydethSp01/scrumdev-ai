"use client";

import { useState } from 'react';

const MOCK_DATA = {
  pedidos: [
    { id: 1, mesa: 'Mesa 1', plato: 'Ensalada César', estado: 'Preparando' },
    { id: 2, mesa: 'Mesa 3', plato: 'Pizza Margarita', estado: 'Listo' },
    { id: 3, mesa: 'Mesa 5', plato: 'Sopa de Tomate', estado: 'Preparando' },
    { id: 4, mesa: 'Mesa 2', plato: 'Pasta Carbonara', estado: 'Listo' },
  ],
  resumen: [
    { label: 'Total Pedidos', valor: 4 },
    { label: 'Pedidos Listos', valor: 2 },
    { label: 'Pedidos Preparando', valor: 2 },
  ],
};

export default function Cocina() {
  const [data] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Cocina</h1>
        <p className="text-neutral-500 mt-1">Estado actual de pedidos</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.resumen.map((item, index) => (
          <div
            key={index}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="text-sm text-neutral-500">{item.label}</p>
            <p className="text-3xl font-bold mt-1">{item.valor}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Lista de Pedidos</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Mesa</th>
              <th className="py-2">Plato</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.pedidos.map((pedido) => (
              <tr
                key={pedido.id}
                className="border-t border-neutral-100 dark:border-neutral-800"
              >
                <td className="py-3">{pedido.mesa}</td>
                <td className="py-3">{pedido.plato}</td>
                <td className="py-3">{pedido.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}