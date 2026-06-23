// Single-turn proxy for the AI brief agent.
// Receives { messages, max_tokens? } from the frontend;
// adds the locked model, system prompt and tool schemas server-side
// so the client cannot override them.
// Tool EXECUTION still runs on the frontend (needs the user's DSP auth token).

export const config = { maxDuration: 120 }

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1500

// ── Tool schemas ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_cities',
    description:
      "Resolve free-form city names from the brief to the platform's inventory cities. " +
      'Returns each requested name with whether it matched and its canonical id/name. ' +
      'Call this FIRST to confirm the cities exist before planning.',
    input_schema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'City names to resolve.' },
      },
      required: ['names'],
    },
  },
  {
    name: 'count_inventory',
    description:
      'Count how many enabled screens are actually available per city for the campaign sellingType. ' +
      'Use this to verify feasibility and flag cities with zero (or very few) screens BEFORE finalizing. ' +
      'Pass the canonical city ids from list_cities.',
    input_schema: {
      type: 'object',
      properties: {
        cityIds: { type: 'array', items: { type: 'number' } },
        sellingType: { type: 'string', enum: ['RTB', 'OPEN_RTB', 'GUARANTEED', 'FLEX_GUARANTEED'] },
      },
      required: ['cityIds', 'sellingType'],
    },
  },
  {
    name: 'list_vendors',
    description:
      'Resolve a screen vendor/operator (оператор) name from the brief to a real inventory vendor. ' +
      'Returns the closest matching vendor names. Call this when the brief names a vendor (e.g. "на Аффикс").',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The vendor/operator name from the brief.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'sample_pricing',
    description:
      'Sample typical pricing/reach across the given cities: median min-bid (₽ per play) and median OTS. ' +
      'Use this to sanity-check whether the budget can realistically reach the target KPI/OTS.',
    input_schema: {
      type: 'object',
      properties: {
        cityIds: { type: 'array', items: { type: 'number' } },
        sellingType: { type: 'string', enum: ['RTB', 'OPEN_RTB', 'GUARANTEED', 'FLEX_GUARANTEED'] },
      },
      required: ['cityIds', 'sellingType'],
    },
  },
  {
    name: 'search_pois',
    description:
      'Search 2GIS for real-world places matching a free-form query in a given city. ' +
      'Use this when the brief asks for proximity-based placement — ' +
      '«рядом с ЖК», «у бизнес-центров», «вблизи торговых центров», «около школ» etc. ' +
      'Returns the count and a sample of found places so you can confirm they exist. ' +
      'After calling this, include the query in finalize_plan.geoPoiSearches.',
    input_schema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Place type or name to search for (Russian).' },
        city:     { type: 'string', description: 'City name (Russian) to restrict the search to.' },
        radius_m: { type: 'number', description: 'Suggested screen-selection radius in metres. Default 500.' },
      },
      required: ['query', 'city'],
    },
  },
  {
    name: 'finalize_plan',
    description:
      'Emit the final campaign plan. Call this once, after grounding the plan with the other tools. ' +
      'Put any data-driven caveats into "assumptions".',
    input_schema: {
      type: 'object',
      properties: {
        name:              { type: 'string' },
        type:              { type: 'string', enum: ['RTB', 'FLEX_GUARANTEED', 'GUARANTEED'] },
        startDate:         { type: 'string' },
        endDate:           { type: 'string' },
        customBudgetTotal: { type: 'string' },
        buyerMarkup:       { type: 'string' },
        cities:            { type: 'array', items: { type: 'string' } },
        bidType:           { type: 'string', enum: ['BID', 'OTS'] },
        limitCampaign:     { type: 'string' },
        limitDay:          { type: 'string' },
        limitHour:         { type: 'string' },
        showsPerHour:      { type: 'string' },
        screenStrategy:    { type: 'string', enum: ['EQUAL', 'CUSTOM'] },
        screenNotes:       { type: 'string' },
        productCategory:   { type: 'string' },
        preferredFormat:   { type: 'string' },
        formatPriority:    { type: 'array', items: { type: 'string' } },
        centralFocus:      { type: 'boolean' },
        evenSpread:        { type: 'boolean' },
        geoSector:         { type: 'string' },
        roadKeywords:      { type: 'array', items: { type: 'string' } },
        peripheralFocus:   { type: 'boolean' },
        trafficDirection:  { type: 'string', enum: ['IN', 'OUT', ''] },
        activeWeekdays:    { type: 'array', items: { type: 'number' } },
        playsPerHour:      { type: 'string' },
        vendor:            { type: 'string' },
        assumptions:       { type: 'array', items: { type: 'string' } },
        reasoning:         { type: 'string' },
        geoPoiSearches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              query:   { type: 'string' },
              radiusM: { type: 'number' },
            },
            required: ['query', 'radiusM'],
          },
        },
      },
      required: [
        'name', 'type', 'startDate', 'endDate', 'customBudgetTotal', 'buyerMarkup', 'cities',
        'bidType', 'limitCampaign', 'limitDay', 'limitHour', 'showsPerHour', 'screenStrategy',
        'screenNotes', 'productCategory', 'preferredFormat', 'formatPriority', 'centralFocus',
        'evenSpread', 'geoSector', 'roadKeywords', 'peripheralFocus', 'trafficDirection',
        'activeWeekdays', 'playsPerHour', 'vendor', 'assumptions', 'reasoning',
      ],
    },
  },
]

// ── System prompt ─────────────────────────────────────────────────────────────
function systemPrompt() {
  const today = new Date().toISOString().slice(0, 10)
  return `You are a media-planning AGENT for a programmatic DOOH advertising platform. Today is ${today}.
You receive a free-form campaign brief (Russian or English) and must produce a complete, FEASIBLE campaign plan.

Unlike a one-shot parser, you have TOOLS that query the real inventory. USE THEM to ground the plan:
1. Call list_cities with every city named in the brief to resolve them (recognise abbreviations: МСК→Москва, СПБ→Санкт-Петербург). If a city does not match, note it.
2. Call count_inventory with the resolved ids + sellingType to confirm each city actually has screens. If a city has 0 (or very few), say so in "assumptions" and consider dropping it.
3. When the brief gives a target KPI/OTS or a tight budget, call sample_pricing to check feasibility. If there is a clear mismatch (budget far too low to reach the stated KPI), add ONE short line to assumptions. Do NOT put bid numbers, inventory counts, or estimates into assumptions or reasoning.
4. When the brief targets placement near specific object types — ЖК, бизнес-центры, ТЦ, метро, школы, парки, etc. — call search_pois with that object type + city BEFORE finalizing. If found, add to geoPoiSearches; if not found, note it in assumptions.
Keep tool calls minimal and purposeful; then call finalize_plan EXACTLY ONCE.

sellingType for the tools = RTB unless the brief clearly asks for guaranteed/programmatic.

finalize_plan field rules:
- type: only RTB is currently supported — ALWAYS set "RTB" even if guaranteed was requested.
- startDate/endDate: ISO YYYY-MM-DD. If no period given, start tomorrow, run 14 days.
- customBudgetTotal: numeric string (bare budget, ₽). CRITICAL: if brief gives a shows/OTS goal but NO explicit money budget — leave "". NEVER multiply goal × bid.
- cities: the resolved Russian city names you intend to use (drop ones with no inventory).
- bidType: BID unless brief implies cost-per-impression (OTS).
- limitCampaign/limitDay/limitHour: IMPRESSION caps, NOT money. Leave "" unless explicit.
- playsPerHour: per-screen frequency if stated ("хотя бы 10 выходов в час"). "" if not stated.
- screenStrategy: "CUSTOM" only when the brief asks for specific placements beyond just naming cities. Otherwise "EQUAL", screenNotes "".
- productCategory: normalised toward an affinity segment ("кофейня"→"Рестораны, Кафе").
- preferredFormat: set ONLY when brief restricts to ONE format exclusively.
- vendor: if the brief names an operator, call list_vendors and put the matched name here. "" if none.
- formatPriority: set premium tokens ONLY when premium is the EXPLICIT focus. For normal mix set ["BILLBOARD"].
- centralFocus: true ONLY if brief EXPLICITLY says city centre/central districts.
- evenSpread: true if brief asks for even geographic coverage.
- geoSector: compass sector (N/NE/E/SE/S/SW/W/NW) if brief confines to part of city. "" otherwise.
- roadKeywords: HARD filter — ONLY when brief EXPLICITLY names specific roads. [] when no specific road named.
- peripheralFocus: true if brief targets outbound/peripheral placement.
- trafficDirection: "OUT"/"IN"/"" based on audience direction.
- geoPoiSearches: ONLY when you called search_pois and places were found.
- activeWeekdays: 0=Пн … 6=Вс. [] if every day.
- assumptions: ONLY user-relevant assumptions about missing inputs. NEVER API errors, inventory counts, bid numbers.
- reasoning: 1-2 Russian sentences explaining the plan. NO numbers from tool calls.`
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })

  // Read body
  const body = await new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
      catch (e) { reject(e) }
    })
    req.on('error', reject)
  }).catch(() => null)

  if (!body?.messages?.length) return res.status(400).json({ error: 'messages required' })

  // Build the locked Anthropic request
  const upstream = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: body.max_tokens ?? MAX_TOKENS,
      system: systemPrompt(),
      tools: TOOLS,
      messages: body.messages,
    }),
  })

  const data = await upstream.json()
  res.status(upstream.status).json(data)
}
