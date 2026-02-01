/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', '"Avenir Next"', 'sans-serif'],
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
      },
      colors: {
        'bg-1': '#f5efe8',
        'bg-2': '#fbead8',
        'bg-3': '#e4f0ef',
        surface: '#fff7f0',
        'surface-strong': '#ffffff',
        text: '#1c1c1f',
        muted: '#5d5d63',
        accent: '#ff6b4a',
        'accent-2': '#2ec4b6',
        'accent-soft': '#ffd6b0',
      },
      backgroundImage: {
        app: 'linear-gradient(160deg, #f5efe8, #fbead8 45%, #e4f0ef)',
      },
      boxShadow: {
        soft: '0 24px 60px rgba(28, 28, 31, 0.12)',
        glow: '0 10px 24px rgba(28, 28, 31, 0.2)',
        button: '0 14px 26px rgba(255, 107, 74, 0.25)',
      },
      keyframes: {
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        floatIn: 'floatIn 0.8s ease-out both',
        floatInDelayed: 'floatIn 0.9s ease-out both 0.1s',
      },
    },
  },
  plugins: [],
};
