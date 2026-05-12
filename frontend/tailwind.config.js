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
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
        },
        secondary: '#64748b',
      },
      spacing: {
        'section': '2rem',
        'container': '0.5rem',
      },
      borderRadius: {
        'container': '0.5rem',
      },
    },
  },
  plugins: [],
}
