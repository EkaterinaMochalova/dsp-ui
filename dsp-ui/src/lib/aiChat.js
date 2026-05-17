const MODEL = 'claude-sonnet-4-6'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `Ты — ИИ-ассистент для DSP-платформы (DOOH — наружная реклама).
Помогаешь анализировать рекламные кампании, бюджеты и статистику.
Всегда отвечай на русском языке. Форматируй суммы: "1 234 567 ₽".
Будь конкретен и краток. Если статистика доступна только за всё время кампании (не за конкретный период) — честно об этом скажи.
При расчёте трат за период фильтруй кампании, которые пересекаются с нужным периодом.`

const TOOLS = [
  {
    name: 'get_all_brands',
    description: 'Получить список всех рекламодателей и их брендов. Используй для поиска ID бренда по его названию.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'list_campaigns',
    description: 'Получить список кампаний с фильтрацией. Каждая кампания содержит: id, name, brandId, customerId, state, startDate, endDate, budgetPlanned (плановый бюджет в рублях).',
    input_schema: {
      type: 'object',
      properties: {
        brandId: { type: 'string', description: 'ID бренда' },
        customerId: { type: 'string', description: 'ID рекламодателя' },
        states: {
          type: 'array',
          items: { type: 'string', enum: ['NEW', 'ON_MODERATION', 'ACTIVE', 'STOPPED', 'COMPLETED', 'CANCELLED'] },
          description: 'Фильтр по статусу'
        }
      },
      required: []
    }
  },
  {
    name: 'get_campaign_stats',
    description: 'Получить фактическую статистику по кампаниям: показы и расходы. Данные суммарные за всё время кампании.',
    input_schema: {
      type: 'object',
      properties: {
        campaignIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'ID кампаний (не более 20 за раз)'
        }
      },
      required: ['campaignIds']
    }
  }
]

const BASE = '/api/v1.0'

function authHeaders(apiToken) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiToken}`
  }
}

async function getAllBrands(apiToken) {
  const res = await fetch(`${BASE}/clients/customers?page=0&size=500`, { headers: authHeaders(apiToken) })
  const data = await res.json()
  const customers = data.content ?? (Array.isArray(data) ? data : [])

  const nested = await Promise.all(
    customers.map(async (customer) => {
      try {
        const bRes = await fetch(`${BASE}/clients/customers/${customer.id}/brands`, { headers: authHeaders(apiToken) })
        const brands = await bRes.json()
        const list = Array.isArray(brands) ? brands : (brands.content ?? [])
        return list.map(brand => ({
          customerId: String(customer.id),
          customerName: customer.name,
          brandId: String(brand.id),
          brandName: brand.name
        }))
      } catch {
        return []
      }
    })
  )

  return nested.flat()
}

async function listCampaigns(input, apiToken) {
  const params = new URLSearchParams({ page: 0, size: 200 })
  if (input.brandId) params.set('brandId', input.brandId)
  if (input.customerId) params.set('customerId', input.customerId)
  if (input.states?.length) params.set('states', input.states.join(','))

  const res = await fetch(`${BASE}/clients/campaigns?${params}`, { headers: authHeaders(apiToken) })
  const data = await res.json()
  const campaigns = data.content ?? (Array.isArray(data) ? data : [])

  return campaigns.map(c => ({
    id: String(c.id),
    name: c.name,
    brandId: c.brandId != null ? String(c.brandId) : null,
    customerId: c.customerId != null ? String(c.customerId) : null,
    state: c.state,
    startDate: c.startDate,
    endDate: c.endDate,
    budgetPlanned: c.customBudgetTotal ?? c.limitCampaign ?? null
  }))
}

async function getCampaignStats(campaignIds, apiToken) {
  const BATCH = 20
  const allStats = []

  for (let i = 0; i < campaignIds.length; i += BATCH) {
    const batch = campaignIds.slice(i, i + BATCH)
    const res = await fetch(
      `${BASE}/clients/impressions/campaigns-stats?campaignIds=${batch.join(',')}&priceMode=CUSTOMER_CHARGE_EXCLUDED`,
      { headers: authHeaders(apiToken) }
    )
    const data = await res.json()
    const items = Array.isArray(data) ? data : (data.content ?? [])
    // Items without inventory field are campaign-level aggregates
    allStats.push(...items.filter(item => !item.inventory))
  }

  return allStats
}

async function executeTool(name, input, apiToken) {
  switch (name) {
    case 'get_all_brands': return getAllBrands(apiToken)
    case 'list_campaigns': return listCampaigns(input, apiToken)
    case 'get_campaign_stats': return getCampaignStats(input.campaignIds, apiToken)
    default: throw new Error(`Неизвестный инструмент: ${name}`)
  }
}

const TOOL_STATUS = {
  get_all_brands: 'Загружаю бренды...',
  list_campaigns: 'Ищу кампании...',
  get_campaign_stats: 'Получаю статистику...'
}

/**
 * Send a message to Claude with tool use support.
 * @param {Array} history - Full Claude API message history (includes prior tool use/result blocks)
 * @param {{ anthropicKey: string, apiToken: string, onStatus?: (s: string) => void }} options
 * @returns {{ answer: string, history: Array }} Updated history including tool calls
 */
export async function chat(history, { anthropicKey, apiToken, onStatus }) {
  const MAX_TURNS = 6
  let messages = [...history]

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages
      })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message ?? `Ошибка API: ${res.status}`)
    }

    const response = await res.json()
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      const text = response.content.find(b => b.type === 'text')?.text ?? ''
      return { answer: text, history: [...messages, { role: 'assistant', content: response.content }] }
    }

    messages = [...messages, { role: 'assistant', content: response.content }]

    const toolResults = []
    for (const block of toolUseBlocks) {
      onStatus?.(TOOL_STATUS[block.name] ?? 'Загружаю данные...')
      try {
        const result = await executeTool(block.name, block.input, apiToken)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      } catch (err) {
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: err.message })
      }
    }

    messages = [...messages, { role: 'user', content: toolResults }]
  }

  throw new Error('Превышен лимит итераций')
}
