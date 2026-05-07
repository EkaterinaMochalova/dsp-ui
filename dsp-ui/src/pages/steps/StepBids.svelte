<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()

  export let draft

  // ── Init draft fields ──────────────────────────────────────────────────
  if (!draft.screenBids)  draft.screenBids  = {}
  if (draft.useRecBid == null) draft.useRecBid = true

  // ── Pull selected screens from window cache ────────────────────────────
  let screens = []
  $: {
    const cacheKey = (draft.cities ?? []).length > 0
      ? [...draft.cities].sort().join('|')
      : '__all__'
    const cached = window._dspScreensCache?.[cacheKey] ?? []
    screens = cached.filter(s => draft.screenIds.includes(s.id))
  }

  // ── Bid mode ───────────────────────────────────────────────────────────
  // 'recommended' | 'min' | 'custom'
  let bidMode = draft.useRecBid ? 'recommended' : 'custom'

  function recBid(s)  { return s.minBid != null ? Math.ceil(s.minBid * 1.5 * 100) / 100 : 0 }
  function minBid(s)  { return s.minBid ?? 0 }

  function applyMode(mode) {
    bidMode = mode
    draft.useRecBid = mode === 'recommended'
    if (mode === 'recommended') {
      const b = {}
      for (const s of screens) b[s.id] = recBid(s)
      draft.screenBids = b
    } else if (mode === 'min') {
      const b = {}
      for (const s of screens) b[s.id] = minBid(s)
      draft.screenBids = b
    }
    // 'custom' — keep existing values, just let user edit
  }

  // Apply recommended by default if no bids set yet
  $: if (screens.length > 0 && Object.keys(draft.screenBids).length === 0) {
    applyMode(bidMode)
  }

  // ── Validation ─────────────────────────────────────────────────────────
  $: invalidIds = screens
    .filter(s => {
      const b = Number(draft.screenBids[s.id])
      return !b || b < (s.minBid ?? 0)
    })
    .map(s => s.id)
  $: hasErrors = invalidIds.length > 0

  // ── Totals ─────────────────────────────────────────────────────────────
  $: totalBid = screens.reduce((sum, s) => sum + (Number(draft.screenBids[s.id]) || 0), 0)

  // ── Formatters ─────────────────────────────────────────────────────────
  function fmt(n, dec = 2) {
    if (n == null || isNaN(n)) return '—'
    return n.toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  }
  function fmtInt(n) {
    if (n == null) return '—'
    return n.toLocaleString('ru-RU')
  }

  function onBidInput(s, val) {
    draft.screenBids = { ...draft.screenBids, [s.id]: val === '' ? '' : Number(val) }
    if (bidMode !== 'custom') bidMode = 'custom'
    draft.useRecBid = false
  }

  function removeScreen(id) {
    draft.screenIds = draft.screenIds.filter(x => x !== id)
    const { [id]: _, ...rest } = draft.screenBids
    draft.screenBids = rest
  }
</script>

<div class="bids-shell">

  <!-- Header -->
  <div class="bids-header">
    <h2 class="bids-title">Ставка</h2>
    <p class="bids-desc">
      Укажите ставку для каждого экрана. Ставка не должна быть ниже минимальной.
      Рекомендованная ставка рассчитана на основе исторических данных.
    </p>

    <!-- Mode selector -->
    <div class="bid-mode-bar">
      <button
        class="bid-mode-btn"
        class:active={bidMode === 'recommended'}
        on:click={() => applyMode('recommended')}
      >Рекомендованная</button>
      <button
        class="bid-mode-btn"
        class:active={bidMode === 'min'}
        on:click={() => applyMode('min')}
      >Мин. ставка</button>
      <button
        class="bid-mode-btn"
        class:active={bidMode === 'custom'}
        on:click={() => applyMode('custom')}
      >Произвольная</button>
    </div>

    <!-- Validation error bar -->
    {#if hasErrors}
      <div class="bid-error-bar">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <span>
          {invalidIds.length} {invalidIds.length === 1 ? 'экран' : invalidIds.length < 5 ? 'экрана' : 'экранов'}
          {invalidIds.length === 1 ? 'имеет ставку' : 'имеют ставки'} ниже минимальной.
          Минимальные ставки применены автоматически.
        </span>
        <button class="bid-error-fix" on:click={() => applyMode('min')}>Исправить</button>
      </div>
    {/if}

    <!-- Cost summary -->
    <div class="bid-summary-bar">
      <div class="bid-summary-item">
        <span class="bid-summary-label">Экранов</span>
        <span class="bid-summary-val">{screens.length}</span>
      </div>
      <div class="bid-summary-divider"></div>
      <div class="bid-summary-item">
        <span class="bid-summary-label">Общая ставка</span>
        <span class="bid-summary-val bid-summary-total">{fmt(totalBid)} ₽</span>
      </div>
      {#if bidMode === 'recommended'}
        <div class="bid-summary-divider"></div>
        <div class="bid-summary-item">
          <span class="bid-summary-mode">✓ Рекомендованные ставки</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Table -->
  <div class="bids-table-wrap">
    {#if screens.length === 0}
      <div class="bids-empty">
        <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor" style="color:var(--border)">
          <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
        </svg>
        <span>Нет выбранных экранов</span>
        <button class="bids-back-link" on:click={() => dispatch('back')}>← Выбрать экраны</button>
      </div>
    {:else}
      <table class="bids-table">
        <thead>
          <tr>
            <th class="th-thumb"></th>
            <th class="th-info">Экран</th>
            <th class="th-num">OTS</th>
            <th class="th-num">Мин. ставка, ₽</th>
            <th class="th-num">Рекомендованная, ₽</th>
            <th class="th-bid">Ставка, ₽</th>
            <th class="th-del"></th>
          </tr>
        </thead>
        <tbody>
          {#each screens as s (s.id)}
            {@const bid = draft.screenBids[s.id]}
            {@const isBelowMin = bid != null && bid !== '' && Number(bid) < (s.minBid ?? 0)}
            <tr class="bid-row" class:bid-row-error={isBelowMin}>
              <!-- Thumbnail -->
              <td class="td-thumb">
                {#if s.photo}
                  <img src={s.photo} alt="" class="bid-thumb" loading="lazy"/>
                {:else}
                  <div class="bid-thumb-placeholder">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:var(--border)">
                      <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                {/if}
              </td>

              <!-- Screen info -->
              <td class="td-info">
                <div class="bid-screen-gid">{s.gid || s.id}</div>
                <div class="bid-screen-addr">{s.address || '—'}</div>
                <div class="bid-screen-meta">
                  {[s.city, s.format, s.size].filter(Boolean).join(' · ')}
                </div>
              </td>

              <!-- OTS -->
              <td class="td-num">{s.ots != null ? fmtInt(s.ots) : '—'}</td>

              <!-- Min bid -->
              <td class="td-num td-min">{s.minBid != null ? fmt(s.minBid) : '—'}</td>

              <!-- Recommended -->
              <td class="td-num td-rec">{s.minBid != null ? fmt(recBid(s)) : '—'}</td>

              <!-- Bid input -->
              <td class="td-bid">
                <div class="bid-input-wrap" class:bid-input-error={isBelowMin}>
                  <input
                    class="bid-input"
                    type="number"
                    step="0.01"
                    min={s.minBid ?? 0}
                    value={bid ?? ''}
                    on:input={(e) => onBidInput(s, e.target.value)}
                    on:blur={(e) => {
                      const v = Number(e.target.value)
                      if (v < (s.minBid ?? 0)) {
                        draft.screenBids = { ...draft.screenBids, [s.id]: s.minBid ?? 0 }
                      }
                    }}
                  />
                  {#if isBelowMin}
                    <div class="bid-input-hint">Мин. {fmt(s.minBid)}</div>
                  {/if}
                </div>
              </td>

              <!-- Remove -->
              <td class="td-del">
                <button class="bid-del-btn" title="Убрать экран" on:click={() => removeScreen(s.id)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Nav -->
  <div class="bids-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <div class="bids-nav-right">
      <button class="btn-draft" on:click={() => dispatch('save')}>Сохранить черновик</button>
      <button
        class="btn-next"
        disabled={screens.length === 0}
        on:click={() => dispatch('next')}
      >
        Далее
      </button>
    </div>
  </div>
</div>

<style>
  .bids-shell {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  /* ── Header ── */
  .bids-header {
    padding: 24px 32px 0;
    flex-shrink: 0;
    background: white;
    border-bottom: 1px solid var(--border);
  }

  .bids-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--navy);
    margin: 0 0 6px;
  }

  .bids-desc {
    font-size: 12.5px;
    color: var(--text-muted);
    margin: 0 0 16px;
    max-width: 600px;
    line-height: 1.5;
  }

  /* ── Mode selector ── */
  .bid-mode-bar {
    display: flex;
    gap: 0;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 3px;
    width: fit-content;
    margin-bottom: 14px;
  }

  .bid-mode-btn {
    height: 30px;
    padding: 0 16px;
    border: none;
    border-radius: 6px;
    background: none;
    font-size: 12.5px;
    font-family: inherit;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
  }
  .bid-mode-btn:hover { color: var(--text); background: white; }
  .bid-mode-btn.active {
    background: white;
    color: var(--navy);
    font-weight: 700;
    box-shadow: 0 1px 4px rgba(0,0,0,.1);
  }

  /* ── Error bar ── */
  .bid-error-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    background: #FEF3C7;
    border: 1px solid #F59E0B;
    border-radius: 8px;
    font-size: 12.5px;
    color: #92400E;
    margin-bottom: 12px;
  }
  .bid-error-fix {
    margin-left: auto;
    flex-shrink: 0;
    background: #F59E0B;
    border: none;
    border-radius: 5px;
    color: white;
    font-size: 12px;
    font-family: inherit;
    font-weight: 600;
    padding: 4px 10px;
    cursor: pointer;
  }
  .bid-error-fix:hover { background: #D97706; }

  /* ── Summary bar ── */
  .bid-summary-bar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 10px 0;
  }

  .bid-summary-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 0 16px 0 0;
  }
  .bid-summary-label {
    font-size: 12px;
    color: var(--text-muted);
  }
  .bid-summary-val {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .bid-summary-total { color: var(--navy); font-size: 16px; }
  .bid-summary-divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 16px 0 0;
    flex-shrink: 0;
  }
  .bid-summary-mode {
    font-size: 12px;
    color: #16A34A;
    font-weight: 600;
  }

  /* ── Table ── */
  .bids-table-wrap {
    flex: 1;
    overflow-y: auto;
    background: white;
  }

  .bids-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--text-muted);
    font-size: 14px;
  }
  .bids-back-link {
    background: none;
    border: none;
    color: var(--navy);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }

  .bids-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .bids-table thead {
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 1;
  }

  .bids-table th {
    padding: 8px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .bids-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .th-thumb  { width: 72px; }
  .th-info   { width: auto; }
  .th-num    { width: 120px; text-align: right; }
  .th-bid    { width: 160px; text-align: right; }
  .th-del    { width: 40px; }

  .bid-row { transition: background .1s; }
  .bid-row:hover td { background: var(--navy-light); }
  .bid-row-error td { background: #FEF3C7; }
  .bid-row-error:hover td { background: #FDE68A; }

  .td-thumb { padding: 8px 12px; }
  .bid-thumb {
    width: 64px; height: 40px;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }
  .bid-thumb-placeholder {
    width: 64px; height: 40px;
    border-radius: 4px;
    background: var(--bg);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .td-info { max-width: 320px; }
  .bid-screen-gid {
    font-size: 11px;
    font-family: monospace;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  .bid-screen-addr {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }
  .bid-screen-meta {
    font-size: 11.5px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .td-num { text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .td-min { color: var(--text); font-weight: 500; }
  .td-rec { color: #16A34A; font-weight: 500; }

  .td-bid { text-align: right; }
  .bid-input-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .bid-input {
    width: 120px;
    height: 32px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    padding: 0 10px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 600;
    color: var(--navy);
    text-align: right;
    outline: none;
    font-variant-numeric: tabular-nums;
    transition: border-color .12s;
  }
  .bid-input:focus { border-color: var(--navy); }
  .bid-input-error .bid-input { border-color: #F59E0B; background: #FFFBEB; }
  .bid-input-hint { font-size: 10.5px; color: #D97706; }

  .td-del { text-align: center; padding: 8px 6px; }
  .bid-del-btn {
    width: 28px; height: 28px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity .12s, background .12s;
  }
  .bid-row:hover .bid-del-btn { opacity: 1; }
  .bid-del-btn:hover { background: #FEE2E2; color: #EF4444; }

  /* ── Nav ── */
  .bids-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    border-top: 1px solid var(--border);
    background: white;
    flex-shrink: 0;
  }

  .bids-nav-right { display: flex; align-items: center; gap: 10px; }

  .btn-draft {
    height: 36px;
    padding: 0 18px;
    border: 1.5px solid var(--border);
    border-radius: 7px;
    background: white;
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    cursor: pointer;
    font-weight: 500;
  }
  .btn-draft:hover { border-color: var(--navy); color: var(--navy); }
</style>
