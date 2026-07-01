/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
      },
      colors: {
        sidebar: {
          bg: "#0c0a09",
          hover: "#1c1917",
          border: "#292524",
          text: "#a8a29e",
          "text-active": "#fafaf9",
        },
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          900: "#14532d",
        },
      },
    },
  },
  plugins: [],
};
