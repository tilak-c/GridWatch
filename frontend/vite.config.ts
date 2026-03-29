import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://backend:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_API_URL || 'http://backend:5000',
        ws: true,
      },
    },
  },
  preview: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://backend:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_API_URL || 'http://backend:5000',
        ws: true,
      },
    },
  },
})
