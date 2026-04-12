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
        "xyn-blue": "#7BC8F6",
        "xyn-blue-dark": "#1A3A5C",
        "xyn-blue-mid": "#5BA8E8",
        "xyn-blue-dim": "#2A5A8C",
        "xyn-dark": "#0A0A0A",
        "xyn-surface": "#F5F4F0",
        "xyn-muted": "#6B6A65",
      },
    },
  },
  plugins: [],
};

export default config;
