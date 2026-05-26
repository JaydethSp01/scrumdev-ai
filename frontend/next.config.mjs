/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // F5 PR-B: tree-shake del barrel de lucide-react (20+ iconos por archivo)
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  env: {
    NEXT_PUBLIC_API_GATEWAY_URL:
      process.env.NEXT_PUBLIC_API_GATEWAY_URL || "http://localhost:8080",
    NEXT_PUBLIC_WS_URL:
      process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8002",
  },
};
export default nextConfig;
