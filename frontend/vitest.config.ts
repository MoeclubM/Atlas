import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./react-src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    globals: false,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
      include: [
        'react-src/lib/**/*.{ts,tsx}',
        'react-src/state/**/*.{ts,tsx}',
        'react-src/pages/**/*.{ts,tsx}',
      ],
      exclude: [
        'react-src/main.tsx',
        'react-src/vite-env.d.ts',
        'react-src/i18n.ts',
        'react-src/locales/**',
      ],
    },
  },
})
