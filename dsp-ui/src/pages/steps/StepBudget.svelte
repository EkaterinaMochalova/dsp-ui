<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()
  export let draft
  export let metrics

  // Баер = manual input OR forecast (manual takes priority)
  $: forecastBudget = metrics.budget ?? 0
  $: customBudget   = Number(draft.customBudgetTotal) || 0
  $: baer = customBudget || forecastBudget

  // Warn when user's budget exceeds what the selected screens can deliver
  $: capacityExceeded = customBudget > 0 && forecastBudget > 0 && customBudget > forecastBudget
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

  // Totals incl. VAT 22%
  $: baerTotal   = baer * 1.22
  $: baerVat     = baer * 0.22
  $: clientTotal = baerTotal + markupAmt
  $: clientVat   = clientBase * 0.22

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

  <!-- Надбавка баера + Бюджет — compact inline row -->
  <div class="step-card budget-top-row">
    <!-- Надбавка баера -->
    <div class="budget-field">
      <div class="budget-field-label">Надбавка баера</div>
      <div class="markup-input-wrap">
        <input
          class="field-input markup-input"
          type="number"
          placeholder="0"
          bind:value={draft.buyerMarkup}
          min="0"
          max="100"
        />
        <span class="markup-pct-badge">{draft.buyerMarkup ? draft.buyerMarkup + '%' : '%'}</span>
      </div>
    </div>

    <div class="budget-divider"></div>

    <!-- Бюджет размещения -->
    <div class="budget-field budget-field-grow">
      <div class="budget-field-label">
        Бюджет размещения, ₽
        {#if forecastBudget > 0}
          <span class="forecast-hint-inline">рекомендовано: {forecastBudget.toLocaleString('ru-RU')} ₽</span>
        {/if}
      </div>
      <input
        class="field-input"
        type="number"
        placeholder={forecastBudget > 0 ? forecastBudget.toLocaleString('ru-RU') : 'Введите бюджет'}
        bind:value={draft.customBudgetTotal}
        min="0"
      />
    </div>
  </div>

  {#if capacityExceeded}
    <div class="capacity-warning">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0;margin-top:1px">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <span>
        Ёмкость выбранных экранов не позволяет реализовать бюджет {customBudget.toLocaleString('ru-RU')} ₽.
        Максимальный реализуемый бюджет: <strong>{forecastBudget.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</strong>.
      </span>
    </div>
  {/if}

  <!-- Disclaimer -->
  <p class="budget-disclaimer">
    Сумма бюджета по итогам проведения рекламной кампании может отличаться от указанного вами бюджета.
  </p>

  <!-- Budget table -->
  <div class="budget-card">
    <table class="budget-table">
      <colgroup>
        <col class="col-label-w" />
        <col class="col-val-w" />
        <col class="col-val-w" />
      </colgroup>
      <thead>
        <tr class="bt-head-row">
          <th class="bt-th bt-th-label"></th>
          <th class="bt-th bt-th-val">Баер</th>
          <th class="bt-th bt-th-val">Клиент</th>
        </tr>
      </thead>
      <tbody>
        <tr class="bt-row">
          <td class="bt-label">За кампанию</td>
          <td class="bt-val">{hasData ? fmt(baer) : '—'}</td>
          <td class="bt-val">{hasData ? fmt(clientBase) : '—'}</td>
        </tr>
        <tr class="bt-row">
          <td class="bt-label">В сутки</td>
          <td class="bt-val">{hasData ? fmtSmart(baerDay) : '—'}</td>
          <td class="bt-val">{hasData ? fmtSmart(clientDay) : '—'}</td>
        </tr>
        <tr class="bt-row">
          <td class="bt-label">В час</td>
          <td class="bt-val">{hasData ? fmtSmart(baerHour) : '—'}</td>
          <td class="bt-val">{hasData ? fmtSmart(clientHour) : '—'}</td>
        </tr>

        <tr class="bt-spacer"><td colspan="3"></td></tr>

        <tr class="bt-row bt-total-row">
          <td class="bt-label">
            Итоговая сумма
            <span class="bt-sublabel">Включая НДС</span>
          </td>
          <td class="bt-val bt-total-val">{hasData ? fmt(baerTotal) : '—'}</td>
          <td class="bt-val bt-total-val">{hasData ? fmt(clientTotal) : '—'}</td>
        </tr>
        <tr class="bt-row bt-vat-row">
          <td class="bt-label bt-vat-label">НДС 22%</td>
          <td class="bt-val bt-vat-val">{hasData ? fmt(baerVat) : '—'}</td>
          <td class="bt-val bt-vat-val">{hasData ? fmt(clientVat) : '—'}</td>
        </tr>

        {#if hasData && markupAmt > 0}
          <tr class="bt-earn-row">
            <td colspan="3" class="bt-earn-cell">
              Вы заработаете
              <span class="bt-earn-amount">{fmt(markupAmt)} ₽</span>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>

    {#if !hasData}
      <div class="no-data-hint">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0">
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
  /* ── Compact top row ── */
  .budget-top-row {
    display: flex;
    align-items: flex-end;
    gap: 0;
    padding: 16px 20px;
  }

  .budget-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex-shrink: 0;
    width: 200px;
  }

  .budget-field-grow {
    flex: 1;
    width: auto;
  }

  .budget-field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .forecast-hint-inline {
    font-size: 11px;
    font-weight: 400;
    color: #94A3B8;
  }

  .budget-divider {
    width: 1px;
    background: var(--border);
    align-self: stretch;
    margin: 0 20px;
    flex-shrink: 0;
  }

  .capacity-warning {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 16px;
    padding: 10px 14px;
    background: #FEF3C7;
    border: 1px solid #F59E0B;
    border-radius: 8px;
    font-size: 13px;
    color: #92400E;
    line-height: 1.45;
  }

  .capacity-warning strong {
    font-weight: 700;
    color: #78350F;
  }

  .markup-input-wrap {
    position: relative;
  }

  .markup-input {
    width: 100%;
    padding-right: 40px;
  }

  .markup-pct-badge {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
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

  /* ── Budget card ── */
  .budget-card {
    background: white;
    border: 1.5px solid #E2E8F0;
    border-radius: 12px;
    overflow: hidden;
    max-width: 600px;
    width: 100%;
  }

  /* ── Table ── */
  .budget-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    table-layout: fixed;
  }

  .col-label-w { width: auto; }
  .col-val-w   { width: 160px; }

  /* Head */
  .bt-head-row {
    background: #F8FAFC;
    border-bottom: 1.5px solid #E2E8F0;
  }
  .bt-th {
    padding: 9px 20px;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #94A3B8;
  }
  .bt-th-label { text-align: left; }
  .bt-th-val   { text-align: right; }

  /* Body rows */
  .bt-row { border-bottom: 1px solid #F1F5F9; }
  .bt-row:last-child { border-bottom: none; }

  .bt-label {
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    color: #334155;
    line-height: 1.35;
  }

  .bt-sublabel {
    display: block;
    font-size: 10.5px;
    color: #94A3B8;
    font-weight: 400;
    margin-top: 1px;
  }

  .bt-val {
    padding: 10px 20px 10px 0;
    text-align: right;
    color: #334155;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    font-size: 13px;
  }

  /* Spacer between body rows and totals */
  .bt-spacer td {
    padding: 0;
    height: 4px;
    background: #F8FAFC;
    border-bottom: 1.5px solid #E2E8F0 !important;
  }

  /* Total row */
  .bt-total-row .bt-label { padding-top: 12px; padding-bottom: 2px; }
  .bt-total-row .bt-val   { padding-top: 12px; padding-bottom: 2px; }
  .bt-total-val {
    font-size: 15px;
    font-weight: 700;
    color: var(--navy, #112853);
  }

  /* VAT row */
  .bt-vat-row .bt-label,
  .bt-vat-row .bt-val { border-bottom: none; }
  .bt-vat-label {
    padding-top: 2px;
    padding-bottom: 12px;
    font-size: 11.5px;
    color: #94A3B8;
    font-weight: 400;
  }
  .bt-vat-val {
    padding-top: 2px;
    padding-bottom: 12px;
    font-size: 11.5px;
    color: #94A3B8;
  }

  /* "Вы заработаете" row */
  .bt-earn-row { background: #F0FDF4; border-top: 1.5px solid #BBF7D0; }
  .bt-earn-cell {
    padding: 10px 20px;
    font-size: 12.5px;
    color: #166534;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bt-earn-amount {
    font-weight: 700;
    color: #15803D;
    font-size: 14px;
    margin-left: 2px;
  }

  /* No data hint */
  .no-data-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    font-size: 12px;
    color: #94A3B8;
    background: #F8FAFC;
  }
</style>
