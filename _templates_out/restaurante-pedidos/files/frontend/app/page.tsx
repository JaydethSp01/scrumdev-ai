"use client";
import { useState } from 'react';

const MOCK_DATA = {
  menu: [
    { id: 1, name: 'Pizza Margherita', price: 8.5 },
    { id: 2, name: 'Ensalada César', price: 7.0 },
    { id: 3, name: 'Pasta Carbonara', price: 9.0 },
    { id: 4, name: 'Tiramisu', price: 5.5 }
  ],
  tables: [
    { id: 1, number: 'Mesa 1', status: 'Disponible' },
    { id: 2, number: 'Mesa 2', status: 'Ocupada' },
    { id: 3, number: 'Mesa 3', status: 'Reservada' },
    { id: 4, number: 'Mesa 4', status: 'Disponible' }
  ],
  orders: [
    { id: 1, table: 'Mesa 1', items: 3, total: 25.5 },
    { id: 2, table: 'Mesa 2', items: 2, total: 14.0 }
  ],
  kitchen: [
    { id: 1, order: 1, status: 'En preparación' },
    { id: 2, order: 2, status: 'Listo para servir' }
  ]
};

export default function RestaurantDashboard() {
  const [data] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Restaurante</h1>
        <p className="text-neutral-500 mt-1">Panel de control de operaciones</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.menu.map((item) => (
          <div key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-500">{item.name}</p>
            <p className="text-3xl font-bold mt-1">${item.price.toFixed(2)}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Mesas</h2>
        <ul className="space-y-2">
          {data.tables.map((table) => (
            <li key={table.id} className="flex justify-between border-t border-neutral-100 py-3 dark:border-neutral-800">
              <span>{table.number}</span>
              <span className="text-neutral-500">{table.status}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Pedidos en cocina</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Pedido</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.kitchen.map((order) => (
              <tr key={order.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">Pedido #{order.order}</td>
                <td className="py-3">{order.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}