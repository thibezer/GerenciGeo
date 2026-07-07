/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'forest-deep': '#0c1510',
        'mint-vibrant': '#00E08A',
        'surface-glass': 'rgba(255, 255, 255, 0.05)',
        'border-glass': 'rgba(255, 255, 255, 0.1)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Tahoma', 'sans-serif'],
        inter: ['Inter', 'Segoe UI', 'Tahoma', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'technical': '4px',
      }
    },
  },
  plugins: [],
}
