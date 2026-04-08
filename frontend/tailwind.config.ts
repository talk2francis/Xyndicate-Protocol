import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "xyn-gold": "#C9A84C",
        "xyn-dark": "#0A0A0A",
        "xyn-surface": "#F5F4F0",
        "xyn-muted": "#6B6A65",
      },
    },
  },
  plugins: [],
};

export default config;
