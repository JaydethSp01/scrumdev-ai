"use client";
import { useState } from 'react';

const MOCK_DATA = {
  features: [
    { id: 1, title: 'Automatización de Procesos', description: 'Optimiza tus flujos de trabajo con nuestras herramientas.' },
    { id: 2, title: 'Análisis en Tiempo Real', description: 'Toma decisiones informadas con datos actualizados al instante.' },
    { id: 3, title: 'Integración con API', description: 'Conecta fácilmente con tus sistemas existentes.' },
    { id: 4, title: 'Soporte 24/7', description: 'Estamos aquí para ayudarte en cualquier momento.' }
  ],
  testimonials: [
    { id: 1, name: 'Juan Pérez', feedback: 'Esta plataforma ha transformado nuestra forma de trabajar.' },
    { id: 2, name: 'Ana Gomez', feedback: 'El soporte es excepcional y las herramientas son intuitivas.' }
  ],
  pricing: [
    { id: 1, plan: 'Básico', price: '$29/mes', features: ['Acceso a funciones básicas', 'Soporte por email'] },
    { id: 2, plan: 'Profesional', price: '$59/mes', features: ['Todas las funciones', 'Soporte 24/7', 'Integración avanzada'] }
  ]
};

export default function LandingPage() {
  const [data] = useState(MOCK_DATA);

  return (
    <div className="p-8 space-y-8">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Lanza tu Startup con Nuestro Software B2B</h1>
        <p className="text-neutral-500 mt-2">Soluciones que impulsan tu negocio al siguiente nivel</p>
      </header>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.features.map(feature => (
          <div key={feature.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-xl font-semibold">{feature.title}</h2>
            <p className="text-neutral-500 mt-2">{feature.description}</p>
          </div>
        ))}
      </section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Testimonios</h2>
        <ul className="space-y-4">
          {data.testimonials.map(testimonial => (
            <li key={testimonial.id} className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
              <p className="text-lg font-semibold">{testimonial.name}</p>
              <p className="text-neutral-500">{testimonial.feedback}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold mb-4">Planes de Precios</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Plan</th>
              <th className="py-2">Precio</th>
              <th className="py-2">Características</th>
            </tr>
          </thead>
          <tbody>
            {data.pricing.map(plan => (
              <tr key={plan.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-3">{plan.plan}</td>
                <td className="py-3">{plan.price}</td>
                <td className="py-3">{plan.features.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}