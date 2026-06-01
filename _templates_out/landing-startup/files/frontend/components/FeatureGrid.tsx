"use client";

import { features } from '@/lib/mock';
import { LucideIcon } from 'lucide-react';

export default function FeatureGrid() {
  return (
    <section id="features" className="py-20">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {features.map(feature => (
          <div key={feature.id} className="rounded-2xl border shadow-sm hover:shadow-md p-6 text-center">
            <div className="flex justify-center mb-4">
              <LucideIcon name={feature.icon} className="w-12 h-12 text-brand" />
            </div>
            <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
            <p className="text-neutral-500">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}