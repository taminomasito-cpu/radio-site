import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      // Proxy all backend API + Socket.IO paths to the real server (port 3001) in development.
      // This makes relative fetch('/auth/...') and the recovery endpoint work whether you run
      // `npm run dev` (vite only) + separate server, or `npm run dev:all`.
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/online': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Socket.IO (engine.io) — both HTTP polling fallback and WS upgrade
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
