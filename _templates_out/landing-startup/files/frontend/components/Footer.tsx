"use client";

export default function Footer() {
  return (
    <footer className="py-10 bg-gray-800 text-white">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
        <div>
          <h4 className="font-bold mb-4 text-lg">Company</h4>
          <ul className="space-y-2">
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                About Us
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                Careers
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                Contact
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-4 text-lg">Resources</h4>
          <ul className="space-y-2">
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                Blog
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                Help Center
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                Privacy Policy
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-4 text-lg">Follow Us</h4>
          <ul className="space-y-2">
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                Twitter
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                LinkedIn
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
                Facebook
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}