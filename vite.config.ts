import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // NUL-231: dev-only proxy so cookie-bearing /api fetches from :5173
    // reach the Hono backend on :8787 same-origin, avoiding browser CORS
    // preflight. Production is already same-origin (nginx serves SPA + /api
    // from one host), so this block has no production effect.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: false,
        secure: false,
      },
    },
  },
})
