const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const OPENAI_MODEL = 'gpt-4o'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'

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

// OpenAI tool format (wraps the same definitions)
const OPENAI_TOOLS = TOOLS.map(t => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema }
}))

const BASE = '/api/v1.0'

function authHeaders(apiToken) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` }
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function getAllBrands(apiToken) {
  const res = await fetch(`${BASE}/clients/customers?page=0&size=500`, { headers: authHeaders(apiToken) })
  const data = await res.json()
  const customers = data.content ?? (Array.isArray(data) ? data : [])

  // Sequential — not Promise.all — to avoid hammering the server
  const result = []
  for (const customer of customers) {
    try {
      const bRes = await fetch(`${BASE}/clients/customers/${customer.id}/brands`, { headers: authHeaders(apiToken) })
      const brands = await bRes.json()
      const list = Array.isArray(brands) ? brands : (brands.content ?? [])
      for (const brand of list) {
        result.push({ customerId: String(customer.id), customerName: customer.name, brandId: String(brand.id), brandName: brand.name })
      }
    } catch {}
  }
  return result
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
    allStats.push(...items.filter(item => !item.inventory))
  }
  return allStats
}

const TOOL_STATUS = {
  get_all_brands: 'Загружаю бренды...',
  list_campaigns: 'Ищу кампании...',
  get_campaign_stats: 'Получаю статистику...'
}

async function executeTool(name, input, apiToken) {
  switch (name) {
    case 'get_all_brands': return getAllBrands(apiToken)
    case 'list_campaigns': return listCampaigns(input, apiToken)
    case 'get_campaign_stats': return getCampaignStats(input.campaignIds, apiToken)
    default: throw new Error(`Неизвестный инструмент: ${name}`)
  }
}

// ── Anthropic provider ────────────────────────────────────────────────────────

async function chatWithAnthropic(history, { anthropicKey, apiToken, onStatus }) {
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
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1024, system: SYSTEM_PROMPT, tools: TOOLS, messages })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = err.error?.message ?? `Ошибка API: ${res.status}`
      throw Object.assign(new Error(msg), { status: res.status, errorType: err.error?.type })
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

// ── OpenAI provider ───────────────────────────────────────────────────────────

// Convert Anthropic-format history to OpenAI messages array
function toOpenAIMessages(anthropicMessages) {
  const result = [{ role: 'system', content: SYSTEM_PROMPT }]

  for (const msg of anthropicMessages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content })
      } else {
        // Tool results
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            result.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content ?? '' })
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'assistant', content: msg.content })
      } else {
        const textBlock = msg.content.find(b => b.type === 'text')
        const toolUse = msg.content.filter(b => b.type === 'tool_use')
        const openAIMsg = { role: 'assistant', content: textBlock?.text ?? null }
        if (toolUse.length) {
          openAIMsg.tool_calls = toolUse.map(b => ({
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input) }
          }))
        }
        result.push(openAIMsg)
      }
    }
  }
  return result
}

async function chatWithOpenAI(history, { openaiKey, apiToken, onStatus }) {
  const MAX_TURNS = 6
  let openaiMessages = toOpenAIMessages(history)
  let anthropicHistory = [...history]

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: OPENAI_MODEL, messages: openaiMessages, tools: OPENAI_TOOLS, max_tokens: 1024 })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message ?? `OpenAI API error: ${res.status}`)
    }

    const response = await res.json()
    const choice = response.choices[0]
    const msg = choice.message

    if (choice.finish_reason === 'stop' || !msg.tool_calls?.length) {
      const answer = msg.content ?? ''
      anthropicHistory = [...anthropicHistory, { role: 'assistant', content: [{ type: 'text', text: answer }] }]
      return { answer, history: anthropicHistory }
    }

    // Add assistant message and track in both formats
    openaiMessages = [...openaiMessages, msg]
    const anthropicContent = []
    if (msg.content) anthropicContent.push({ type: 'text', text: msg.content })
    for (const tc of msg.tool_calls) {
      anthropicContent.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) })
    }
    anthropicHistory = [...anthropicHistory, { role: 'assistant', content: anthropicContent }]

    // Execute tools
    const openaiResults = []
    const anthropicResults = []

    for (const tc of msg.tool_calls) {
      onStatus?.(TOOL_STATUS[tc.function.name] ?? 'Загружаю данные...')
      try {
        const input = JSON.parse(tc.function.arguments)
        const result = await executeTool(tc.function.name, input, apiToken)
        const content = JSON.stringify(result)
        openaiResults.push({ role: 'tool', tool_call_id: tc.id, content })
        anthropicResults.push({ type: 'tool_result', tool_use_id: tc.id, content })
      } catch (err) {
        openaiResults.push({ role: 'tool', tool_call_id: tc.id, content: err.message })
        anthropicResults.push({ type: 'tool_result', tool_use_id: tc.id, is_error: true, content: err.message })
      }
    }

    openaiMessages = [...openaiMessages, ...openaiResults]
    anthropicHistory = [...anthropicHistory, { role: 'user', content: anthropicResults }]
  }

  throw new Error('Превышен лимит итераций')
}

// ── Public API ────────────────────────────────────────────────────────────────

function isCreditsError(err) {
  return (
    err.status === 402 ||
    err.status === 529 ||
    /credit|billing|balance|quota/i.test(err.message ?? '') ||
    /credit|billing|balance/i.test(err.errorType ?? '')
  )
}

/**
 * Send a message. Tries Anthropic first; falls back to OpenAI on credit/billing errors.
 * @param {Array} history - Claude API-format conversation history
 * @param {{ anthropicKey: string, openaiKey?: string, apiToken: string, onStatus?: Function }} options
 * @returns {{ answer: string, history: Array }}
 */
export async function chat(history, { anthropicKey, openaiKey, apiToken, onStatus }) {
  try {
    return await chatWithAnthropic(history, { anthropicKey, apiToken, onStatus })
  } catch (err) {
    if (openaiKey && isCreditsError(err)) {
      onStatus?.('Переключаюсь на резервный провайдер...')
      return await chatWithOpenAI(history, { openaiKey, apiToken, onStatus })
    }
    throw err
  }
}
