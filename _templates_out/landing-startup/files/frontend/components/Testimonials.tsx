"use client";

import { testimonials } from '@/lib/mock';

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {testimonials.map(testimonial => (
          <div key={testimonial.id} className="p-6 rounded-2xl border shadow-sm">
            <div className="flex items-center mb-4">
              <img src={testimonial.avatar} alt={testimonial.name} className="w-12 h-12 rounded-full mr-4" />
              <div>
                <h4 className="font-bold">{testimonial.name}</h4>
                <p className="text-neutral-500 text-sm">Customer</p>
              </div>
            </div>
            <p className="text-neutral-700">“{testimonial.quote}”</p>
          </div>
        ))}
      </div>
    </section>
  );
}