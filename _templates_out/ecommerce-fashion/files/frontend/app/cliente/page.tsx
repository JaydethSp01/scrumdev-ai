"use client";
import { useState } from 'react';

const MOCK_DATA = {
  productos: [
    { id: 1, nombre: 'Camiseta de Algodón', precio: 25.99, categoria: 'Ropa' },
    { id: 2, nombre: 'Jeans Denim', precio: 49.99, categoria: 'Ropa' },
    { id: 3, nombre: 'Zapatillas Running', precio: 89.99, categoria: 'Calzado' },
    { id: 4, nombre: 'Gorra Deportiva', precio: 19.99, categoria: 'Accesorios' }
  ],
  clientes: [
    { id: 1, nombre: 'Juan Pérez', email: 'juan.perez@example.com' },
    { id: 2, nombre: 'María Gómez', email: 'maria.gomez@example.com' }
  ]
};

export default function ClientePage() {
  const [data] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <p className="text-neutral-500 mt-1">Listado de clientes registrados</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.clientes.map((cliente) => (
          <div
            key={cliente.id}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="text-xl font-semibold">{cliente.nombre}</h2>
            <p className="text-sm text-neutral-500">{cliente.email}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Productos</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Nombre</th>
              <th className="py-2">Precio</th>
              <th className="py-2">Categoría</th>
            </tr>
          </thead>
          <tbody>
            {data.productos.map((producto) => (
              <tr
                key={producto.id}
                className="border-t border-neutral-100 dark:border-neutral-800"
              >
                <td className="py-3">{producto.nombre}</td>
                <td className="py-3">${producto.precio.toFixed(2)}</td>
                <td className="py-3">{producto.categoria}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}