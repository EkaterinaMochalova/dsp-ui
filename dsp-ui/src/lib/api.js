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
  const data = text ? JSON.parse(text) : null

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
  },
}
