"use client";

import { useState } from 'react';

const MOCK_DATA = {
  mesas: [
    { id: 1, numero: 'Mesa 1', capacidad: 4, estado: 'Disponible' },
    { id: 2, numero: 'Mesa 2', capacidad: 2, estado: 'Ocupada' },
    { id: 3, numero: 'Mesa 3', capacidad: 6, estado: 'Reservada' },
    { id: 4, numero: 'Mesa 4', capacidad: 4, estado: 'Disponible' }
  ]
};

export default function MesasPage() {
  const [mesas] = useState(MOCK_DATA.mesas);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Mesas</h1>
        <p className="text-neutral-500 mt-1">Vista general de las mesas del restaurante</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mesas.map((mesa) => (
          <div
            key={mesa.id}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="text-sm text-neutral-500">{mesa.numero}</p>
            <p className="text-lg font-bold mt-1">Capacidad: {mesa.capacidad}</p>
            <p className="text-sm mt-1">Estado: {mesa.estado}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Detalles de Mesas</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Número</th>
              <th className="py-2">Capacidad</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {mesas.map((mesa) => (
              <tr key={mesa.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{mesa.numero}</td>
                <td className="py-3">{mesa.capacidad}</td>
                <td className="py-3">{mesa.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}