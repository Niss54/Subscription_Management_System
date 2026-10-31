/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: '#f8fafc',
          dark: '#121215',
        },
        surface: {
          light: '#ffffff',
          dark: '#1c1d22',
          card: '#1c1d22',
          border: 'rgba(255, 255, 255, 0.08)',
          borderLight: '#e4e4e7',
        },
        tactile: {
          grey: '#2b2c32',
          greyHover: '#363740',
          greyBorder: 'rgba(255, 255, 255, 0.14)',
        }
      }
    },
  },
  plugins: [],
};
