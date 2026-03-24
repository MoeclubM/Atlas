import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath, URL } from 'node:url'

const backendPort = process.env.VITE_BACKEND_PORT || '8080'
const backendHttp = `http://localhost:${backendPort}`
const backendWs = `ws://localhost:${backendPort}`

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./react-src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: backendHttp,
        changeOrigin: true,
      },
      '/ws': {
        target: backendWs,
        ws: true,
      },
    },
  },
})
