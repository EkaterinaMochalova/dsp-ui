<script>
  import { createEventDispatcher } from 'svelte'
  import { api } from '../../lib/api.js'

  const dispatch = createEventDispatcher()

  let briefText = ''
  let messages = []       // Anthropic messages array (full history for the API)
  let display = []        // UI display items: {type:'user'|'ai'|'tool'|'plan', ...}
  let loading = false
  let currentTool = ''    // name of tool being executed right now
  let plan = null         // finalize_plan result
  let error = ''

  // ── Tool executors ────────────────────────────────────────────────────────

  async function execListCities({ names }) {
    const cities = await api.inventories.cities()
    return names.map(name => {
      const q = name.toLowerCase().trim()
      const exact   = cities.find(c => c.name.toLowerCase() === q)
      const partial = cities.find(c => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().slice(0, 4)))
      const match = exact || partial
      return { requested: name, matched: !!match, id: match?.id ?? null, name: match?.name ?? null }
    })
  }

  async function execCountInventory({ cityIds, sellingType }) {
    const results = {}
    for (const cityId of cityIds) {
      try {
        const r = await api.inventories.list({ cityId, sellingType: sellingType ?? 'RTB', page: 0, size: 1 })
        results[cityId] = r?.totalElements ?? 0
      } catch { results[cityId] = 0 }
    }
    return results
  }

  async function execSamplePricing({ cityIds, sellingType }) {
    const bids = [], otsList = []
    for (const cityId of cityIds) {
      try {
        const r = await api.inventories.list({ cityId, sellingType: sellingType ?? 'RTB', page: 0, size: 100 })
        for (const inv of r?.content ?? []) {
          const b = inv.minBidInfo?.minBidCharged ?? inv.minBidInfo?.minBid
          const o = inv.minBidInfo?.ots ?? inv.metadata?.ots
          if (b != null) bids.push(b)
          if (o != null) otsList.push(o)
        }
      } catch {}
    }
    bids.sort((a, b) => a - b)
    otsList.sort((a, b) => a - b)
    const med = arr => arr.length ? arr[Math.floor(arr.length / 2)] : null
    return { medianMinBid: med(bids), medianOts: med(otsList), sampleSize: bids.length }
  }

  async function execListVendors({ name }) {
    try {
      const all = await api.inventories.allMapped()
      const vendors = [...new Set(all.map(s => s.owner).filter(Boolean))]
      const q = name.toLowerCase()
      const matches = vendors.filter(v => {
        const vl = v.toLowerCase()
        return vl.includes(q) || q.includes(vl.slice(0, Math.min(vl.length, 5)))
      })
      return matches.slice(0, 5)
    } catch { return [] }
  }

  async function execSearchPois({ query, city, radius_m }) {
    try {
      const qs = new URLSearchParams({ q: query, city, radius_m: radius_m ?? 500 })
      const r = await fetch(`/api/2gis/search?${qs}`)
      if (r.ok) return await r.json()
    } catch {}
    return { count: 0, sample: [], note: 'Поиск POI временно недоступен' }
  }

  async function executeTool(name, input) {
    if (name === 'list_cities')    return execListCities(input)
    if (name === 'count_inventory') return execCountInventory(input)
    if (name === 'sample_pricing') return execSamplePricing(input)
    if (name === 'list_vendors')   return execListVendors(input)
    if (name === 'search_pois')    return execSearchPois(input)
    if (name === 'finalize_plan')  { plan = input; return { ok: true } }
    return { error: 'Unknown tool' }
  }

  // ── Agentic loop ──────────────────────────────────────────────────────────

  async function runLoop() {
    while (true) {
      const token = localStorage.getItem('dsp_token')
      const res = await fetch('/api/brief-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ messages, max_tokens: 2000 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()

      // Add assistant response to history
      messages = [...messages, { role: 'assistant', content: data.content }]

      // Show text blocks in UI
      const textBlock = (data.content ?? []).find(b => b.type === 'text')
      if (textBlock?.text?.trim()) {
        display = [...display, { type: 'ai', text: textBlock.text.trim() }]
      }

      if (data.stop_reason !== 'tool_use') break

      // Execute all tool calls in sequence
      const toolResults = []
      for (const block of data.content ?? []) {
        if (block.type !== 'tool_use') continue
        currentTool = block.name
        display = [...display, { type: 'tool', name: block.name }]
        let result
        try   { result = await executeTool(block.name, block.input) }
        catch { result = { error: 'Ошибка выполнения' } }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      }
      currentTool = ''

      messages = [...messages, { role: 'user', content: toolResults }]

      if (plan) break
    }
  }

  async function start() {
    if (!briefText.trim()) return
    error = ''
    plan = null
    display = [{ type: 'user', text: briefText.trim() }]
    messages = [{ role: 'user', content: briefText.trim() }]
    loading = true
    try {
      await runLoop()
      if (plan) display = [...display, { type: 'plan', plan }]
    } catch (e) {
      error = e?.message ?? 'Ошибка соединения'
    } finally {
      loading = false
    }
  }

  function applyPlan() {
    dispatch('apply', plan)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const TOOL_LABELS = {
    list_cities:    'Проверяю города…',
    count_inventory:'Считаю экраны…',
    sample_pricing: 'Анализирую цены…',
    list_vendors:   'Ищу оператора…',
    search_pois:    'Ищу объекты на карте…',
    finalize_plan:  'Составляю план…',
  }

  function fmt(val) {
    if (val == null || val === '') return '—'
    return String(val)
  }
</script>

<div class="brief-wrap">
  <div class="brief-header">
    <button class="btn-back" on:click={() => dispatch('back')}>← Назад</button>
    <span class="brief-title">ИИ бриф</span>
  </div>

  {#if display.length === 0}
    <!-- Input state -->
    <div class="brief-input-area">
      <p class="brief-hint">
        Опишите кампанию в свободной форме: продукт, города, бюджет, даты, предпочтения по форматам или локациям.
        ИИ составит готовый план.
      </p>
      <textarea
        class="brief-textarea"
        bind:value={briefText}
        placeholder="Например: кампания для кофейни в Москве и Казани, бюджет 200 000 ₽, две недели в июле, нужны экраны в центре рядом с бизнес-центрами"
        rows="6"
        disabled={loading}
      ></textarea>
      <div class="brief-actions">
        <button class="btn-submit" on:click={start} disabled={!briefText.trim() || loading}>
          {loading ? 'Обрабатываю…' : 'Составить план'}
        </button>
      </div>
    </div>
  {:else}
    <!-- Chat view -->
    <div class="chat-area">
      {#each display as item}
        {#if item.type === 'user'}
          <div class="msg msg--user">{item.text}</div>
        {:else if item.type === 'ai'}
          <div class="msg msg--ai">{item.text}</div>
        {:else if item.type === 'tool'}
          <div class="tool-call">
            <span class="tool-dot"></span>
            {TOOL_LABELS[item.name] ?? item.name}
          </div>
        {:else if item.type === 'plan' && item.plan}
          {@const p = item.plan}
          <div class="plan-card">
            <div class="plan-card-header">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:#6366f1;flex-shrink:0">
                <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
              <span>План готов</span>
            </div>

            <div class="plan-rows">
              {#if p.name}<div class="plan-row"><span class="plan-key">Название</span><span class="plan-val">{p.name}</span></div>{/if}
              {#if p.cities?.length}<div class="plan-row"><span class="plan-key">Города</span><span class="plan-val">{p.cities.join(', ')}</span></div>{/if}
              {#if p.startDate || p.endDate}<div class="plan-row"><span class="plan-key">Период</span><span class="plan-val">{fmt(p.startDate)} — {fmt(p.endDate)}</span></div>{/if}
              {#if p.customBudgetTotal}<div class="plan-row"><span class="plan-key">Бюджет</span><span class="plan-val">{Number(p.customBudgetTotal).toLocaleString('ru-RU')} ₽</span></div>{/if}
              {#if p.bidType}<div class="plan-row"><span class="plan-key">Тип ставки</span><span class="plan-val">{p.bidType === 'OTS' ? 'OTS (за тысячу)' : 'BID (за выход)'}</span></div>{/if}
              {#if p.productCategory}<div class="plan-row"><span class="plan-key">Категория</span><span class="plan-val">{p.productCategory}</span></div>{/if}
              {#if p.vendor}<div class="plan-row"><span class="plan-key">Оператор</span><span class="plan-val">{p.vendor}</span></div>{/if}
              {#if p.screenNotes}<div class="plan-row"><span class="plan-key">Экраны</span><span class="plan-val">{p.screenNotes}</span></div>{/if}
              {#if p.reasoning}<div class="plan-row plan-row--reasoning"><span class="plan-key">Обоснование</span><span class="plan-val">{p.reasoning}</span></div>{/if}
              {#if p.assumptions?.length}
                <div class="plan-row plan-row--reasoning">
                  <span class="plan-key">Допущения</span>
                  <span class="plan-val">{p.assumptions.join(' ')}</span>
                </div>
              {/if}
            </div>

            <button class="btn-apply" on:click={applyPlan}>Применить план →</button>
          </div>
        {/if}
      {/each}

      {#if loading}
        <div class="loading-row">
          <div class="spinner-sm"></div>
          <span>{currentTool ? (TOOL_LABELS[currentTool] ?? currentTool) : 'Думаю…'}</span>
        </div>
      {/if}

      {#if error}
        <div class="error-msg">{error}</div>
      {/if}
    </div>

    {#if !loading && !plan}
      <div class="brief-actions brief-actions--bottom">
        <button class="btn-back-soft" on:click={() => { display = []; messages = []; briefText = ''; plan = null; error = '' }}>
          ← Начать заново
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .brief-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .brief-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 32px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .brief-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
  }

  .btn-back {
    background: none;
    border: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px 0;
    font-family: inherit;
    transition: color 0.1s;
  }
  .btn-back:hover { color: var(--text); }

  /* ── Input state ── */
  .brief-input-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    gap: 16px;
    max-width: 640px;
    margin: 0 auto;
    width: 100%;
  }

  .brief-hint {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0;
    text-align: center;
  }

  .brief-textarea {
    width: 100%;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 13.5px;
    font-family: inherit;
    color: var(--text);
    background: var(--surface, #fff);
    resize: vertical;
    line-height: 1.5;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }
  .brief-textarea:focus { outline: none; border-color: #6366f1; }
  .brief-textarea:disabled { opacity: 0.6; }

  .brief-actions {
    display: flex;
    justify-content: flex-end;
    width: 100%;
  }
  .brief-actions--bottom {
    padding: 12px 32px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .btn-submit {
    height: 38px;
    padding: 0 28px;
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: var(--radius-sm, 6px);
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s;
  }
  .btn-submit:hover:not(:disabled) { background: #4f46e5; }
  .btn-submit:disabled { opacity: 0.5; cursor: default; }

  /* ── Chat view ── */
  .chat-area {
    flex: 1;
    overflow-y: auto;
    padding: 20px 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .msg {
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 13.5px;
    line-height: 1.5;
    max-width: 86%;
    white-space: pre-wrap;
  }
  .msg--user {
    background: #6366f1;
    color: #fff;
    align-self: flex-end;
  }
  .msg--ai {
    background: var(--surface, #fff);
    border: 1px solid var(--border);
    color: var(--text);
    align-self: flex-start;
  }

  .tool-call {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
    padding: 4px 0;
  }
  .tool-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6366f1;
    opacity: 0.6;
    flex-shrink: 0;
  }

  /* ── Plan card ── */
  .plan-card {
    background: linear-gradient(135deg, #fff 60%, #f5f3ff);
    border: 1px solid #c7d2fe;
    border-radius: var(--radius);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .plan-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }

  .plan-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .plan-row {
    display: flex;
    gap: 10px;
    font-size: 12.5px;
  }
  .plan-row--reasoning { align-items: flex-start; }

  .plan-key {
    color: var(--text-muted);
    flex: 0 0 110px;
    font-weight: 500;
  }
  .plan-val {
    color: var(--text);
    flex: 1;
  }

  .btn-apply {
    height: 36px;
    padding: 0 20px;
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: var(--radius-sm, 6px);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    align-self: flex-start;
    transition: background 0.12s;
  }
  .btn-apply:hover { background: #4f46e5; }

  /* ── Loading ── */
  .loading-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .spinner-sm {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg {
    padding: 10px 14px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #ef4444;
    font-size: 13px;
  }

  .btn-back-soft {
    background: none;
    border: none;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    padding: 0;
  }
  .btn-back-soft:hover { color: var(--text); }
</style>
