import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: { colors: { brand: { DEFAULT: "#4f46e5", dark: "#3832a4" }, },},
  },
  plugins: [],
};

export default config;