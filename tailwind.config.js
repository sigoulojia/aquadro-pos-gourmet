/** @type {import("tailwindcss").Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        pizzeria: {
          orange: "#E87524",
          "orange-hover": "#D46317",
          "orange-light": "#FFF3EB",
          yellow: "#FFC928",
          "yellow-hover": "#F5BD1A",
          "yellow-light": "#FFF9E6",
          red: "#B9362B",
          "red-hover": "#9E2D23",
          cream: "#FFF8EF",
          charcoal: "#292522",
          border: "#E9DCCB",
          surface: "#FFFFFF",
          green: "#27864A",
        },
        pos: {
          bg: "#FFF8EF",
          card: "#FFFFFF",
          border: "#E9DCCB",
          muted: "#78716C",
          accent: "#E87524",
          success: "#27864A",
          warning: "#FFC928",
          danger: "#C62828",
          brand: "#E87524",
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"]
      }
    },
  },
  plugins: [],
}
