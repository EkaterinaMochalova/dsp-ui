import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Dev-мост для Vercel-функций из api/: локально их иначе не запустить (без него /api/* уходит на proddsp).
function localApi(mode) {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url.match(/^\/api\/(brief-chat|gatekeeper-chat)(\?|$)/)
        if (!m) return next()
        // .env.local читается на каждый запрос — смена ключа не требует перезапуска.
        // Только непустые значения: process.env.X = undefined даёт строку "undefined".
        const env = loadEnv(mode, process.cwd(), '')
        for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENAI_MODEL']) {
          const v = env[k] || env['VITE_' + k]
          if (v) process.env[k] = v
        }
        const { default: handler } = await server.ssrLoadModule(`/api/${m[1]}.js`)
        res.status = (c) => { res.statusCode = c; return res }
        res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)) }
        res.send = (b) => res.end(b)
        handler(req, res)
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [svelte(), localApi(mode)],
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
}))
