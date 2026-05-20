<script>
  import { createEventDispatcher } from 'svelte'
  import { formatDate } from '../../lib/utils.js'
  const dispatch = createEventDispatcher()

  export let draft
  export let metrics

  // ── Budget calculations (mirrors StepBudget logic) ───────────────────────
  $: forecastBudget = metrics?.budget ?? 0
  $: customBudget   = Number(draft.customBudgetTotal) || 0
  $: baer           = customBudget || forecastBudget

  $: daysCount = (draft.startDate && draft.endDate)
    ? Math.max(1, Math.round((new Date(draft.endDate) - new Date(draft.startDate)) / 86400000) + 1)
    : 1

  $: markupPct   = Number(draft.buyerMarkup) || 0
  $: markupAmt   = baer * (markupPct / 100)
  $: clientBase  = baer + markupAmt

  $: baerDay    = daysCount ? baer / daysCount : 0
  $: baerHour   = baerDay / 24
  $: clientDay  = daysCount ? clientBase / daysCount : 0
  $: clientHour = clientDay / 24

  $: baerVat    = baer * 0.20
  $: baerTotal  = baer * 1.20
  $: clientVat  = clientBase * 0.20
  $: clientTotal = clientBase * 1.20
  $: margin      = clientBase - baer   // = markupAmt

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmt(n, dec = 2) {
    if (!n && n !== 0) return '—'
    return n.toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  }

  const CAMPAIGN_TYPE = {
    RTB: 'Аукционная', OPEN_RTB: 'Open RTB',
    GUARANTEED: 'Гарантированная', FLEX_GUARANTEED: 'Flex',
    MEDIA_PLAN: 'Медиаплан', STATIC: 'Статик',
  }

  $: campaignTypeLabel = CAMPAIGN_TYPE[draft.type] ?? draft.type ?? '—'
  $: bidTypeLabel      = draft.bidType === 'OTS' ? 'По OTS' : 'По выходам'
  $: limitLabel        = draft.limitType === 'OTS' ? 'По OTS' : 'По выходам'

  $: advertiser = draft.customerName || (draft.customerId ? `ID ${draft.customerId}` : '—')
  $: brand      = draft.brandName    || (draft.brandId    ? `ID ${draft.brandId}`    : '—')
  $: agency     = draft.agencyName   || '—'

  $: locationText = draft.cities?.length ? draft.cities.join(', ') : '—'

  // ── Launch state ──────────────────────────────────────────────────────────
  let launched   = false
  let launching  = false
  let showToast  = false

  async function handleLaunch() {
    launching = true
    try {
      await dispatch('launch')
    } finally {
      launching = false
    }
  }

  function handleStop() {
    launched = false
    dispatch('stop')
  }

  // ── Share panel ───────────────────────────────────────────────────────────
  let showSharePanel = false

  const SCREEN_COLS = [
    'Фото экрана','GID','Оператор','Город','Адрес',
    'Сторона','Формат','Размер','График вещания',
    'Активность','Фотоотчёты','Вкл/Выкл',
  ]
  const AUD_COLS  = ['OTS Bov','OTS DMP','OTS ЦА']
  const BID_COLS  = ['Мин. ставка','Рекомендованная ставка','Ставка']

  let selectedScreen = new Set(SCREEN_COLS)
  let selectedAud    = new Set(AUD_COLS)
  let selectedBid    = new Set(BID_COLS)
  let audPeriod      = 'day'   // 'day' | 'month'

  function toggleChip(set, val) {
    const next = new Set(set)
    next.has(val) ? next.delete(val) : next.add(val)
    return next
  }

  let copied = false
  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#/map/campaign?` +
      `screen=${[...selectedScreen].join(',')}&aud=${[...selectedAud].join(',')}&bid=${[...selectedBid].join(',')}&period=${audPeriod}`
    navigator.clipboard?.writeText(url).catch(() => {})
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
</script>

<div class="step-content sv-summary">

  <!-- ── Top action bar ────────────────────────────────────────────────── -->
  <div class="sv-bar sv-bar-top">
    <div class="sv-bar-right">
      <button class="sv-dl-btn" title="Скачать ТТ">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        Скачать ТТ
      </button>
      <button class="sv-dl-btn" title="Скачать АП">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        Скачать АП
      </button>
      <button class="sv-dl-btn" title="Скачать МП">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        Скачать МП
      </button>
      <button class="sv-share-btn" on:click={() => showSharePanel = !showSharePanel}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>
        Поделиться кампанией
      </button>
    </div>
  </div>

  <h1 class="step-title">Сводка</h1>

  <!-- ── Основные параметры ─────────────────────────────────────────────── -->
  <div class="sv-card">
    <div class="sv-card-top">
      <span class="sv-card-title">Основные параметры</span>
      <button class="sv-edit-btn" on:click={() => dispatch('goto', 'basic')}>Редактировать</button>
    </div>
    <div class="sv-grid-3">
      <div class="sv-col">
        <span class="sv-col-label">Агентство</span>
        <span class="sv-col-val">{agency}</span>
      </div>
      <div class="sv-col">
        <span class="sv-col-label">Рекламодатель</span>
        <span class="sv-col-val">{advertiser}</span>
      </div>
      <div class="sv-col">
        <span class="sv-col-label">Бренд</span>
        <span class="sv-col-val">{brand}</span>
      </div>
    </div>
    <div class="sv-divider" />
    <div class="sv-grid-3">
      <div class="sv-col">
        <span class="sv-col-label">Период проведения</span>
        <span class="sv-col-val">
          {draft.startDate && draft.endDate
            ? `${formatDate(draft.startDate)} – ${formatDate(draft.endDate)}`
            : '—'}
        </span>
      </div>
      <div class="sv-col">
        <span class="sv-col-label">Тип ставки</span>
        <span class="sv-col-val">{bidTypeLabel}</span>
      </div>
      <div class="sv-col">
        <span class="sv-col-label">Тип кампании</span>
        <span class="sv-col-val">{campaignTypeLabel}</span>
      </div>
    </div>
    {#if locationText !== '—'}
      <div class="sv-divider" />
      <div class="sv-col">
        <span class="sv-col-label">Локация</span>
        <span class="sv-col-val">{locationText}</span>
      </div>
    {/if}
  </div>

  <!-- ── Бюджет размещения ──────────────────────────────────────────────── -->
  <div class="sv-card">
    <div class="sv-card-top">
      <span class="sv-card-title">Бюджет размещения</span>
      <button class="sv-edit-btn" on:click={() => dispatch('goto', 'budget')}>Редактировать</button>
    </div>

    <table class="sv-table">
      <thead>
        <tr>
          <th></th>
          <th>Баер</th>
          <th>Клиент</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>За кампанию</td>
          <td>{fmt(baer)}</td>
          <td>{fmt(clientBase)}</td>
        </tr>
        <tr>
          <td>В сутки</td>
          <td>{fmt(baerDay)}</td>
          <td>{fmt(clientDay)}</td>
        </tr>
        <tr>
          <td>В час</td>
          <td>{fmt(baerHour)}</td>
          <td>{fmt(clientHour)}</td>
        </tr>
        <tr class="sv-table-sep">
          <td>Итоговая сумма</td>
          <td>{fmt(baerTotal)}</td>
          <td>{fmt(clientTotal)}</td>
        </tr>
        <tr>
          <td>Базовая НДС</td>
          <td>{baer ? fmt(baer) : '—'}</td>
          <td>{clientBase ? fmt(clientBase) : '—'}</td>
        </tr>
        <tr>
          <td>НДС 20%</td>
          <td>{fmt(baerVat)}</td>
          <td>{fmt(clientVat)}</td>
        </tr>
        <tr>
          <td>Маржинальность</td>
          <td colspan="2">{fmt(margin)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ── Ограничения показов ────────────────────────────────────────────── -->
  <div class="sv-card">
    <div class="sv-card-top">
      <span class="sv-card-title">Ограничения показов</span>
      <button class="sv-edit-btn" on:click={() => dispatch('goto', 'settings')}>Редактировать</button>
    </div>
    <div class="sv-grid-4">
      <div class="sv-col">
        <span class="sv-col-label">Ограничения показов</span>
        <span class="sv-col-val">{limitLabel}</span>
      </div>
      <div class="sv-col">
        <span class="sv-col-label">За кампанию</span>
        <span class="sv-col-val">
          {draft.limitType === 'OTS' ? (draft.otsLimitCampaign || '—') : (draft.limitCampaign || '—')}
        </span>
      </div>
      <div class="sv-col">
        <span class="sv-col-label">В сутки</span>
        <span class="sv-col-val">
          {draft.limitType === 'OTS' ? (draft.otsLimitDay || '—') : (draft.limitDay || '—')}
        </span>
      </div>
      <div class="sv-col">
        <span class="sv-col-label">В час</span>
        <span class="sv-col-val">
          {draft.limitType === 'OTS' ? (draft.otsLimitHour || '—') : (draft.limitHour || '—')}
        </span>
      </div>
    </div>
  </div>

</div>

<!-- ── Share panel ────────────────────────────────────────────────────────── -->
{#if showSharePanel}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="sv-overlay" on:click={() => showSharePanel = false} />
  <div class="sv-share-panel">
    <div class="sv-share-header">
      <span class="sv-share-title">Поделиться картой</span>
      <button class="sv-share-close" on:click={() => showSharePanel = false}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Экран -->
    <div class="sv-share-section">
      <span class="sv-share-section-label">Экран</span>
      <div class="sv-chips">
        {#each SCREEN_COLS as col}
          <button
            class="sv-chip {selectedScreen.has(col) ? 'sv-chip--on' : ''}"
            on:click={() => selectedScreen = toggleChip(selectedScreen, col)}
          >{col}</button>
        {/each}
      </div>
    </div>

    <!-- Аудитория with День/Месяц toggle -->
    <div class="sv-share-section">
      <div class="sv-share-section-row">
        <span class="sv-share-section-label">Аудитория</span>
        <div class="sv-period-toggle">
          <button class="sv-period-btn {audPeriod === 'day' ? 'sv-period-btn--on' : ''}" on:click={() => audPeriod = 'day'}>День</button>
          <button class="sv-period-btn {audPeriod === 'month' ? 'sv-period-btn--on' : ''}" on:click={() => audPeriod = 'month'}>Месяц</button>
        </div>
      </div>
      <div class="sv-chips">
        {#each AUD_COLS as col}
          <button
            class="sv-chip {selectedAud.has(col) ? 'sv-chip--on' : ''}"
            on:click={() => selectedAud = toggleChip(selectedAud, col)}
          >{col}</button>
        {/each}
      </div>
    </div>

    <!-- Ставка -->
    <div class="sv-share-section">
      <span class="sv-share-section-label">Ставка</span>
      <div class="sv-chips">
        {#each BID_COLS as col}
          <button
            class="sv-chip {selectedBid.has(col) ? 'sv-chip--on' : ''}"
            on:click={() => selectedBid = toggleChip(selectedBid, col)}
          >{col}</button>
        {/each}
      </div>
    </div>

    <button class="sv-copy-link-btn" on:click={copyLink}>
      {#if copied}
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        Скопировано
      {:else}
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
        Скопировать ссылку
      {/if}
    </button>
  </div>
{/if}

<!-- ── Launch toast ───────────────────────────────────────────────────────── -->
{#if showToast}
  <div class="sv-toast">
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
    Кампания запущена
    <button class="sv-toast-close" on:click={() => showToast = false}>×</button>
  </div>
{/if}

<style>
  /* ── Cards ──────────────────────────────────────────────────────────────── */
  .sv-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 14px;
    width: 100%;
    max-width: 600px;
  }
  .sv-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .sv-card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text, #111827);
  }
  .sv-edit-btn {
    font-size: 13px;
    color: var(--accent, #6366f1);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-weight: 500;
  }
  .sv-edit-btn:hover { text-decoration: underline; }

  .sv-divider {
    border: none;
    border-top: 1px solid var(--border, #e5e7eb);
    margin: 14px 0;
  }

  /* ── Grids ───────────────────────────────────────────────────────────── */
  .sv-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .sv-grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .sv-col { display: flex; flex-direction: column; gap: 3px; }
  .sv-col-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted, #9ca3af);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sv-col-val {
    font-size: 14px;
    color: var(--text, #111827);
    font-weight: 500;
  }

  /* ── Budget table ────────────────────────────────────────────────────── */
  .sv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .sv-table th {
    text-align: right;
    font-weight: 600;
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    padding: 0 0 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sv-table th:first-child { text-align: left; }
  .sv-table td {
    padding: 7px 0;
    text-align: right;
    color: var(--text, #111827);
    border-bottom: 1px solid var(--border, #f3f4f6);
  }
  .sv-table td:first-child { text-align: left; color: var(--text-muted, #6b7280); }
  .sv-table tr:last-child td { border-bottom: none; }
  .sv-table-sep td {
    border-top: 2px solid var(--border, #e5e7eb);
    font-weight: 600;
    padding-top: 10px;
  }

  /* ── Top bar ─────────────────────────────────────────────────────────── */
  .sv-bar {
    position: sticky;
    top: 0;
    margin: -28px -28px 20px;
    padding: 10px 24px;
    background: var(--card-bg, #fff);
    border-bottom: 1px solid var(--border, #e5e7eb);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    z-index: 10;
  }
  .sv-bar-right { display: flex; gap: 8px; align-items: center; }

  .sv-dl-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 12px;
    border-radius: 7px;
    border: 1px solid var(--border, #e5e7eb);
    background: transparent;
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    cursor: pointer;
    white-space: nowrap;
  }
  .sv-dl-btn:hover { background: var(--bg-muted, #f3f4f6); }

  .sv-share-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 7px;
    border: 1.5px solid var(--accent, #6366f1);
    background: transparent;
    font-size: 12px;
    color: var(--accent, #6366f1);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  .sv-share-btn:hover { background: rgba(99,102,241,0.06); }

  /* ── Share panel ─────────────────────────────────────────────────────── */
  .sv-overlay {
    position: fixed;
    inset: 0;
    z-index: 49;
  }
  .sv-share-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 50;
    width: 420px;
    max-width: 95vw;
    background: var(--card-bg, #fff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    padding: 20px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .sv-share-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sv-share-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text, #111827);
  }
  .sv-share-close {
    width: 28px; height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted, #9ca3af);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .sv-share-close:hover { background: var(--bg-muted, #f3f4f6); }
  .sv-share-section { display: flex; flex-direction: column; gap: 8px; }
  .sv-share-section-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sv-share-section-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sv-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .sv-chip {
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid var(--border, #e5e7eb);
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    background: var(--bg-muted, #f3f4f6);
    cursor: pointer;
    transition: all 0.12s;
  }
  .sv-chip--on {
    background: rgba(99,102,241,0.1);
    border-color: var(--accent, #6366f1);
    color: var(--accent, #6366f1);
    font-weight: 500;
  }

  .sv-period-toggle {
    display: flex;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    overflow: hidden;
  }
  .sv-period-btn {
    padding: 3px 10px;
    font-size: 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted, #6b7280);
  }
  .sv-period-btn--on {
    background: var(--accent, #6366f1);
    color: #fff;
  }

  .sv-copy-link-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    padding: 10px;
    border-radius: 9px;
    border: none;
    background: var(--accent, #6366f1);
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .sv-copy-link-btn:hover { opacity: 0.88; }

  /* ── Toast ───────────────────────────────────────────────────────────── */
  .sv-toast {
    position: fixed;
    bottom: 72px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: #111827;
    color: #fff;
    border-radius: 24px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    animation: fadeIn 0.2s ease;
  }
  .sv-toast svg { color: #34d399; }
  .sv-toast-close {
    margin-left: 4px;
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
</style>
