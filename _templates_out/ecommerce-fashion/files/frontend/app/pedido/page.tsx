"use client";
import { useState } from 'react';

const MOCK_ORDERS = [
  {
    id: 1,
    cliente: 'Juan Pérez',
    estado: 'Enviado',
    total: 120.50,
    productos: [
      { nombre: 'Camiseta Básica', precio: 25.00 },
      { nombre: 'Jeans Clásico', precio: 45.50 },
    ],
  },
  {
    id: 2,
    cliente: 'María Gomez',
    estado: 'Procesando',
    total: 75.00,
    productos: [
      { nombre: 'Blusa Elegante', precio: 35.00 },
      { nombre: 'Falda Larga', precio: 40.00 },
    ],
  },
  {
    id: 3,
    cliente: 'Carlos López',
    estado: 'Entregado',
    total: 200.00,
    productos: [
      { nombre: 'Chaqueta de Cuero', precio: 150.00 },
      { nombre: 'Zapatos de Cuero', precio: 50.00 },
    ],
  },
  {
    id: 4,
    cliente: 'Ana Martínez',
    estado: 'Cancelado',
    total: 60.00,
    productos: [
      { nombre: 'Vestido de Verano', precio: 60.00 },
    ],
  },
];

export default function PedidoPage() {
  const [orders] = useState(MOCK_ORDERS);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>
        <p className="text-neutral-500 mt-1">Resumen de pedidos recientes</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {orders.map((order) => (
          <div key={order.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-500">Cliente: {order.cliente}</p>
            <p className="text-sm text-neutral-500">Estado: {order.estado}</p>
            <p className="text-2xl font-bold mt-1">${order.total.toFixed(2)}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Detalles de Pedidos</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Cliente</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{order.cliente}</td>
                <td className="py-3">{order.estado}</td>
                <td className="py-3">${order.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}