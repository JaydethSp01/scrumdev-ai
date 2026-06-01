"use client";
import { useState } from 'react';

const MOCK_CARRITO = {
  productos: [
    { id: 1, nombre: 'Camiseta básica', precio: 25, imagen: 'https://via.placeholder.com/150' },
    { id: 2, nombre: 'Pantalones vaqueros', precio: 40, imagen: 'https://via.placeholder.com/150' },
    { id: 3, nombre: 'Zapatillas deportivas', precio: 60, imagen: 'https://via.placeholder.com/150' },
    { id: 4, nombre: 'Chaqueta de cuero', precio: 120, imagen: 'https://via.placeholder.com/150' }
  ],
  total: 245
};

export default function CarritoPage() {
  const [carrito] = useState(MOCK_CARRITO);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Carrito de Compras</h1>
        <p className="text-neutral-500 mt-1">Revisa los productos en tu carrito</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {carrito.productos.map((producto) => (
          <div key={producto.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <img src={producto.imagen} alt={producto.nombre} className="w-full h-32 object-cover rounded-t-2xl" />
            <div className="mt-4">
              <p className="text-lg font-semibold">{producto.nombre}</p>
              <p className="text-sm text-neutral-500 mt-1">${producto.precio}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Resumen del Carrito</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Producto</th>
              <th className="py-2">Precio</th>
            </tr>
          </thead>
          <tbody>
            {carrito.productos.map((producto) => (
              <tr key={producto.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{producto.nombre}</td>
                <td className="py-3">${producto.precio}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-3 font-semibold">Total</td>
              <td className="py-3 font-semibold">${carrito.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}