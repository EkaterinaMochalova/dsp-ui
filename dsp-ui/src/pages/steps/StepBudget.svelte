<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()
  export let draft
  export let metrics

  // Баер = manual input OR forecast (manual takes priority)
  $: forecastBudget = metrics.budget ?? 0
  $: baer = Number(draft.customBudgetTotal) || forecastBudget
  $: markupPct = Number(draft.buyerMarkup) || 0
  $: markupAmt = baer * (markupPct / 100)
  $: clientBase = baer + markupAmt

  $: daysCount = (draft.startDate && draft.endDate)
    ? Math.max(1, Math.round((new Date(draft.endDate) - new Date(draft.startDate)) / 86400000) + 1)
    : 1

  // Per-day / per-hour
  $: baerDay    = daysCount ? baer / daysCount : 0
  $: baerHour   = baerDay / 24
  $: clientDay  = daysCount ? clientBase / daysCount : 0
  $: clientHour = clientDay / 24

  // Totals incl. VAT 20%
  $: baerTotal   = baer * 1.20
  $: baerVat     = baer * 0.20
  $: clientTotal = baerTotal + markupAmt
  $: clientVat   = clientBase * 0.20

  $: hasData = baer > 0

  function fmt(n, decimals = 0) {
    if (!n && n !== 0) return '—'
    return n.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  function fmtSmart(n) {
    // Use 1 decimal only when needed
    if (!n) return '—'
    const rounded = Math.round(n * 10) / 10
    return rounded % 1 === 0
      ? rounded.toLocaleString('ru-RU')
      : rounded.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }
</script>

<div class="step-content">
  <h1 class="step-title">Бюджет размещения</h1>

  <!-- Надбавка баера -->
  <div class="step-card">
    <div class="step-card-title" style="margin-bottom:14px">Надбавка баера</div>
    <div class="markup-input-wrap">
      <input
        class="field-input markup-input"
        type="number"
        placeholder="Введите процент надбавки"
        bind:value={draft.buyerMarkup}
        min="0"
        max="100"
      />
      {#if draft.buyerMarkup}
        <span class="markup-pct-badge">{draft.buyerMarkup}%</span>
      {/if}
    </div>
  </div>

  <!-- Manual budget input -->
  <div class="step-card">
    <div class="step-card-title" style="margin-bottom:6px">Бюджет размещения, ₽</div>
    {#if forecastBudget > 0}
      <div class="forecast-hint">Рекомендованный бюджет: {forecastBudget.toLocaleString('ru-RU')} ₽ — вы можете указать свой</div>
    {/if}
    <input
      class="field-input"
      type="number"
      placeholder={forecastBudget > 0 ? forecastBudget.toLocaleString('ru-RU') : 'Введите бюджет'}
      bind:value={draft.customBudgetTotal}
      min="0"
    />
  </div>

  <!-- Disclaimer -->
  <p class="budget-disclaimer">
    Сумма бюджета по итогам проведения рекламной кампании может отличаться от указанного вами бюджета.
  </p>

  <!-- Budget table -->
  <div class="step-card" style="padding:0;overflow:hidden">
    <table class="budget-table">
      <thead>
        <tr>
          <th class="col-label"></th>
          <th class="col-val">Баер</th>
          <th class="col-val">Клиент</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="row-label">За кампанию</td>
          <td class="row-val">{hasData ? fmt(baer) : '—'}</td>
          <td class="row-val">{hasData ? fmt(clientBase) : '—'}</td>
        </tr>
        <tr>
          <td class="row-label">В сутки</td>
          <td class="row-val">{hasData ? fmtSmart(baerDay) : '—'}</td>
          <td class="row-val">{hasData ? fmtSmart(clientDay) : '—'}</td>
        </tr>
        <tr>
          <td class="row-label">В час</td>
          <td class="row-val">{hasData ? fmtSmart(baerHour) : '—'}</td>
          <td class="row-val">{hasData ? fmtSmart(clientHour) : '—'}</td>
        </tr>

        <!-- Divider row -->
        <tr class="divider-row">
          <td colspan="3"></td>
        </tr>

        <tr class="total-row">
          <td class="row-label">
            Итоговая сумма
            <span class="row-sublabel">Включая НДС</span>
          </td>
          <td class="row-val total-val">{hasData ? fmt(baerTotal) : '—'}</td>
          <td class="row-val total-val">{hasData ? fmt(clientTotal) : '—'}</td>
        </tr>
        <tr>
          <td class="row-label vat-label">НДС 20%</td>
          <td class="row-val vat-val">{hasData ? fmt(baerVat) : '—'}</td>
          <td class="row-val vat-val">{hasData ? fmt(clientVat) : '—'}</td>
        </tr>

        {#if hasData && markupAmt > 0}
          <tr class="earn-row">
            <td colspan="3" class="earn-cell">
              Вы заработаете
              <span class="earn-amount">{fmt(markupAmt)} ₽</span>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>

    {#if !hasData}
      <div class="no-data-hint">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="color:var(--text-muted);flex-shrink:0">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>
        Выберите даты и хотя бы один экран для расчёта прогноза
      </div>
    {/if}
  </div>

  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <button class="btn-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>
</div>

<style>
  .forecast-hint {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .markup-input-wrap {
    position: relative;
  }

  .markup-input {
    width: 100%;
    padding-right: 48px;
  }

  .markup-pct-badge {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 13px;
    font-weight: 600;
    color: var(--navy);
    pointer-events: none;
  }

  .budget-disclaimer {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.55;
    margin: 0 0 16px;
    max-width: 560px;
  }

  /* ── Table ── */
  .budget-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .budget-table thead tr {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .col-label {
    width: 55%;
    padding: 10px 20px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--text-muted);
  }

  .col-val {
    width: 22.5%;
    padding: 10px 20px 10px 0;
    text-align: right;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--text-muted);
  }

  .budget-table tbody tr { border-bottom: 1px solid var(--border); }

  .row-label {
    padding: 12px 20px;
    color: var(--text);
    font-weight: 500;
    font-size: 13px;
    line-height: 1.3;
  }

  .row-sublabel {
    display: block;
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 400;
    margin-top: 2px;
  }

  .row-val {
    padding: 12px 20px 12px 0;
    text-align: right;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  .divider-row td {
    padding: 0;
    height: 6px;
    background: var(--bg);
    border-bottom: none !important;
  }

  .total-row .row-label,
  .total-row .row-val {
    padding-top: 14px;
    padding-bottom: 6px;
  }

  .total-val {
    font-size: 15px;
    font-weight: 700;
    color: var(--navy);
  }

  .vat-label {
    padding-top: 4px;
    padding-bottom: 14px;
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 400;
  }

  .vat-val {
    padding-top: 4px;
    padding-bottom: 14px;
    font-size: 12px;
    color: var(--text-muted);
  }

  /* "Вы заработаете" row */
  .earn-row { border-top: 1px solid var(--border); border-bottom: none !important; }

  .earn-cell {
    padding: 12px 20px;
    font-size: 13px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .earn-amount {
    font-weight: 700;
    color: #16A34A;
    font-size: 14px;
  }

  /* No data hint */
  .no-data-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 20px;
    font-size: 12.5px;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
</style>
