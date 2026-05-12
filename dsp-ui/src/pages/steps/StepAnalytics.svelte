<script>
  import { createEventDispatcher, onMount } from 'svelte'
  const dispatch = createEventDispatcher()
  export let draft

  // Init analytics on draft
  if (!draft.analytics) {
    draft.analytics = {
      counters: [],    // [{id, type, name, url}]
      offlineBlocks: [], // [{id, name, radius, lat, lon, address}]
    }
  }

  // ── Counter types (will load from API) ──────────────────────────────────────
  const COUNTER_TYPES_DEFAULT = [
    { value: 'IMPRESSION', label: 'Счётчик показов'  },
    { value: 'CLICK',      label: 'Счётчик кликов'   },
    { value: 'CONVERSION', label: 'Конверсия'         },
    { value: 'AUDIENCE',   label: 'Аудиторный пиксель'},
    { value: 'CUSTOM',     label: 'Произвольный'      },
  ]
  let counterTypes = COUNTER_TYPES_DEFAULT

  // ── Form state ───────────────────────────────────────────────────────────────
  // Counter form
  let showCounterForm = false
  let cfType  = 'IMPRESSION'
  let cfName  = ''
  let cfUrl   = ''
  let cfError = ''

  function openCounterForm() { cfType='IMPRESSION'; cfName=''; cfUrl=''; cfError=''; showCounterForm=true }
  function closeCounterForm() { showCounterForm = false }
  function addCounter() {
    if (!cfName.trim()) { cfError = 'Введите название'; return }
    if (!cfUrl.trim())  { cfError = 'Введите URL'; return }
    const id = Date.now()
    draft.analytics = {
      ...draft.analytics,
      counters: [...draft.analytics.counters, { id, type: cfType, name: cfName.trim(), url: cfUrl.trim() }]
    }
    closeCounterForm()
  }
  function removeCounter(id) {
    draft.analytics = { ...draft.analytics, counters: draft.analytics.counters.filter(c => c.id !== id) }
  }

  // Offline block form
  let showOfflineForm = false
  let ofName    = ''
  let ofAddress = ''
  let ofRadius  = 500
  let ofError   = ''

  function openOfflineForm() { ofName=''; ofAddress=''; ofRadius=500; ofError=''; showOfflineForm=true }
  function closeOfflineForm() { showOfflineForm = false }
  function addOfflineBlock() {
    if (!ofName.trim())    { ofError = 'Введите название'; return }
    if (!ofAddress.trim()) { ofError = 'Введите адрес';    return }
    const id = Date.now()
    draft.analytics = {
      ...draft.analytics,
      offlineBlocks: [...draft.analytics.offlineBlocks, { id, name: ofName.trim(), address: ofAddress.trim(), radius: ofRadius }]
    }
    closeOfflineForm()
  }
  function removeOffline(id) {
    draft.analytics = { ...draft.analytics, offlineBlocks: draft.analytics.offlineBlocks.filter(b => b.id !== id) }
  }

  function typeLabelOf(val) {
    return counterTypes.find(t => t.value === val)?.label ?? val
  }
</script>

<div class="step-content">
  <h1 class="step-title">Аналитика</h1>

  <!-- ── Counters / Pixels ─────────────────────────────────────────────────── -->
  <div class="an-card">
    <div class="an-card-header">
      <div class="an-card-info">
        <span class="an-card-title">Счётчики</span>
        <span class="an-card-desc">Пиксели и URL-счётчики для отслеживания показов, кликов и конверсий</span>
      </div>
      <button class="an-add-btn" on:click={openCounterForm}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Добавить
      </button>
    </div>

    {#if showCounterForm}
      <div class="an-form">
        <div class="an-form-row">
          <div class="an-field">
            <label class="an-label">Тип счётчика</label>
            <select class="an-select" bind:value={cfType}>
              {#each counterTypes as t}
                <option value={t.value}>{t.label}</option>
              {/each}
            </select>
          </div>
          <div class="an-field an-field--grow">
            <label class="an-label">Название</label>
            <input class="an-input" bind:value={cfName} placeholder="Например: Пиксель ВК" />
          </div>
        </div>
        <div class="an-form-row">
          <div class="an-field an-field--grow">
            <label class="an-label">URL счётчика</label>
            <input class="an-input" bind:value={cfUrl} placeholder="https://…" />
          </div>
        </div>
        {#if cfError}
          <div class="an-form-error">{cfError}</div>
        {/if}
        <div class="an-form-actions">
          <button class="an-btn-ghost" on:click={closeCounterForm}>Отмена</button>
          <button class="an-btn-primary" on:click={addCounter}>Добавить</button>
        </div>
      </div>
    {/if}

    {#if draft.analytics.counters.length > 0}
      <div class="an-list">
        {#each draft.analytics.counters as c (c.id)}
          <div class="an-list-item">
            <div class="an-item-icon">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
              </svg>
            </div>
            <div class="an-item-info">
              <span class="an-item-name">{c.name}</span>
              <span class="an-item-meta">
                <span class="an-type-chip">{typeLabelOf(c.type)}</span>
                <span class="an-item-url" title={c.url}>{c.url}</span>
              </span>
            </div>
            <button class="an-remove-btn" on:click={() => removeCounter(c.id)} title="Удалить">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {:else if !showCounterForm}
      <div class="an-empty">Счётчики не добавлены</div>
    {/if}
  </div>

  <!-- ── Offline blocks ────────────────────────────────────────────────────── -->
  <div class="an-card">
    <div class="an-card-header">
      <div class="an-card-info">
        <span class="an-card-title">Офлайн-блоки</span>
        <span class="an-card-desc">Зоны для отслеживания офлайн-конверсий — посещений точек продаж после показа рекламы</span>
      </div>
      <button class="an-add-btn" on:click={openOfflineForm}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Добавить
      </button>
    </div>

    {#if showOfflineForm}
      <div class="an-form">
        <div class="an-form-row">
          <div class="an-field an-field--grow">
            <label class="an-label">Название точки</label>
            <input class="an-input" bind:value={ofName} placeholder="Например: Магазин на Ленина" />
          </div>
          <div class="an-field" style="width:120px">
            <label class="an-label">Радиус, м</label>
            <input class="an-input" type="number" min="50" max="5000" bind:value={ofRadius} />
          </div>
        </div>
        <div class="an-form-row">
          <div class="an-field an-field--grow">
            <label class="an-label">Адрес</label>
            <input class="an-input" bind:value={ofAddress} placeholder="Город, улица, дом" />
          </div>
        </div>
        {#if ofError}
          <div class="an-form-error">{ofError}</div>
        {/if}
        <div class="an-form-actions">
          <button class="an-btn-ghost" on:click={closeOfflineForm}>Отмена</button>
          <button class="an-btn-primary" on:click={addOfflineBlock}>Добавить</button>
        </div>
      </div>
    {/if}

    {#if draft.analytics.offlineBlocks.length > 0}
      <div class="an-list">
        {#each draft.analytics.offlineBlocks as b (b.id)}
          <div class="an-list-item">
            <div class="an-item-icon an-item-icon--pin">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="an-item-info">
              <span class="an-item-name">{b.name}</span>
              <span class="an-item-meta">
                <span class="an-type-chip">{b.radius} м</span>
                <span class="an-item-url">{b.address}</span>
              </span>
            </div>
            <button class="an-remove-btn" on:click={() => removeOffline(b.id)} title="Удалить">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {:else if !showOfflineForm}
      <div class="an-empty">Офлайн-блоки не добавлены</div>
    {/if}
  </div>

  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <button class="btn-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>
</div>

<style>
  /* ── Cards ──────────────────────────────────────────────────────────────── */
  .an-card {
    background: var(--card-bg, #fff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 16px;
  }
  .an-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .an-card-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .an-card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text, #111827);
  }
  .an-card-desc {
    font-size: 13px;
    color: var(--text-muted, #6b7280);
    line-height: 1.45;
    max-width: 480px;
  }

  /* ── Add button ─────────────────────────────────────────────────────────── */
  .an-add-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    border: 1.5px solid var(--accent, #6366f1);
    background: transparent;
    color: var(--accent, #6366f1);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }
  .an-add-btn:hover {
    background: rgba(99,102,241,0.06);
  }

  /* ── Inline form ────────────────────────────────────────────────────────── */
  .an-form {
    margin-top: 16px;
    padding: 16px;
    background: var(--bg-muted, #f9fafb);
    border-radius: 10px;
    border: 1px solid var(--border, #e5e7eb);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .an-form-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .an-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 160px;
  }
  .an-field--grow {
    flex: 1;
  }
  .an-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .an-input, .an-select {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    font-size: 14px;
    color: var(--text, #111827);
    background: #fff;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  .an-input:focus, .an-select:focus {
    border-color: var(--accent, #6366f1);
  }
  .an-form-error {
    font-size: 12px;
    color: #ef4444;
  }
  .an-form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .an-btn-ghost {
    padding: 7px 16px;
    border-radius: 8px;
    border: 1px solid var(--border, #e5e7eb);
    background: transparent;
    font-size: 13px;
    color: var(--text-muted, #6b7280);
    cursor: pointer;
  }
  .an-btn-primary {
    padding: 7px 16px;
    border-radius: 8px;
    border: none;
    background: var(--accent, #6366f1);
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .an-btn-primary:hover { opacity: 0.88; }

  /* ── List ───────────────────────────────────────────────────────────────── */
  .an-list {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .an-list-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border, #e5e7eb);
    background: var(--bg-muted, #f9fafb);
  }
  .an-item-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(99,102,241,0.1);
    color: var(--accent, #6366f1);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .an-item-icon--pin {
    background: rgba(16,185,129,0.1);
    color: #10b981;
  }
  .an-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .an-item-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text, #111827);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .an-item-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .an-type-chip {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(99,102,241,0.1);
    color: var(--accent, #6366f1);
    white-space: nowrap;
  }
  .an-item-url {
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }
  .an-remove-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted, #9ca3af);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .an-remove-btn:hover {
    background: #fee2e2;
    color: #ef4444;
  }

  /* ── Empty state ────────────────────────────────────────────────────────── */
  .an-empty {
    margin-top: 14px;
    padding: 14px;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted, #9ca3af);
    background: var(--bg-muted, #f9fafb);
    border-radius: 8px;
    border: 1px dashed var(--border, #e5e7eb);
  }
</style>
