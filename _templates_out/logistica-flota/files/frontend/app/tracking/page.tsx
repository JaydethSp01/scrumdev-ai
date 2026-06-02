"use client";
import { useState } from 'react';

const MOCK_DATA = {
  trackings: [
    { id: 1, ruta: 'Ruta 1', vehiculo: 'Camión A', conductor: 'Juan Pérez', estado: 'En tránsito' },
    { id: 2, ruta: 'Ruta 2', vehiculo: 'Camión B', conductor: 'María López', estado: 'Entregado' },
    { id: 3, ruta: 'Ruta 3', vehiculo: 'Camión C', conductor: 'Carlos García', estado: 'Pendiente' },
    { id: 4, ruta: 'Ruta 4', vehiculo: 'Camión D', conductor: 'Ana Martínez', estado: 'En tránsito' },
  ]
};

export default function TrackingPage() {
  const [trackings] = useState(MOCK_DATA.trackings);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Seguimiento de Envíos</h1>
        <p className="text-neutral-500 mt-1">Monitorea el estado de tus envíos en tiempo real</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {trackings.map(tracking => (
          <div key={tracking.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-500">Ruta: {tracking.ruta}</p>
            <p className="text-lg font-semibold mt-1">Vehículo: {tracking.vehiculo}</p>
            <p className="text-lg font-semibold">Conductor: {tracking.conductor}</p>
            <p className="text-sm text-neutral-500 mt-1">Estado: {tracking.estado}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Detalle de Tracking</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Ruta</th>
              <th className="py-2">Vehículo</th>
              <th className="py-2">Conductor</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {trackings.map(tracking => (
              <tr key={tracking.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{tracking.ruta}</td>
                <td className="py-3">{tracking.vehiculo}</td>
                <td className="py-3">{tracking.conductor}</td>
                <td className="py-3">{tracking.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}