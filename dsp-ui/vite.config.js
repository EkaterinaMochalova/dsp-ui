import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://proddsp.omniboard360.io',
        changeOrigin: true,
        secure: true,
        // Override Origin so Spring's CORS filter sees the backend's own
        // origin instead of localhost:5173 (which is not in the allowed list)
        headers: {
          origin: 'https://proddsp.omniboard360.io',
        },
      },
    },
  },
})
