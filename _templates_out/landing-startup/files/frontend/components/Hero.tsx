"use client";

export default function Hero() {
  return (
    <section className="py-20 bg-gray-100">
      <div className="max-w-6xl mx-auto text-center">
        <h1 className="text-5xl font-bold tracking-tight">Welcome to Our Service</h1>
        <p className="text-neutral-500 text-lg mt-4">Our software helps you achieve more with less effort.</p>
        <div className="mt-8 flex justify-center space-x-4">
          <button className="bg-brand text-white px-6 py-3 rounded-lg">Start Now</button>
          <button className="border border-brand text-brand px-6 py-3 rounded-lg">Learn More</button>
        </div>
      </div>
    </section>
  );
}