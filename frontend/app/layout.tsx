import "./globals.css";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/app/auth/AuthProvider";

export const metadata: Metadata = {
  title: "ScrumDev AI",
  description: "Plataforma multiagente para desarrollo ágil",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
