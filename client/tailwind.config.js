/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81'
        },
        estate: {
          emerald: '#10b981', // active / approved
          amber: '#f59e0b',   // pending
          rose: '#f43f5e',    // overdue / restricted
          gate: '#0f172a'     // high-contrast dark
        }
      }
    },
  },
  plugins: [],
}
