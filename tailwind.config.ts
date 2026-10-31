import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        panel: "hsl(var(--panel))",
        muted: "hsl(var(--muted))",
        accent: "hsl(var(--accent))",
        border: "hsl(var(--border))",
      },
      boxShadow: {
        glow: "0 0 42px rgba(111, 92, 255, 0.18)",
      },
      animation: {
        "fade-in": "fade-in 250ms ease-out",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(5px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
