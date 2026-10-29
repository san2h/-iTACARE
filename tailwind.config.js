/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#10b981", // Verde iTACARÉ+ 
        secondary: "#0ea5e9", // Azul
      },
      // � Aqui está a configuração da fonte Play!
      fontFamily: {
        sans: ['Play', 'sans-serif'], 
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
}