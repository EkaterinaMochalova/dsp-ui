<script>
  import { tick } from 'svelte'
  import { currentUser } from '../lib/stores.js'

  const STORE_KEY = 'gk_requests'
  const STATUS_LABEL = {
    READY_FOR_PRODUCT_REVIEW: 'К ревью продукта',
    NEEDS_EVIDENCE: 'Нужны доказательства',
    REFRAME: 'Переформулировать',
    EXISTING_SOLUTION: 'Уже решено',
    DECLINE: 'Отклонить',
  }

  // ponytail: localStorage вместо БД — V1-прототип, переезд на бэкенд когда появится второй пользователь
  let requests = load()
  let current = null            // выбранный сохранённый запрос
  let messages = []             // история для API (включая tool_use/tool_result)
  let display = []              // что показываем
  let input = ''
  let loading = false
  let error = ''
  let messagesEl

  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) ?? [] } catch { return [] } }
  function persist() { localStorage.setItem(STORE_KEY, JSON.stringify(requests)); requests = requests }

  $: requester = $currentUser?.name || $currentUser?.email || 'неизвестно'

  function newRequest() {
    current = null; messages = []; display = []; error = ''; input = ''
  }

  function open(r) {
    current = r
    messages = r.messages
    display = r.display
    error = ''
  }

  function saveBrief(brief) {
    if (current) {
      Object.assign(current, { brief, aiStatus: brief.status, title: brief.title, updatedAt: Date.now() })
      if (!current.override) current.status = brief.status
    } else {
      current = {
        id: 'R' + Date.now().toString(36),
        title: brief.title,
        requester,
        createdAt: Date.now(),
        brief,
        aiStatus: brief.status,
        status: brief.status,
        override: null,
        messages: [],
        display: [],
      }
      requests = [current, ...requests]
    }
  }

  function syncCurrent() {
    if (!current) return
    current.messages = messages
    current.display = display
    persist()
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    input = ''
    error = ''
    display = [...display, { role: 'user', text }]
    messages = [...messages, { role: 'user', content: text }]
    loading = true
    await tick(); scroll()
    try {
      await runTurn()
    } catch (e) {
      error = e.message
    } finally {
      loading = false
      syncCurrent()
      await tick(); scroll()
    }
  }

  async function runTurn() {
    // Один вызов; если модель вызвала finalize_assessment — сохраняем, отдаём tool_result и даём ей договорить.
    for (let i = 0; i < 3; i++) {
      const res = await fetch('/api/gatekeeper-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          requester,
          existingRequests: requests.filter(r => r !== current).map(r => ({ id: r.id, title: r.title, problem: r.brief?.problem ?? '', status: r.status })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error?.message ?? data.error ?? `HTTP ${res.status}`)

      messages = [...messages, { role: 'assistant', content: data.content }]
      for (const b of data.content ?? []) {
        if (b.type === 'text' && b.text.trim()) display = [...display, { role: 'assistant', text: b.text.trim() }]
      }
      if (data.stop_reason !== 'tool_use') return

      const results = []
      for (const b of data.content) {
        if (b.type !== 'tool_use') continue
        if (b.name === 'finalize_assessment') {
          saveBrief(b.input)
          display = [...display, { role: 'brief', brief: b.input }]
          results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify({ saved: true, id: current.id }) })
        } else {
          results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: 'Unknown tool' })
        }
      }
      messages = [...messages, { role: 'user', content: results }]
    }
  }

  function override(r, status) {
    if (!status || status === r.aiStatus) { r.override = null; r.status = r.aiStatus }
    else {
      const reason = prompt('Причина переопределения (для обучения агента):') ?? ''
      r.override = { status, reason, by: requester, at: Date.now() }
      r.status = status
    }
    persist()
  }

  function remove(r) {
    if (!confirm(`Удалить запрос «${r.title}»?`)) return
    requests = requests.filter(x => x !== r)
    persist()
    if (current === r) newRequest()
  }

  function scroll() { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight }
  function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const FIELDS = [
    ['problem', 'Проблема'], ['affected_users', 'Затронутые пользователи'], ['affected_clients', 'Клиенты'],
    ['current_workflow', 'Как решают сейчас'], ['frequency', 'Частота'], ['reach', 'Охват'], ['impact', 'Влияние'],
    ['evidence', 'Доказательства'], ['existing_solution', 'Существующее решение'], ['proposed_solution', 'Предложенное решение'],
    ['alternatives', 'Альтернативы'], ['success_criteria', 'Критерии успеха'], ['urgency', 'Срочность'],
    ['assessment', 'Оценка продукта'], ['recommendation', 'Следующий шаг'], ['missing_information', 'Чего не хватает'],
    ['open_questions', 'Открытые вопросы'], ['duplicate_of', 'Дубликат'],
  ]
  const show = v => Array.isArray(v) ? (v.length ? v.join('; ') : '—') : (v || '—')
</script>

<div class="gk">
  <aside class="list">
    <div class="list-head">
      <h2>Запросы в продукт</h2>
      <button class="btn primary" on:click={newRequest}>+ Новый</button>
    </div>
    {#if requests.length === 0}
      <p class="muted">Пока нет сохранённых запросов.</p>
    {/if}
    {#each requests as r (r.id)}
      <button class="item" class:active={current === r} on:click={() => open(r)}>
        <div class="item-title">{r.title}</div>
        <div class="item-meta">
          <span class="badge s-{r.status}">{STATUS_LABEL[r.status]}</span>
          {#if r.override}<span class="muted" title={r.override.reason}>переопр.</span>{/if}
        </div>
        <div class="muted small">{r.requester} · {new Date(r.createdAt).toLocaleDateString('ru-RU')}</div>
      </button>
    {/each}
  </aside>

  <section class="chat">
    <div class="chat-head">
      <div>
        <strong>{current ? current.title : 'Новый запрос'}</strong>
        {#if current}
          <span class="badge s-{current.status}">{STATUS_LABEL[current.status]}</span>
        {/if}
      </div>
      {#if current}
        <div class="controls">
          <label class="muted small">Решение продукта:
            <select value={current.status} on:change={(e) => override(current, e.target.value)}>
              {#each Object.entries(STATUS_LABEL) as [k, v]}
                <option value={k}>{v}{k === current.aiStatus ? ' (AI)' : ''}</option>
              {/each}
            </select>
          </label>
          <button class="btn" on:click={() => remove(current)}>Удалить</button>
        </div>
      {/if}
    </div>

    <div class="messages" bind:this={messagesEl}>
      {#if display.length === 0}
        <div class="hint">
          <p>Опишите, что нужно, своими словами. Агент — скептичный продакт: он не создаст задачу, а будет выяснять,
            какую проблему вы решаете, для кого и что будет, если ничего не делать.</p>
          <p class="muted small">Пример: «Нужно добавить экспорт статистики кампаний в PowerPoint».</p>
        </div>
      {/if}
      {#each display as m}
        {#if m.role === 'brief'}
          <div class="brief">
            <div class="brief-head">
              <strong>Продуктовый бриф</strong>
              <span class="badge s-{m.brief.status}">{STATUS_LABEL[m.brief.status]}</span>
              <span class="muted small">{m.brief.category}</span>
            </div>
            <dl>
              {#each FIELDS as [k, label]}
                <dt>{label}</dt><dd>{show(m.brief[k])}</dd>
              {/each}
            </dl>
          </div>
        {:else}
          <div class="msg {m.role}">{m.text}</div>
        {/if}
      {/each}
      {#if loading}<div class="msg assistant muted">Думаю…</div>{/if}
      {#if error}<div class="msg error">Ошибка: {error}</div>{/if}
    </div>

    <div class="input-row">
      <textarea bind:value={input} on:keydown={onKey} rows="2" disabled={loading}
        placeholder={current ? 'Добавить доказательства или ответить…' : 'Что нужно и зачем?'}></textarea>
      <button class="btn primary" on:click={send} disabled={loading || !input.trim()}>Отправить</button>
    </div>
  </section>
</div>

<style>
  .gk { display: grid; grid-template-columns: 300px 1fr; gap: 16px; padding: 24px; height: calc(100vh - var(--topbar-h, 48px)); box-sizing: border-box; }
  .list { background: var(--surface, #fff); border: 1px solid var(--border, #E3E8ED); border-radius: var(--radius, 8px); padding: 12px; overflow-y: auto; }
  .list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .list-head h2 { font-size: 15px; margin: 0; }
  .item { display: block; width: 100%; text-align: left; background: none; border: 1px solid transparent; border-radius: var(--radius-sm, 6px); padding: 8px; cursor: pointer; font: inherit; color: var(--text, #121212); }
  .item:hover { background: var(--bg, #F3F5F7); }
  .item.active { border-color: var(--navy, #112853); background: var(--navy-light, #DAECF6); }
  .item-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .item-meta { display: flex; gap: 6px; align-items: center; margin-bottom: 2px; }

  .chat { display: flex; flex-direction: column; background: var(--surface, #fff); border: 1px solid var(--border, #E3E8ED); border-radius: var(--radius, 8px); min-height: 0; }
  .chat-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border, #E3E8ED); font-size: 14px; flex-wrap: wrap; }
  .chat-head .badge { margin-left: 8px; }
  .controls { display: flex; gap: 8px; align-items: center; }
  select { font: inherit; padding: 4px 6px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border, #E3E8ED); }

  .messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .hint { color: var(--text-muted, #606771); font-size: 14px; line-height: 1.5; max-width: 560px; }
  .hint p { margin: 0 0 8px; }
  .msg { max-width: 75%; padding: 9px 13px; border-radius: 12px; font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .msg.user { align-self: flex-end; background: var(--navy, #112853); color: #fff; border-bottom-right-radius: 3px; }
  .msg.assistant { align-self: flex-start; background: var(--bg, #F3F5F7); border-bottom-left-radius: 3px; }
  .msg.error { align-self: stretch; background: #FDECEA; color: #B3261E; }

  .brief { border: 1px solid var(--border, #E3E8ED); border-radius: var(--radius, 8px); padding: 12px 16px; font-size: 13px; background: var(--surface, #fff); }
  .brief-head { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  dl { display: grid; grid-template-columns: 180px 1fr; gap: 4px 12px; margin: 0; }
  dt { color: var(--text-muted, #606771); }
  dd { margin: 0; white-space: pre-wrap; }

  .input-row { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border, #E3E8ED); }
  textarea { flex: 1; font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--border, #E3E8ED); border-radius: var(--radius-sm, 6px); resize: none; }
  textarea:focus { outline: none; border-color: var(--navy, #112853); }

  .btn { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border, #E3E8ED); background: var(--surface, #fff); cursor: pointer; }
  .btn.primary { background: var(--navy, #112853); color: #fff; border-color: var(--navy, #112853); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }

  .badge { font-size: 11px; padding: 2px 8px; border-radius: var(--radius-pill, 999px); background: var(--chip-bg, #E3E8ED); white-space: nowrap; }
  .s-READY_FOR_PRODUCT_REVIEW { background: #DDF5E3; color: #15613A; }
  .s-NEEDS_EVIDENCE { background: #FFF3CD; color: #7A5A00; }
  .s-REFRAME { background: var(--navy-light, #DAECF6); color: var(--navy, #112853); }
  .s-EXISTING_SOLUTION { background: #E8E4F7; color: #4B3A8C; }
  .s-DECLINE { background: #FDECEA; color: #B3261E; }
  .muted { color: var(--text-muted, #606771); }
  .small { font-size: 11px; }
</style>
