"use client";
import { useState } from 'react';

const MOCK_DATA = {
  propiedades: [
    { id: 1, nombre: "Casa en la playa", precio: "$500,000", ubicacion: "Cancún" },
    { id: 2, nombre: "Apartamento en la ciudad", precio: "$300,000", ubicacion: "Ciudad de México" },
    { id: 3, nombre: "Villa en la montaña", precio: "$750,000", ubicacion: "Monterrey" },
    { id: 4, nombre: "Estudio moderno", precio: "$200,000", ubicacion: "Guadalajara" },
  ],
  agentes: [
    { id: 1, nombre: "Juan Pérez", ventas: 25 },
    { id: 2, nombre: "María López", ventas: 30 },
    { id: 3, nombre: "Carlos García", ventas: 20 },
    { id: 4, nombre: "Ana Torres", ventas: 15 },
  ],
};

export default function PortalInmobiliario() {
  const [data] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Portal Inmobiliario</h1>
        <p className="text-neutral-500 mt-1">Propiedades, Agentes y más</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.propiedades.map((propiedad) => (
          <div key={propiedad.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="font-semibold">{propiedad.nombre}</h2>
            <p className="text-sm text-neutral-500">{propiedad.ubicacion}</p>
            <p className="text-lg font-bold mt-1">{propiedad.precio}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Agentes</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Nombre</th>
              <th className="py-2">Ventas</th>
            </tr>
          </thead>
          <tbody>
            {data.agentes.map((agente) => (
              <tr key={agente.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{agente.nombre}</td>
                <td className="py-3">{agente.ventas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}