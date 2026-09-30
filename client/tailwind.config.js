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
        primary: {
          DEFAULT: '#FF5A1F',
          50: '#FFF6F2',
          100: '#FFEDE5',
          200: '#FFD7C7',
          300: '#FFB89E',
          400: '#FF8861',
          500: '#FF5A1F',
          600: '#EB470D',
          700: '#C83606',
          800: '#9E2C08',
          900: '#7C260D',
        },
        slate: {
          50: '#F8F9FB',
          100: '#F2F4F7',
          200: '#EAECF0',
          300: '#D0D5DD',
          400: '#98A2B3',
          500: '#667085',
          600: '#475467',
          700: '#344054',
          800: '#1D2939',
          900: '#101828',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'card': '0px 1px 3px rgba(16, 24, 40, 0.05), 0px 1px 2px rgba(16, 24, 40, 0.03)',
        'card-hover': '0px 8px 24px -4px rgba(16, 24, 40, 0.08), 0px 4px 8px -2px rgba(16, 24, 40, 0.04)',
        'dropdown': '0px 12px 32px -4px rgba(16, 24, 40, 0.12), 0px 4px 12px -2px rgba(16, 24, 40, 0.06)'
      }
    },
  },
  plugins: [],
}
