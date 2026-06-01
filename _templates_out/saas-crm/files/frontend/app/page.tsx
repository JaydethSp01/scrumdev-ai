"use client";
import { useState } from 'react';

const MOCK_DATA = {
  leads: [
    { id: 1, nombre: 'Juan Pérez', email: 'juanperez@example.com', estado: 'Nuevo' },
    { id: 2, nombre: 'Ana Gómez', email: 'anagomez@example.com', estado: 'Contactado' },
    { id: 3, nombre: 'Luis Martínez', email: 'luismartinez@example.com', estado: 'Calificado' },
    { id: 4, nombre: 'Maria López', email: 'marialopez@example.com', estado: 'Perdido' },
  ],
  oportunidades: [
    { id: 1, nombre: 'Oportunidad A', etapa: 'Prospecto', valor: 5000 },
    { id: 2, nombre: 'Oportunidad B', etapa: 'Negociación', valor: 15000 },
  ],
  contactos: [
    { id: 1, nombre: 'Carlos Ruiz', empresa: 'TechCorp' },
    { id: 2, nombre: 'Elena Ríos', empresa: 'SoftSolutions' },
  ],
};

export default function CRMPage() {
  const [data] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">CRM de Ventas</h1>
        <p className="text-neutral-500 mt-1">Gestión de leads, oportunidades y contactos</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.oportunidades.map((op) => (
          <div key={op.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-lg font-semibold">{op.nombre}</h3>
            <p className="text-sm text-neutral-500">Etapa: {op.etapa}</p>
            <p className="text-xl font-bold mt-1">${op.valor}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Leads</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Nombre</th>
              <th className="py-2">Email</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.leads.map((lead) => (
              <tr key={lead.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{lead.nombre}</td>
                <td className="py-3">{lead.email}</td>
                <td className="py-3">{lead.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}