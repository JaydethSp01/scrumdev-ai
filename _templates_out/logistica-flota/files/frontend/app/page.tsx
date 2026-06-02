"use client";
import { useState } from 'react';

const MOCK_DATA = {
  rutas: [
    { id: 1, origen: 'Madrid', destino: 'Barcelona', distancia: '620 km' },
    { id: 2, origen: 'Sevilla', destino: 'Valencia', distancia: '660 km' },
  ],
  vehiculos: [
    { id: 1, modelo: 'Ford Transit', matricula: '1234-ABC' },
    { id: 2, modelo: 'Mercedes Sprinter', matricula: '5678-DEF' },
  ],
  conductores: [
    { id: 1, nombre: 'Juan Pérez', licencia: 'B1234567' },
    { id: 2, nombre: 'Ana Gómez', licencia: 'C2345678' },
  ],
  envios: [
    { id: 1, descripcion: 'Electrodomésticos', fecha: '2023-10-01' },
    { id: 2, descripcion: 'Ropa', fecha: '2023-10-02' },
  ],
};

export default function GestionEnvios() {
  const [data] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Envíos y Flota</h1>
        <p className="text-neutral-500 mt-1">Rutas, Vehículos, Conductores y Envíos</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.rutas.map((ruta) => (
          <div key={ruta.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-500">Ruta</p>
            <p className="text-lg font-bold mt-1">{ruta.origen} - {ruta.destino}</p>
            <p className="text-sm mt-1">{ruta.distancia}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Conductores</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Nombre</th>
              <th className="py-2">Licencia</th>
            </tr>
          </thead>
          <tbody>
            {data.conductores.map((conductor) => (
              <tr key={conductor.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{conductor.nombre}</td>
                <td className="py-3">{conductor.licencia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}