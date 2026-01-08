/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f7ff',
          100: '#ebf0fe',
          200: '#d6e0fd',
          300: '#b3c7fb',
          400: '#8aa4f7',
          500: '#667eea',
          600: '#5568d3',
          700: '#4653b8',
          800: '#3a4495',
          900: '#323a77',
        },
        secondary: {
          500: '#764ba2',
          600: '#643d8a',
          700: '#533073',
        },
      },
    },
  },
  plugins: [],
}
