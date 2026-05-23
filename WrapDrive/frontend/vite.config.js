import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/items': 'http://localhost:8000',
      '/add_item': 'http://localhost:8000',
      '/search': 'http://localhost:8000',
    },
  },
})
