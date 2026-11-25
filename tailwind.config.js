/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        abyss: '#04060d',
        night: { 900: '#060a18', 800: '#0a1124', 700: '#101a36', 600: '#18244a' },
        neon: { DEFAULT: '#39ff88', soft: '#7dffb2', dim: '#1f8f52' },
        gold: { DEFAULT: '#f5c542', soft: '#ffe08a' },
        danger: '#ff4d6d',
      },
      fontFamily: {
        display: ['"Chakra Petch"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 24px -4px rgba(57,255,136,.55)',
        gold: '0 0 24px -4px rgba(245,197,66,.55)',
        card: '0 10px 30px -12px rgba(0,0,0,.8)',
        'card-hover': '0 30px 60px -18px rgba(0,0,0,.9), 0 0 40px -10px rgba(57,255,136,.35)',
      },
      keyframes: {
        'gradient-x': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100vh)' } },
        'ping-slow': { '75%,100%': { transform: 'scale(2.4)', opacity: '0' } },
      },
      animation: {
        'gradient-x': 'gradient-x 6s ease infinite',
        scan: 'scan 9s linear infinite',
        'ping-slow': 'ping-slow 1.8s cubic-bezier(0,0,.2,1) infinite',
      },
    },
  },
  plugins: [],
};
