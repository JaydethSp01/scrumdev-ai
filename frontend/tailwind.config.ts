import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#5b6cff",
          50: "#eef0ff",
          100: "#dde2ff",
          200: "#bcc5ff",
          300: "#9aa8ff",
          400: "#7a8bff",
          500: "#5b6cff",
          600: "#3b4be0",
          700: "#2c3ab8",
          800: "#212c8a",
          900: "#181f5c",
          dark: "#3b4be0",
        },
        success: {
          DEFAULT: "#10b981",
          500: "#10b981",
          600: "#059669",
        },
        warning: {
          DEFAULT: "#f59e0b",
          500: "#f59e0b",
          600: "#d97706",
        },
        danger: {
          DEFAULT: "#ef4444",
          500: "#ef4444",
          600: "#dc2626",
        },
        info: {
          DEFAULT: "#3b82f6",
          500: "#3b82f6",
          600: "#2563eb",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        "brand-glow": "0 10px 30px -10px rgba(91, 108, 255, 0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
