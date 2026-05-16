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
        // origin instead of localhost:5173 (which is not in the allowed list).
        // The headers option alone isn't reliable; use configure to force-set it.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Spoof Origin/Referer to match the production host so Spring's
            // CORS filter and CSRF checks treat the request as same-origin.
            proxyReq.setHeader('Origin', 'https://proddsp.omniboard360.io')
            proxyReq.setHeader('Referer', 'https://proddsp.omniboard360.io/')
            // Mark as XHR so Spring Security skips browser-redirect logic.
            proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest')
          })
        },
      },
    },
  },
})
