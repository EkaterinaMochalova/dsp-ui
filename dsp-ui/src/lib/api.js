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
    return request('/login', { method: 'POST', body: JSON.stringify({ email, password }) })
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
      // Fetch several pages and extract unique city names + IDs from inventory data
      const PAGE = 500
      const first = await request(`/clients/inventories?enabled=true&page=0&size=${PAGE}`)
      const items = first.content ?? []
      const totalPages = first.totalPages ?? 1
      const extra = Math.min(totalPages - 1, 9) // up to 10 pages = 5000 items
      if (extra > 0) {
        const rest = await Promise.allSettled(
          Array.from({ length: extra }, (_, i) =>
            request(`/clients/inventories?enabled=true&page=${i + 1}&size=${PAGE}`)
          )
        )
        rest.forEach(r => {
          if (r.status === 'fulfilled') items.push(...(r.value?.content ?? []))
        })
      }
      const seen = new Map()
      for (const inv of items) {
        // prefer inv.city.name (direct object), fallback to inventoryTypeAndCity.cityName
        const cityName = inv.city?.name || inv.inventoryTypeAndCity?.cityName
        const cityId   = inv.city?.id   || inv.inventoryTypeAndCity?.cityId
        if (!cityName) continue
        if (!seen.has(cityName)) seen.set(cityName, cityId ?? null)
      }
      return [...seen.entries()]
        .map(([name, id]) => ({ name, id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    },
  },
}
