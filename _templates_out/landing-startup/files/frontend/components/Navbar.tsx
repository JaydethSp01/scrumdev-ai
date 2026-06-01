"use client";

import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto flex justify-between items-center py-4">
        <div className="text-lg font-bold">BrandLogo</div>
        <div className="hidden md:flex space-x-6">
          <Link href="#features">Features</Link>
          <Link href="#testimonials">Testimonials</Link>
          <Link href="#pricing">Pricing</Link>
        </div>
        <button className="bg-brand text-white px-4 py-2 rounded-lg">Get Started</button>
      </div>
    </nav>
  );
}