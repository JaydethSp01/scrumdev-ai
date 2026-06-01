"use client";
import { useState } from 'react';

const MOCK_DATA = {
  products: [
    { id: 1, name: 'Camiseta Básica', price: 19.99, category: 'Ropa' },
    { id: 2, name: 'Jeans Ajustados', price: 39.99, category: 'Ropa' },
    { id: 3, name: 'Zapatillas Deportivas', price: 59.99, category: 'Calzado' },
    { id: 4, name: 'Bolso de Mano', price: 49.99, category: 'Accesorios' }
  ],
  orders: [
    { id: 1, status: 'Enviado', total: 59.99 },
    { id: 2, status: 'Pendiente', total: 19.99 }
  ]
};

export default function ShopPage() {
  const [data] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Tienda de Moda</h1>
        <p className="text-neutral-500 mt-1">Explora nuestros productos</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.products.map((product) => (
          <div
            key={product.id}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="text-lg font-semibold">{product.name}</h2>
            <p className="text-sm text-neutral-500">{product.category}</p>
            <p className="text-xl font-bold mt-1">${product.price.toFixed(2)}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Pedidos Recientes</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">ID</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((order) => (
              <tr key={order.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{order.id}</td>
                <td className="py-3">{order.status}</td>
                <td className="py-3">${order.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}