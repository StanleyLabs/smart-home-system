import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // qr-scanner loads its worker via dynamic import relative to the package; pre-bundling
  // can break that path in dev. Serving the ESM build from node_modules fixes scanning.
  optimizeDeps: {
    exclude: ['qr-scanner'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:80',
    },
  },
})
