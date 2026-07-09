/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        space: {
          950: "#030712",
          900: "#0a0f1a",
          800: "#111827",
          700: "#1f2937",
          600: "#374151",
          500: "#6b7280",
          400: "#9ca3af",
          300: "#d1d5db",
          200: "#e5e7eb",
          100: "#f3f4f6",
        },
        cosmic: {
          blue: "#3b82f6",
          purple: "#8b5cf6",
          cyan: "#06b6d4",
          green: "#10b981",
          orange: "#f59e0b",
          red: "#ef4444",
        },
        neon: {
          blue: "#00d4ff",
          purple: "#a855f7",
          green: "#22c55e",
        },
        earth: {
          blue: "#0ea5e9",
          green: "#22c55e",
          brown: "#a16207",
        },
        moon: {
          gray: "#94a3b8",
        },
        star: {
          yellow: "#fbbf24",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
}