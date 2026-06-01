"use client";
import { useState } from 'react';

const MOCK_DATA = [
  { id: 1, name: 'Camisetas', description: 'Variedad de camisetas', image: '/images/camisetas.jpg' },
  { id: 2, name: 'Pantalones', description: 'Pantalones de moda', image: '/images/pantalones.jpg' },
  { id: 3, name: 'Zapatos', description: 'Zapatos casuales y formales', image: '/images/zapatos.jpg' },
  { id: 4, name: 'Accesorios', description: 'Complementos y accesorios', image: '/images/accesorios.jpg' },
];

export default function CategoriesPage() {
  const [categories] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Categorías</h1>
        <p className="text-neutral-500 mt-1">Explora nuestras categorías de productos</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((category) => (
          <div 
            key={category.id} 
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <img src={category.image} alt={category.name} className="w-full h-32 object-cover rounded-t-2xl" />
            <h2 className="text-xl font-semibold mt-4">{category.name}</h2>
            <p className="text-neutral-500 mt-1">{category.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}