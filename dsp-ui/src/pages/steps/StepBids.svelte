<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()

  export let draft

  // ── Init ──────────────────────────────────────────────────────────────
  if (!draft.screenBids) draft.screenBids = {}
  if (draft.useRecBid == null) draft.useRecBid = true

  // ── Screens from cache ────────────────────────────────────────────────
  let screens = []
  $: {
    const cacheKey = (draft.cities ?? []).length > 0
      ? [...draft.cities].sort().join('|')
      : '__all__'
    const cached = window._dspScreensCache?.[cacheKey] ?? []
    screens = cached.filter(s => draft.screenIds.includes(s.id))
  }

  // ── Bid mode ──────────────────────────────────────────────────────────
  let bidMode = draft.useRecBid ? 'recommended' : 'custom'

  const MODE_DESC = {
    recommended: 'Ставка рассчитывается на основе исторических данных и прогнозов по открутке. Большая вероятность выиграть аукцион.',
    min:         'Подрядчик не готов продавать место ниже этой цены.',
    custom:      '',
  }

  function recBidFor(s) { return s.minBid != null ? Math.ceil(s.minBid * 1.5 * 100) / 100 : 0 }

  // ── Custom bid inputs (bulk apply panel) ─────────────────────────────
  let buyerBidInput  = ''
  let clientBidInput = ''
  $: markup = Number(draft.buyerMarkup) || 0
  $: markupFactor = 1 + markup / 100

  function onBuyerInput(e) {
    buyerBidInput  = e.target.value
    const v = parseFloat(e.target.value)
    if (!isNaN(v)) clientBidInput = fmtNum(v * markupFactor)
  }
  function onClientInput(e) {
    clientBidInput = e.target.value
    const v = parseFloat(e.target.value)
    if (!isNaN(v)) buyerBidInput = fmtNum(v / markupFactor)
  }
  function fmtNum(n) {
    return isNaN(n) ? '' : (Math.round(n * 100) / 100).toString()
  }

  // ── Row checkboxes ────────────────────────────────────────────────────
  let checkedIds = new Set()
  $: allChecked  = filteredScreens.length > 0 && filteredScreens.every(s => checkedIds.has(s.id))
  $: someChecked = filteredScreens.some(s => checkedIds.has(s.id))

  function toggleCheck(id) {
    const s = new Set(checkedIds)
    s.has(id) ? s.delete(id) : s.add(id)
    checkedIds = s
  }
  function toggleAll() {
    if (allChecked) {
      const s = new Set(checkedIds)
      filteredScreens.forEach(sc => s.delete(sc.id))
      checkedIds = s
    } else {
      const s = new Set(checkedIds)
      filteredScreens.forEach(sc => s.add(sc.id))
      checkedIds = s
    }
  }

  // ── Apply bid to checked (or all visible if none checked) ─────────────
  function applyBid() {
    const targets = someChecked
      ? filteredScreens.filter(s => checkedIds.has(s.id))
      : filteredScreens
    const newBids = { ...draft.screenBids }
    for (const s of targets) {
      if (bidMode === 'recommended') {
        newBids[s.id] = recBidFor(s)
      } else if (bidMode === 'min') {
        newBids[s.id] = s.minBid ?? 0
      } else if (bidMode === 'custom') {
        const v = parseFloat(buyerBidInput)
        if (!isNaN(v) && v > 0) newBids[s.id] = v
      }
    }
    draft.screenBids = newBids
    draft.useRecBid  = bidMode === 'recommended'
  }

  // ── Column filters ────────────────────────────────────────────────────
  let filters = {
    gid: '', address: '', format: '', size: '', city: '',
    ots:    { min: '', max: '' },
    minBid: { min: '', max: '' },
  }

  function inRange(val, f) {
    if (f.min !== '' && (val == null || val < Number(f.min))) return false
    if (f.max !== '' && (val == null || val > Number(f.max))) return false
    return true
  }

  $: filteredScreens = screens.filter(s => {
    if (filters.gid     && !(s.gid || '').toLowerCase().includes(filters.gid.toLowerCase()))         return false
    if (filters.address && !(s.address || '').toLowerCase().includes(filters.address.toLowerCase())) return false
    if (filters.format  && !(s.format || '').toLowerCase().includes(filters.format.toLowerCase()))   return false
    if (filters.size    && !(s.size || '').toLowerCase().includes(filters.size.toLowerCase()))       return false
    if (filters.city    && !(s.city || '').toLowerCase().includes(filters.city.toLowerCase()))       return false
    if (!inRange(s.ots,    filters.ots))    return false
    if (!inRange(s.minBid, filters.minBid)) return false
    return true
  })

  // ── Per-row bid editing ───────────────────────────────────────────────
  function onRowBidInput(s, val) {
    draft.screenBids = { ...draft.screenBids, [s.id]: val === '' ? '' : Number(val) }
  }
  function onRowBidBlur(s, e) {
    const v = Number(e.target.value)
    if (v < (s.minBid ?? 0)) {
      draft.screenBids = { ...draft.screenBids, [s.id]: s.minBid ?? 0 }
    }
  }
  function removeScreen(id) {
    draft.screenIds = draft.screenIds.filter(x => x !== id)
    const { [id]: _, ...rest } = draft.screenBids
    draft.screenBids = rest
    const s = new Set(checkedIds); s.delete(id); checkedIds = s
  }

  // ── Validation ────────────────────────────────────────────────────────
  $: invalidIds = screens.filter(s => {
    const b = Number(draft.screenBids[s.id])
    return !b || b < (s.minBid ?? 0)
  }).map(s => s.id)

  // ── Formatters ────────────────────────────────────────────────────────
  function fmt(n, dec = 2) {
    if (n == null || isNaN(n)) return '—'
    return n.toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  }
  function fmtInt(n) { return n == null ? '—' : n.toLocaleString('ru-RU') }
</script>

<div class="bids-shell">

  <!-- ── Top panel ── -->
  <div class="bids-header">
    <p class="bids-desc">Вы можете задать ставку для всех сохранённых экранов или для группы экранов.</p>

    <div class="bids-top-row">
      <!-- Mode buttons -->
      <div class="bid-mode-bar">
        <button class="bid-mode-btn" class:active={bidMode==='recommended'} on:click={() => bidMode='recommended'}>Рекомендованная</button>
        <button class="bid-mode-btn" class:active={bidMode==='custom'}      on:click={() => bidMode='custom'}>Своя ставка</button>
        <button class="bid-mode-btn" class:active={bidMode==='min'}         on:click={() => bidMode='min'}>Минимальная</button>
      </div>

      <!-- Mode-specific right side -->
      <div class="bid-mode-right">
        {#if bidMode === 'custom'}
          <label class="bid-bulk-label">
            Ставка баера
            <input class="bid-bulk-input" type="number" step="0.01" min="0"
              bind:value={buyerBidInput} on:input={onBuyerInput} placeholder="0.00" />
          </label>
          <label class="bid-bulk-label">
            Ставка клиента
            <input class="bid-bulk-input" type="number" step="0.01" min="0"
              bind:value={clientBidInput} on:input={onClientInput} placeholder="0.00" />
          </label>
          {#if markup > 0}
            <span class="bid-markup-hint">Надбавка {markup}%</span>
          {/if}
        {:else}
          <p class="bid-mode-desc">{MODE_DESC[bidMode]}</p>
        {/if}

        <button class="btn-apply" on:click={applyBid}>
          Применить{someChecked ? ` (${[...checkedIds].filter(id => filteredScreens.some(s=>s.id===id)).length})` : ''}
        </button>
      </div>
    </div>

    <!-- Validation bar -->
    {#if invalidIds.length > 0}
      <div class="bid-error-bar">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <span>{invalidIds.length} экран(а) со ставкой ниже минимальной.</span>
        <button class="bid-error-fix" on:click={() => {
          const b = { ...draft.screenBids }
          for (const id of invalidIds) { const s = screens.find(x=>x.id===id); if(s) b[id] = s.minBid??0 }
          draft.screenBids = b
        }}>Исправить всё</button>
      </div>
    {/if}
  </div>

  <!-- ── Table ── -->
  <div class="bids-table-wrap">
    {#if screens.length === 0}
      <div class="bids-empty">
        <span>Нет выбранных экранов</span>
        <button class="bids-back-link" on:click={() => dispatch('back')}>← Выбрать экраны</button>
      </div>
    {:else}
      <table class="bids-table">
        <thead>
          <!-- Column labels -->
          <tr class="thead-labels">
            <th class="th-chk">
              <input type="checkbox"
                checked={allChecked}
                indeterminate={someChecked && !allChecked}
                on:change={toggleAll}
              />
            </th>
            <th class="th-thumb"></th>
            <th class="th-gid">GID</th>
            <th class="th-addr">Адрес</th>
            <th class="th-fmt">Формат</th>
            <th class="th-size">Размер</th>
            <th class="th-city">Город</th>
            <th class="th-num">OTS</th>
            <th class="th-num">Мин. ставка, ₽</th>
            <th class="th-bid">Ставка, ₽</th>
            <th class="th-del"></th>
          </tr>
          <!-- Filter row -->
          <tr class="thead-filters">
            <td></td>
            <td></td>
            <td><input class="col-filter-input" placeholder="Поиск…" bind:value={filters.gid} /></td>
            <td><input class="col-filter-input" placeholder="Поиск…" bind:value={filters.address} /></td>
            <td><input class="col-filter-input" placeholder="Поиск…" bind:value={filters.format} /></td>
            <td><input class="col-filter-input" placeholder="Поиск…" bind:value={filters.size} /></td>
            <td><input class="col-filter-input" placeholder="Поиск…" bind:value={filters.city} /></td>
            <td>
              <div class="range-filter">
                <input class="col-filter-input range-half" type="number" placeholder="от" bind:value={filters.ots.min} />
                <input class="col-filter-input range-half" type="number" placeholder="до" bind:value={filters.ots.max} />
              </div>
            </td>
            <td>
              <div class="range-filter">
                <input class="col-filter-input range-half" type="number" placeholder="от" bind:value={filters.minBid.min} />
                <input class="col-filter-input range-half" type="number" placeholder="до" bind:value={filters.minBid.max} />
              </div>
            </td>
            <td></td>
            <td></td>
          </tr>
        </thead>
        <tbody>
          {#each filteredScreens as s (s.id)}
            {@const bid      = draft.screenBids[s.id]}
            {@const belowMin = bid != null && bid !== '' && Number(bid) < (s.minBid ?? 0)}
            <tr class="bid-row" class:bid-row-error={belowMin} class:bid-row-checked={checkedIds.has(s.id)}>
              <!-- Checkbox -->
              <td class="td-chk" on:click|stopPropagation>
                <input type="checkbox" checked={checkedIds.has(s.id)} on:change={() => toggleCheck(s.id)} />
              </td>
              <!-- Thumbnail -->
              <td class="td-thumb">
                {#if s.photo}
                  <img src={s.photo} alt="" class="bid-thumb" loading="lazy" />
                {:else}
                  <div class="bid-thumb-ph">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="color:var(--border)">
                      <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                {/if}
              </td>
              <!-- GID -->
              <td class="td-gid">{s.gid || s.id}</td>
              <!-- Address -->
              <td class="td-addr">{s.address || '—'}</td>
              <!-- Format -->
              <td class="td-muted">{s.format || '—'}</td>
              <!-- Size -->
              <td class="td-muted">{s.size || '—'}</td>
              <!-- City -->
              <td class="td-muted">{s.city || '—'}</td>
              <!-- OTS -->
              <td class="td-num">{s.ots != null ? fmtInt(s.ots) : '—'}</td>
              <!-- Min bid -->
              <td class="td-num td-min">{s.minBid != null ? fmt(s.minBid) : '—'}</td>
              <!-- Bid input -->
              <td class="td-bid-cell">
                <div class="row-bid-wrap" class:row-bid-error={belowMin}>
                  <input
                    class="row-bid-input"
                    type="number" step="0.01"
                    min={s.minBid ?? 0}
                    value={bid ?? ''}
                    on:input={(e) => onRowBidInput(s, e.target.value)}
                    on:blur={(e) => onRowBidBlur(s, e)}
                  />
                  {#if belowMin}
                    <span class="row-bid-hint">мин. {fmt(s.minBid)}</span>
                  {/if}
                </div>
              </td>
              <!-- Remove -->
              <td class="td-del" on:click|stopPropagation>
                <button class="bid-del-btn" title="Убрать" on:click={() => removeScreen(s.id)}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
          {#if filteredScreens.length === 0}
            <tr><td colspan="11" class="bids-no-results">Ничего не найдено по фильтрам</td></tr>
          {/if}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- ── Nav ── -->
  <div class="bids-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <div class="bids-nav-right">
      <span class="bids-nav-count">
        {screens.length} экран{screens.length===1?'':screens.length<5?'а':'ов'}
        {#if someChecked}· {[...checkedIds].length} выбрано{/if}
      </span>
      <button class="btn-draft" on:click={() => dispatch('save')}>Сохранить черновик</button>
      <button class="btn-next" disabled={screens.length === 0} on:click={() => dispatch('next')}>Далее</button>
    </div>
  </div>
</div>

<style>
  .bids-shell {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; background: var(--bg);
  }

  /* ── Header ── */
  .bids-header {
    padding: 16px 24px 0;
    flex-shrink: 0;
    background: white;
    border-bottom: 1px solid var(--border);
  }
  .bids-desc {
    font-size: 12.5px; color: var(--text-muted);
    margin: 0 0 12px; line-height: 1.5;
  }

  .bids-top-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 14px;
    flex-wrap: wrap;
  }

  /* Mode buttons */
  .bid-mode-bar {
    display: flex; gap: 0;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 3px;
    flex-shrink: 0;
  }
  .bid-mode-btn {
    height: 30px; padding: 0 14px;
    border: none; border-radius: 6px;
    background: none;
    font-size: 12.5px; font-family: inherit; font-weight: 500;
    color: var(--text-muted); cursor: pointer;
    transition: all .15s; white-space: nowrap;
  }
  .bid-mode-btn:hover { color: var(--text); background: white; }
  .bid-mode-btn.active {
    background: white; color: var(--navy); font-weight: 700;
    box-shadow: 0 1px 4px rgba(0,0,0,.1);
  }

  /* Right side of top row */
  .bid-mode-right {
    display: flex; align-items: center; gap: 10px;
    flex: 1; min-width: 0;
  }
  .bid-mode-desc {
    flex: 1; font-size: 12px; color: var(--text-muted);
    line-height: 1.45; margin: 0;
  }

  /* Custom mode inputs */
  .bid-bulk-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--text-muted);
    white-space: nowrap;
  }
  .bid-bulk-input {
    width: 110px; height: 30px;
    border: 1.5px solid var(--border); border-radius: 6px;
    padding: 0 8px; font-size: 13px; font-family: inherit;
    color: var(--text); outline: none;
    font-variant-numeric: tabular-nums;
  }
  .bid-bulk-input:focus { border-color: var(--navy); }
  .bid-markup-hint {
    font-size: 11px; color: var(--text-muted); white-space: nowrap;
  }

  /* Apply button */
  .btn-apply {
    height: 32px; padding: 0 18px;
    background: var(--navy); color: white;
    border: none; border-radius: 7px;
    font-size: 13px; font-family: inherit; font-weight: 600;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    transition: background .15s;
  }
  .btn-apply:hover { background: #1e3a6e; }

  /* Error bar */
  .bid-error-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; margin-bottom: 10px;
    background: #FEF3C7; border: 1px solid #F59E0B;
    border-radius: 8px; font-size: 12.5px; color: #92400E;
  }
  .bid-error-fix {
    margin-left: auto; flex-shrink: 0;
    background: #F59E0B; border: none; border-radius: 5px;
    color: white; font-size: 12px; font-family: inherit; font-weight: 600;
    padding: 3px 10px; cursor: pointer;
  }
  .bid-error-fix:hover { background: #D97706; }

  /* ── Table ── */
  .bids-table-wrap { flex: 1; overflow-y: auto; background: white; }

  .bids-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px; height: 100%;
    color: var(--text-muted); font-size: 14px;
  }
  .bids-back-link {
    background: none; border: none; color: var(--navy);
    font-size: 13px; cursor: pointer; font-family: inherit;
  }

  .bids-table {
    width: 100%; border-collapse: collapse; font-size: 12.5px;
  }
  .bids-table thead {
    position: sticky; top: 0; background: var(--bg); z-index: 2;
  }
  .thead-labels th {
    padding: 7px 10px;
    text-align: left;
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .thead-filters td {
    padding: 4px 6px 6px;
    border-bottom: 2px solid var(--border);
    background: var(--bg);
  }
  .col-filter-input {
    width: 100%; height: 26px;
    border: 1px solid var(--border); border-radius: 5px;
    padding: 0 7px; font-size: 11.5px; font-family: inherit;
    color: var(--text); outline: none; background: white;
    min-width: 0;
  }
  .col-filter-input:focus { border-color: var(--navy); }
  .col-filter-input::placeholder { color: var(--text-muted); }
  .range-filter { display: flex; gap: 3px; }
  .range-half   { flex: 1; min-width: 0; }

  /* Widths */
  .th-chk  { width: 36px; }
  .th-thumb { width: 68px; }
  .th-gid  { width: 90px; }
  .th-addr { min-width: 160px; }
  .th-fmt  { width: 110px; }
  .th-size { width: 100px; }
  .th-city { width: 100px; }
  .th-num  { width: 110px; text-align: right; }
  .th-bid  { width: 130px; text-align: right; }
  .th-del  { width: 36px; }

  .bids-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }

  .bid-row { transition: background .1s; }
  .bid-row:hover td { background: var(--navy-light); }
  .bid-row-checked td { background: #EFF6FF; }
  .bid-row-checked:hover td { background: #DBEAFE; }
  .bid-row-error td { background: #FFFBEB; }
  .bid-row-error.bid-row-checked td { background: #FEF9C3; }

  .td-chk  { padding: 6px 10px; }
  .td-thumb { padding: 6px 8px; }
  .bid-thumb {
    width: 58px; height: 36px; object-fit: cover;
    border-radius: 4px; display: block;
  }
  .bid-thumb-ph {
    width: 58px; height: 36px; border-radius: 4px;
    background: var(--bg); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
  }

  .td-gid {
    font-family: monospace; font-size: 11px;
    font-weight: 600; color: var(--text-muted); white-space: nowrap;
  }
  .td-addr {
    font-weight: 600; color: var(--text);
    max-width: 220px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .td-muted { color: var(--text-muted); white-space: nowrap; }
  .td-num { text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .td-min { color: var(--text); font-weight: 500; }

  .td-bid-cell { text-align: right; }
  .row-bid-wrap { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .row-bid-input {
    width: 110px; height: 30px;
    border: 1.5px solid var(--border); border-radius: 6px;
    padding: 0 8px; font-size: 13px; font-family: inherit;
    font-weight: 600; color: var(--navy); text-align: right;
    outline: none; font-variant-numeric: tabular-nums;
    transition: border-color .12s;
  }
  .row-bid-input:focus { border-color: var(--navy); }
  .row-bid-error .row-bid-input { border-color: #F59E0B; background: #FFFBEB; }
  .row-bid-hint { font-size: 10px; color: #D97706; white-space: nowrap; }

  .td-del { padding: 4px 6px; }
  .bid-del-btn {
    width: 26px; height: 26px; border: none; background: none;
    cursor: pointer; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-muted); opacity: 0;
    transition: opacity .12s, background .12s;
  }
  .bid-row:hover .bid-del-btn { opacity: 1; }
  .bid-del-btn:hover { background: #FEE2E2; color: #EF4444; }

  .bids-no-results {
    text-align: center; padding: 24px;
    color: var(--text-muted); font-size: 13px;
  }

  /* ── Nav ── */
  .bids-nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 24px;
    border-top: 1px solid var(--border);
    background: white; flex-shrink: 0;
  }
  .bids-nav-right { display: flex; align-items: center; gap: 10px; }
  .bids-nav-count { font-size: 12px; color: var(--text-muted); }

  .btn-draft {
    height: 34px; padding: 0 16px;
    border: 1.5px solid var(--border); border-radius: 7px;
    background: white; font-size: 13px; font-family: inherit;
    color: var(--text); cursor: pointer; font-weight: 500;
  }
  .btn-draft:hover { border-color: var(--navy); color: var(--navy); }
</style>
