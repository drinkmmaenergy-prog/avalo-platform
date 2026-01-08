/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f7ff',
          100: '#ebf0ff',
          200: '#d6e0ff',
          300: '#b8c9ff',
          400: '#8fa8ff',
          500: '#667eea',
          600: '#5568d3',
          700: '#4553b8',
          800: '#37429e',
          900: '#2d3585',
        },
      },
    },
  },
  plugins: [],
}