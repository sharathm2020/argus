/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0a0f1e",
          800: "#0d1528",
          700: "#111d35",
          600: "#162240",
          500: "#1e2f52",
        },
        accent: {
          blue: "#F59E0B",
          teal: "#D97706",
          "amber-muted": "#78350F",
          "amber-text": "#FCD34D",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}