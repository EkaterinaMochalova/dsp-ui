// Serverless proxy for Yandex GeoAnalytics tile API.
// Forwards tile requests server-side to bypass CORS restrictions.

const GEO_BASE = 'https://yandex.ru/geoanalytics/platform/api/geoanalytics/layer/tile';

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Forward all query params as-is
  const qs = new URLSearchParams(req.query).toString();
  const url = `${GEO_BASE}?${qs}`;

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept':          'application/json, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        'Referer':         'https://yandex.ru/geoanalytics/platform',
        'Origin':          'https://yandex.ru',
      },
    });

    const text = await upstream.text();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(upstream.status).send(text);
  } catch (err) {
    console.error('[geo-proxy]', err);
    return res.status(502).json({ error: 'Upstream error', detail: String(err) });
  }
}
