/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        display: ['Bebas Neue', 'Impact', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#e9fcff',
          100: '#c9f8ff',
          200: '#99f1ff',
          300: '#00f0ff',
          400: '#ff8297',
          500: '#ff1744',
          600: '#e5153d',
          700: '#bd1235',
          800: '#93102e',
          900: '#6c0c25',
          950: '#3c0719',
        },
        comic: {
          red: '#ff1744',
          cyan: '#00f0ff',
          yellow: '#ffe600',
          magenta: '#d946ef',
          ink: '#0a0a10',
        },
        surface: {
          DEFAULT: '#131319',
          card:    '#1b1b21',
          elevated:'#25242b',
          border:  '#393840',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #ff1744 0%, #d946ef 100%)',
        'gradient-dark':  'linear-gradient(180deg, #131319 0%, #1b1b21 100%)',
      },
      animation: {
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:     { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:    { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft:  { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
      },
    },
  },
  plugins: [],
};
