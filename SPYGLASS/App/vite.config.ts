import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Same variable the app reads (see src/projectsApi.ts), loaded here too
  // so the dev proxy below knows where to forward requests.
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_SPYGLASS_API_BASE_URL?.trim().replace(/\/+$/, '')

  return {
    plugins: [react()],
    server: {
      // Dev-only CORS workaround: the browser calls /api/... on this same
      // localhost origin (so CORS never applies), and Vite forwards it
      // server-side to the real API with the /api prefix stripped, e.g.
      //   /api/get_test_list/Pulsejet -> <target>/get_test_list/Pulsejet
      // This only exists under `npm run dev`. A production build calls the
      // server directly, so the server itself must send CORS headers
      // (Access-Control-Allow-Origin) before the app is deployed.
      proxy: apiTarget
        ? {
            '/api': {
              target: apiTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          }
        : undefined,
    },
  }
})
