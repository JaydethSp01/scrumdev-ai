"use client";

import { pricingPlans } from '@/lib/mock';

export default function Pricing() {
  return (
    <section id="pricing" className="py-20">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {pricingPlans.map(plan => (
          <div key={plan.id} className={`p-6 rounded-2xl border shadow-sm ${plan.highlight ? 'ring-2 ring-brand' : ''}`}>
            <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
            <p className="text-2xl font-bold mb-4">{plan.price}</p>
            <ul className="text-neutral-500 mb-4">
              {plan.features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
            <button className="bg-brand text-white px-6 py-3 rounded-lg">Choose Plan</button>
          </div>
        ))}
      </div>
    </section>
  );
}