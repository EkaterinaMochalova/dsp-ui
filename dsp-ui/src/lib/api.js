import { mapInventory, SCREENS_CACHE_VER } from './utils.js'

const BASE = '/api/v1.0'

function getToken() {
  return localStorage.getItem('dsp_token')
}

async function request(path, options = {}) {
  const token = getToken()
  // Abort after 45 s so a hung server never freezes the UI indefinitely.
  // The caller's finally-block always sets saving/loading back to false once the
  // AbortError propagates, so the button un-freezes and an error message is shown.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45_000)
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    })
  } catch (err) {
    // Rethrow AbortError as a friendly timeout object so callers can show a message
    if (err?.name === 'AbortError') throw { status: 408, message: 'Превышено время ожидания сервера (45 с). Попробуйте ещё раз.' }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.status === 401) {
    localStorage.removeItem('dsp_token')
    window.location.hash = '#/login'
    throw { status: 401, message: 'Unauthorized' }
  }

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Server returned non-JSON (e.g. plain-text Spring error)
    if (!res.ok) throw { status: res.status, data: text }
    return null
  }

  if (!res.ok) throw { status: res.status, data }
  return data
}

export const api = {
  login(email, password) {
    // Login endpoint is at /api/login (no version prefix)
    return fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(async res => {
      const text = await res.text()
      let data = null
      try { data = text ? JSON.parse(text) : null } catch { data = text }
      if (!res.ok) throw { status: res.status, data }
      return data
    })
  },

  me() {
    return request('/users/current')
  },

  campaigns: {
    list(params = {}) {
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') q.set(k, v)
      }
      const qs = q.toString()
      return request(`/clients/campaigns${qs ? `?${qs}` : ''}`)
    },
    get(id) {
      return request(`/clients/campaigns/${id}`)
    },
    create(data) {
      return request('/clients/campaigns', { method: 'POST', body: JSON.stringify(data) })
    },
    update(id, data) {
      return request(`/clients/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    },
    setState(id, state, comment = '') {
      return request(`/clients/campaigns/${id}/state/${state}`, { method: 'POST', body: JSON.stringify({ comment }) })
    },
    // Attach approved creatives to a campaign after save
    uploadMedia(id, requestMediaIds) {
      return request(`/clients/campaigns/${id}/upload-media`, {
        method: 'POST',
        body: JSON.stringify({ requestMediaIds }),
      })
    },
    forecast(data) {
      return request('/clients/campaigns/forecast', { method: 'POST', body: JSON.stringify(data) })
    },
    forecastCampaign(data) {
      return request('/clients/analytics/campaign-forecast', { method: 'POST', body: JSON.stringify(data) })
    },
    possibleDmpSegments(data) {
      return request('/clients/campaigns/possible-dmp-segments', { method: 'POST', body: JSON.stringify(data) })
    },
    preCampaignData(data) {
      return request('/clients/campaigns/pre-campaign-data', { method: 'POST', body: JSON.stringify(data) })
    },
    preCampaignResult(data) {
      return request('/clients/campaigns/pre-campaign-result', { method: 'POST', body: JSON.stringify(data) })
    },
  },

  customers: {
    list(params = {}) {
      const q = new URLSearchParams(params)
      return request(`/clients/customers?${q}`)
    },
    get(id)          { return request(`/clients/customers/${id}`) },
    brands(customerId) {
      return request(`/clients/customers/${customerId}/brands`)
    },
    create(data)     { return request('/clients/customers',     { method: 'POST',   body: JSON.stringify(data) }) },
    update(id, data) { return request(`/clients/customers/${id}`, { method: 'PUT',  body: JSON.stringify(data) }) },
    delete(id)       { return request(`/clients/customers/${id}`, { method: 'DELETE' }) },
  },

  agencies: {
    list(params = {}) {
      const entries = Object.entries(params).filter(([, v]) => v != null && v !== '')
      if (!entries.length) return request('/clients/agencies')
      const q = new URLSearchParams(params)
      return request(`/clients/agencies?${q}`)
    },
    create(data)        { return request('/clients/agencies', { method: 'POST', body: JSON.stringify(data) }) },
    update(id, data)    { return request(`/clients/agencies/${id}`, { method: 'PUT',  body: JSON.stringify(data) }) },
    delete(id)          { return request(`/clients/agencies/${id}`, { method: 'DELETE' }) },
  },

  brands: {
    list(params = {}) {
      const q = new URLSearchParams({ page: 0, size: -1, ...params })
      return request(`/clients/brands?${q}`)
    },
    create(data)     { return request('/clients/brands', { method: 'POST', body: JSON.stringify(data) }) },
    update(id, data) { return request(`/clients/brands/${id}`, { method: 'PUT',  body: JSON.stringify(data) }) },
    delete(id)       { return request(`/clients/brands/${id}`, { method: 'DELETE' }) },
  },

  users: {
    list(params = {}) {
      const q = new URLSearchParams({ page: 0, size: -1, ...params })
      return request(`/clients/users?${q}`)
    },
    create(data)     { return request('/clients/users', { method: 'POST', body: JSON.stringify(data) }) },
    update(id, data) { return request(`/clients/users/${id}`, { method: 'PUT',  body: JSON.stringify(data) }) },
    toggle(id)       { return request(`/clients/users/${id}/toggle`, { method: 'POST' }) },
    delete(id)       { return request(`/clients/users/${id}`, { method: 'DELETE' }) },
  },

  ssp: {
    list(params = {}) {
      const q = new URLSearchParams({ page: 0, size: -1, ...params })
      return request(`/clients/ssp-systems?${q}`)
    },
    create(data)     { return request('/clients/ssp-systems', { method: 'POST', body: JSON.stringify(data) }) },
    update(id, data) { return request(`/clients/ssp-systems/${id}`, { method: 'PUT',  body: JSON.stringify(data) }) },
    delete(id)       { return request(`/clients/ssp-systems/${id}`, { method: 'DELETE' }) },
  },

  filters: {
    states()           { return request('/clients/filters/campaign-states') },
    types()            { return request('/clients/filters/campaign-types') },
    interests()        { return request('/clients/filters/interests') },
    genders()          { return request('/clients/filters/genders') },
    incomeCategories() { return request('/clients/filters/income-categories') },
    ageGroups()        { return request('/clients/filters/age-groups') },
    externalConditions() { return request('/clients/filters/external-condition-params') },
  },

  creatives: {
    // GET /clients/request-medias — full library of uploaded creatives (AdCreativeModelItemDTO)
    list(params = {}) {
      const q = new URLSearchParams({ page: 0, size: 100, ...params })
      return request(`/clients/request-medias?${q}`)
    },
    // GET /clients/campaigns/{id}/creative-names — lightweight [{id, name}] attached to a campaign
    listForCampaign(campaignId) {
      return request(`/clients/campaigns/${campaignId}/creative-names`)
    },
    // GET /clients/request-medias/{id} — full creative detail (has mediaFiles, segments, etc.)
    detail(creativeId) {
      return request(`/clients/request-medias/${creativeId}`)
    },
    // GET /clients/request-medias/{id}/segments — per-displayOwner approval status
    segments(creativeId) {
      return request(`/clients/request-medias/${creativeId}/segments?page=0&size=100`)
    },
    // GET /clients/request-media-segments — creatives approved by a specific vendor (displayOwner)
    // Used by the production app to load per-vendor creative lists in the campaign creatives step.
    // Returns only creatives that are APPROVED for the given displayOwnerIds.
    listForVendor(displayOwnerIds, sellingType = 'RTB') {
      const q = new URLSearchParams({ displayOwnerIds, sellingType, mediasForAllOwners: false, page: 0, size: 200 })
      return request(`/clients/request-media-segments?${q}`)
    },
    // POST /clients/request-medias — create a new creative record (then attach media files separately)
    create(data) {
      return request('/clients/request-medias', { method: 'POST', body: JSON.stringify(data) })
    },
    // POST /clients/medias/upload — upload the actual media file
    uploadFile(file) {
      const fd = new FormData()
      fd.append('file', file)
      const token = getToken()
      return fetch(`${BASE}/clients/medias/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      }).then(async res => {
        if (res.status === 401) { localStorage.removeItem('dsp_token'); window.location.hash = '#/login'; throw { status: 401 } }
        const data = await res.json()
        if (!res.ok) throw { status: res.status, data }
        return data
      })
    },
  },

  impressions: {
    // GET /clients/impressions/campaigns-stats?campaignIds=id1,id2,...&priceMode=...
    // Returns array of per-inventory stats; items with no inventory field are campaign-level aggregates.
    // Optional: startDate / endDate as Unix ms timestamps to scope to a date range (e.g. today).
    campaignStats(campaignIds, priceMode = 'CUSTOMER_CHARGE_EXCLUDED', dateRange = {}) {
      const ids = Array.isArray(campaignIds) ? campaignIds.join(',') : String(campaignIds)
      const q = new URLSearchParams({ campaignIds: ids, priceMode })
      if (dateRange.startDate != null) q.set('startDate', dateRange.startDate)
      if (dateRange.endDate   != null) q.set('endDate',   dateRange.endDate)
      return request(`/clients/impressions/campaigns-stats?${q}`)
    },
    // Single campaign stats — same endpoint with one ID
    singleCampaignStats(campaignId, priceMode = 'CUSTOMER_CHARGE_EXCLUDED', dateRange = {}) {
      const q = new URLSearchParams({ campaignIds: String(campaignId), priceMode })
      if (dateRange.startDate != null) q.set('startDate', dateRange.startDate)
      if (dateRange.endDate   != null) q.set('endDate',   dateRange.endDate)
      return request(`/clients/impressions/campaigns-stats?${q}`)
    },
  },

  stats: {
    // GET /clients/campaigns/{id}/impression-chart-stats/{metric}
    // metric: 'impressions' | 'ots' | 'cost' | 'cpm'
    // Required params: chartType=impressions, start/end (ms timestamps), chartGroupType=BY_HOURS|BY_DAYS
    // avgStats=true required for ots and cost endpoints
    // Returns: object keyed by datetime string → { date, value, ... }
    chart(id, metric = 'impressions', params = {}) {
      const base = {
        chartType: 'impressions',
        campaignIds: '',
        cities: '',
        displayOwners: '',
        formats: '',
        creatives: '',
      }
      const q = new URLSearchParams()
      // base defaults first, then caller overrides
      for (const [k, v] of Object.entries({ ...base, ...params })) {
        q.set(k, v != null ? String(v) : '')
      }
      return request(`/clients/campaigns/${id}/impression-chart-stats/${metric}?${q}`)
    },
    // GET /clients/campaigns/{id}/impressions  (paginated impression log)
    list(id, params = {}) {
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') q.set(k, String(v))
      }
      return request(`/clients/campaigns/${id}/impressions?${q}`)
    },
    // GET /clients/campaigns/{id}/impression-inventory-stats
    // Returns array of per-inventory stats with location for map view
    inventoryStats(id, params = {}) {
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') q.set(k, String(v))
      }
      const qs = q.toString()
      return request(`/clients/campaigns/${id}/impression-inventory-stats${qs ? '?' + qs : ''}`)
    },
  },

  inventories: {
    list(params = {}) {
      const q = new URLSearchParams({ enabled: 'true', ...params })
      return request(`/clients/inventories?${q}`)
    },
    // Accepts a pre-built query string (supports repeated params like cityIds=1&cityIds=2)
    listRaw(qs) {
      return request(`/clients/inventories?${qs}`)
    },
    // Fetch ALL inventories, map them, and cache in window + sessionStorage.
    // Single source of truth for CampaignCreate (prefetch) and StepScreens (load).
    // In-flight deduplication: if a fetch is already running, callers share the
    // same Promise instead of firing duplicate requests.
    allMapped() {
      const SESSION_KEY = 'dsp_screens_all_cache'
      const TTL = 30 * 60 * 1000

      // Ensure in-memory cache object exists with the right version
      if (!window._dspScreensCache || window._dspScreensCache._ver !== SCREENS_CACHE_VER) {
        window._dspScreensCache = { _ver: SCREENS_CACHE_VER }
      }

      // 1. In-memory (instant) — guard length > 0: empty [] is truthy but stale
      if (window._dspScreensCache['__all__']?.length > 0) {
        return Promise.resolve(window._dspScreensCache['__all__'])
      }

      // 2. sessionStorage (survives F5, 30-min TTL)
      try {
        const raw = sessionStorage.getItem(SESSION_KEY)
        if (raw) {
          const { ts, ver, data } = JSON.parse(raw)
          if (ver === SCREENS_CACHE_VER && Date.now() - ts < TTL) {
            window._dspScreensCache['__all__'] = data
            return Promise.resolve(data)
          }
        }
      } catch {}

      // 3. De-duplicate in-flight fetch — return the same Promise to all callers
      if (window._dspScreensCache['__inflight__']) {
        return window._dspScreensCache['__inflight__']
      }

      const fetchPromise = (async () => {
        const PAGE = 500
        try {
          const first = await request(`/clients/inventories?enabled=true&page=0&size=${PAGE}`)
          const totalPages = first.totalPages ?? 1
          const allItems = [...(first.content ?? [])]

          // Fully sequential — one page at a time — to avoid overloading the backend
          for (let page = 1; page < totalPages; page++) {
            try {
              const r = await request(`/clients/inventories?enabled=true&page=${page}&size=${PAGE}`)
              allItems.push(...(r?.content ?? []))
            } catch { /* skip failed pages, keep going */ }
          }

          const mapped = allItems
            .map(mapInventory)
            .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))

          window._dspScreensCache['__all__'] = mapped
          try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now(), ver: SCREENS_CACHE_VER, data: mapped }))
          } catch {}
          return mapped
        } finally {
          // Always clean up __inflight__ so retries can start a fresh fetch
          delete window._dspScreensCache['__inflight__']
        }
      })()

      window._dspScreensCache['__inflight__'] = fetchPromise
      return fetchPromise
    },

    parsePoi(file) {
      const fd = new FormData()
      fd.append('file', file)
      const token = getToken()
      return fetch(`${BASE}/clients/inventories/parse-poi`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      }).then(async res => {
        if (res.status === 401) {
          localStorage.removeItem('dsp_token')
          window.location.hash = '#/login'
          throw { status: 401 }
        }
        const data = await res.json()
        if (!res.ok) throw { status: res.status, data }
        return data
      })
    },
    async cities() {
      if (window._dspCitiesCache) return window._dspCitiesCache

      // Derive from screens cache if already populated (zero extra requests)
      const derive = (mapped) => {
        const seen = new Map()
        for (const s of mapped) {
          if (s.city && !seen.has(s.city)) seen.set(s.city, s.cityId ?? null)
        }
        const result = [...seen.entries()]
          .map(([name, id]) => ({ name, id }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        window._dspCitiesCache = result
        return result
      }

      if (window._dspScreensCache?.['__all__']) {
        return derive(window._dspScreensCache['__all__'])
      }

      // allMapped() already running — piggyback on it; if it fails fall through
      if (window._dspScreensCache?.['__inflight__']) {
        try {
          return derive(await window._dspScreensCache['__inflight__'])
        } catch {}
      }

      // Fallback: fetch all pages (batch of 3) to ensure no cities are missed
      const PAGE = 500
      const first = await request(`/clients/inventories?enabled=true&page=0&size=${PAGE}`)
      const allItems = [...(first.content ?? [])]
      const totalPages = first.totalPages ?? 1
      for (let page = 1; page < totalPages; page++) {
        try {
          const r = await request(`/clients/inventories?enabled=true&page=${page}&size=${PAGE}`)
          allItems.push(...(r?.content ?? []))
        } catch {}
      }
      return derive(allItems.map(mapInventory))
    },
  },
}
