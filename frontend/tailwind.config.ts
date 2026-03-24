import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './react-src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 18px 40px rgba(15, 23, 42, 0.12)',
        panel: '0 10px 24px rgba(15, 23, 42, 0.08)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      colors: {
        ink: '#0f172a',
        mist: '#e5eef8',
        line: 'rgba(100, 116, 139, 0.22)',
      },
    },
  },
  plugins: [],
} satisfies Config
