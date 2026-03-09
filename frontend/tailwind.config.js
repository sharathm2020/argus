/** @type {import('tailwindcss').Config} */
export default {
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
        // Amber accent palette — primary brand color
        accent: {
          blue: "#F59E0B",       // renamed in spirit; amber primary
          teal: "#D97706",       // amber hover / secondary
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
};
