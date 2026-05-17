import { mapInventory, SCREENS_CACHE_VER } from './utils.js'

const BASE = '/api/v1.0'

function getToken() {
  return localStorage.getItem('dsp_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

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
  },

  customers: {
    list(params = {}) {
      const q = new URLSearchParams(params)
      return request(`/clients/customers?${q}`)
    },
    brands(customerId) {
      return request(`/clients/customers/${customerId}/brands`)
    },
  },

  agencies: {
    list() {
      return request('/clients/agencies')
    },
  },

  filters: {
    states()           { return request('/clients/filters/campaign-states') },
    types()            { return request('/clients/filters/campaign-types') },
    interests()        { return request('/clients/filters/interests') },
    genders()          { return request('/clients/filters/genders') },
    incomeCategories() { return request('/clients/filters/income-categories') },
    ageGroups()        { return request('/clients/filters/age-groups') },
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
    campaignStats(campaignIds, priceMode = 'CUSTOMER_CHARGE_EXCLUDED') {
      const ids = Array.isArray(campaignIds) ? campaignIds.join(',') : String(campaignIds)
      return request(`/clients/impressions/campaigns-stats?campaignIds=${ids}&priceMode=${priceMode}`)
    },
    // Single campaign stats — same endpoint with one ID
    singleCampaignStats(campaignId, priceMode = 'CUSTOMER_CHARGE_EXCLUDED') {
      return request(`/clients/impressions/campaigns-stats?campaignIds=${campaignId}&priceMode=${priceMode}`)
    },
  },

  inventories: {
    list(params = {}) {
      const q = new URLSearchParams({ enabled: 'true', ...params })
      return request(`/clients/inventories?${q}`)
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

      // 1. In-memory (instant)
      if (window._dspScreensCache['__all__']) {
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
        const BATCH = 10
        const first = await request(`/clients/inventories?enabled=true&page=0&size=${PAGE}`)
        const totalPages = first.totalPages ?? 1
        const allItems = [...(first.content ?? [])]

        for (let start = 1; start < totalPages; start += BATCH) {
          const end = Math.min(start + BATCH, totalPages)
          const batch = await Promise.allSettled(
            Array.from({ length: end - start }, (_, i) =>
              request(`/clients/inventories?enabled=true&page=${start + i}&size=${PAGE}`)
            )
          )
          batch.forEach(r => {
            if (r.status === 'fulfilled') allItems.push(...(r.value?.content ?? []))
          })
        }

        const mapped = allItems
          .map(mapInventory)
          .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))

        window._dspScreensCache['__all__'] = mapped
        delete window._dspScreensCache['__inflight__']
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now(), ver: SCREENS_CACHE_VER, data: mapped }))
        } catch {}

        return mapped
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
    // Derives city list from allMapped() — no separate API calls.
    // allMapped() is already being fetched; this just piggybacks on it.
    async cities() {
      if (window._dspCitiesCache) return window._dspCitiesCache

      const all = await this.allMapped()
      const seen = new Map()
      for (const s of all) {
        if (s.city && !seen.has(s.city)) seen.set(s.city, s.cityId ?? null)
      }
      const result = [...seen.entries()]
        .map(([name, id]) => ({ name, id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

      window._dspCitiesCache = result
      return result
    },
  },
}
