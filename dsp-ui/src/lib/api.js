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
    forecast(data) {
      return request('/clients/campaigns/forecast', { method: 'POST', body: JSON.stringify(data) })
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
    states() { return request('/clients/filters/campaign-states') },
    types()  { return request('/clients/filters/campaign-types') },
  },

  inventories: {
    list(params = {}) {
      const q = new URLSearchParams({ enabled: 'true', ...params })
      return request(`/clients/inventories?${q}`)
    },
    async cities() {
      // Fetch several pages and extract unique city names + IDs from inventory data
      const PAGE = 500
      const first = await request(`/clients/inventories?enabled=true&page=0&size=${PAGE}`)
      const items = first.content ?? []
      const totalPages = first.totalPages ?? 1
      const extra = Math.min(totalPages - 1, 9) // up to 10 pages = 5000 items
      if (extra > 0) {
        const rest = await Promise.all(
          Array.from({ length: extra }, (_, i) =>
            request(`/clients/inventories?enabled=true&page=${i + 1}&size=${PAGE}`)
          )
        )
        rest.forEach(r => items.push(...(r.content ?? [])))
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
