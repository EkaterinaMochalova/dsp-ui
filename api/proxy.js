// Vercel serverless proxy — forwards /api/* to the backend
// with spoofed Origin/Referer so the backend's CORS/CSRF checks pass,
// identical to the Vite dev-server proxy in vite.config.js.

const BACKEND = 'https://proddsp.omniboard360.io'

export default async function handler(req, res) {
  // req.url is the full path including query string, e.g. /api/v1.0/clients/inventories?...
  const target = `${BACKEND}${req.url}`

  // Forward all incoming headers except host, then spoof origin/referer
  const headers = { ...req.headers }
  delete headers['host']
  headers['origin']           = BACKEND
  headers['referer']          = `${BACKEND}/`
  headers['x-requested-with'] = 'XMLHttpRequest'

  let body = undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve) => {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  try {
    const upstream = await fetch(target, {
      method:  req.method,
      headers,
      body,
    })

    // Forward status + headers (skip hop-by-hop)
    const skip = new Set(['transfer-encoding', 'connection', 'keep-alive'])
    upstream.headers.forEach((val, key) => {
      if (!skip.has(key.toLowerCase())) res.setHeader(key, val)
    })
    res.status(upstream.status)

    const buf = await upstream.arrayBuffer()
    res.send(Buffer.from(buf))
  } catch (err) {
    console.error('[proxy]', err)
    res.status(502).json({ error: 'Proxy error', detail: String(err) })
  }
}
