<script>
  import { createEventDispatcher, onMount } from 'svelte'
  const dispatch = createEventDispatcher()

  export let draft
  export let metrics = { impressions: 0, ots: 0, budget: null }

  // ── Init draft fields ─────────────────────────────────────────────────
  if (draft.optimalStrategy   == null) draft.optimalStrategy   = false
  if (draft.limitType         == null) draft.limitType         = 'COUNT'
  if (draft.limitCampaign     == null) draft.limitCampaign     = ''
  if (draft.limitDay          == null) draft.limitDay          = ''
  if (draft.limitHour         == null) draft.limitHour         = ''
  if (draft.limitMinute       == null) draft.limitMinute       = ''
  if (draft.otsLimitCampaign  == null) draft.otsLimitCampaign  = ''
  if (draft.otsLimitDay       == null) draft.otsLimitDay       = ''
  if (draft.otsLimitHour      == null) draft.otsLimitHour      = ''
  if (draft.otsLimitMinute    == null) draft.otsLimitMinute    = ''
  if (draft.interval          == null) draft.interval          = ''
  if (draft.intervalUnit      == null) draft.intervalUnit      = 'SEC'

  // ── Forecast-derived limits ───────────────────────────────────────────
  // Calculate number of campaign days from draft dates
  function numDays() {
    if (!draft.startDate || !draft.endDate) return 1
    const ms = new Date(draft.endDate) - new Date(draft.startDate)
    return Math.max(1, Math.round(ms / 86_400_000) + 1)
  }

  // Forecasted reference values (rounded)
  $: forecastImpressions = Math.round(metrics.impressions || 0)
  $: forecastOts         = Math.round(metrics.ots         || 0)
  $: days                = numDays()

  $: forecastLimits = {
    count: {
      campaign: forecastImpressions,
      day:      Math.round(forecastImpressions / days),
      hour:     Math.round(forecastImpressions / days / 24),
      minute:   Math.round(forecastImpressions / days / 24 / 60),
    },
    ots: {
      campaign: forecastOts,
      day:      Math.round(forecastOts / days),
      hour:     Math.round(forecastOts / days / 24),
      minute:   Math.round(forecastOts / days / 24 / 60),
    },
  }

  // Auto-fill when forecast arrives (only if field is still empty)
  let forecasted = false
  $: if (!forecasted && forecastImpressions > 0) {
    forecasted = true
    if (!draft.limitCampaign)    draft.limitCampaign    = String(forecastLimits.count.campaign)
    if (!draft.limitDay)         draft.limitDay         = String(forecastLimits.count.day)
    if (!draft.limitHour)        draft.limitHour        = String(forecastLimits.count.hour)
    if (!draft.limitMinute)      draft.limitMinute      = String(forecastLimits.count.minute)
    if (!draft.otsLimitCampaign) draft.otsLimitCampaign = String(forecastLimits.ots.campaign)
    if (!draft.otsLimitDay)      draft.otsLimitDay      = String(forecastLimits.ots.day)
    if (!draft.otsLimitHour)     draft.otsLimitHour     = String(forecastLimits.ots.hour)
    if (!draft.otsLimitMinute)   draft.otsLimitMinute   = String(forecastLimits.ots.minute)
  }

  // ── Warning helpers ───────────────────────────────────────────────────
  // Returns true if user value exceeds the forecast reference
  function overLimit(userVal, ref) {
    if (!ref || ref === 0) return false
    const v = Number(userVal)
    return v > 0 && v > ref
  }

  // ── Stepper helpers ───────────────────────────────────────────────────
  function inc(field) {
    const v = Number(draft[field]) || 0
    draft[field] = String(v + 1)
  }
  function dec(field) {
    const v = Number(draft[field]) || 0
    if (v > 0) draft[field] = String(v - 1)
  }
  function incInterval() {
    const v = Number(draft.interval) || 0
    draft.interval = String(v + 1)
  }
  function decInterval() {
    const v = Number(draft.interval) || 0
    if (v > 0) draft.interval = String(v - 1)
  }

  const LIMIT_ROWS = [
    {
      label:      'По кампании',
      countField: 'limitCampaign',   otsField: 'otsLimitCampaign',
      countRef:   () => forecastLimits.count.campaign,
      otsRef:     () => forecastLimits.ots.campaign,
    },
    {
      label:      'В сутки',
      countField: 'limitDay',        otsField: 'otsLimitDay',
      countRef:   () => forecastLimits.count.day,
      otsRef:     () => forecastLimits.ots.day,
    },
    {
      label:      'В час',
      countField: 'limitHour',       otsField: 'otsLimitHour',
      countRef:   () => forecastLimits.count.hour,
      otsRef:     () => forecastLimits.ots.hour,
    },
    {
      label:      'В минуту',
      countField: 'limitMinute',     otsField: 'otsLimitMinute',
      countRef:   () => forecastLimits.count.minute,
      otsRef:     () => forecastLimits.ots.minute,
    },
  ]
</script>

<div class="settings-wrap">

  <!-- ── Interval ─────────────────────────────────────────────────── -->
  <div class="section-card section-card-row">
    <div class="section-title" style="margin-bottom:0;flex-shrink:0">Интервал между показами</div>
    <div class="interval-row">
      <div class="stepper-wrap interval-stepper">
        <button class="stepper-btn" on:click={decInterval} tabindex="-1">−</button>
        <input
          class="stepper-input"
          type="number"
          placeholder="Интервал"
          bind:value={draft.interval}
          min="0"
        />
        <button class="stepper-btn" on:click={incInterval} tabindex="-1">+</button>
      </div>
      <div class="unit-toggle">
        <button
          class="unit-btn"
          class:unit-btn-on={draft.intervalUnit === 'SEC'}
          on:click={() => draft.intervalUnit = 'SEC'}
        >Сек.</button>
        <button
          class="unit-btn"
          class:unit-btn-on={draft.intervalUnit === 'MIN'}
          on:click={() => draft.intervalUnit = 'MIN'}
        >Мин.</button>
      </div>
    </div>
  </div>

  <!-- ── Optimal model ─────────────────────────────────────────────── -->
  <div class="section-card">
    <div class="optimal-header">
      <div class="optimal-text">
        <div class="section-title">Оптимальная модель</div>
        <div class="section-desc">
          Включите оптимальную стратегию, чтобы показы рекламных материалов распределялись равномерно в течение всей кампании.
        </div>
      </div>
      <label class="toggle-switch" title={draft.optimalStrategy ? 'Выключить' : 'Включить'}>
        <input type="checkbox" bind:checked={draft.optimalStrategy} />
        <span class="toggle-track">
          <span class="toggle-thumb"></span>
        </span>
      </label>
    </div>

    {#if !draft.optimalStrategy}
      <!-- ── Limit grid ─────────────────────────────────────────────── -->
      <div class="limit-grid">
        <!-- Header -->
        <div class="lg-head">
          <div class="lg-row-label"></div>
          <div class="lg-col-head">Максимум показов</div>
          <div class="lg-col-head">Максимум OTS</div>
        </div>

        <!-- Rows -->
        {#each LIMIT_ROWS as row}
          {@const countWarn = overLimit(draft[row.countField], row.countRef())}
          {@const otsWarn   = overLimit(draft[row.otsField],   row.otsRef())}
          <div class="lg-row">
            <div class="lg-row-label">{row.label}</div>

            <!-- Count cell -->
            <div class="lg-cell">
              <div class="stepper-wrap stepper-sm" class:stepper-warn={countWarn}>
                <button class="stepper-btn" on:click={() => dec(row.countField)} tabindex="-1">−</button>
                <input
                  class="stepper-input"
                  class:input-warn={countWarn}
                  type="number"
                  min="0"
                  placeholder="—"
                  bind:value={draft[row.countField]}
                />
                <button class="stepper-btn" on:click={() => inc(row.countField)} tabindex="-1">+</button>
              </div>
              {#if countWarn}
                <div class="warn-badge" title="Превышает прогноз: {row.countRef().toLocaleString('ru-RU')}">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                  </svg>
                  {row.countRef().toLocaleString('ru-RU')}
                </div>
              {:else if row.countRef() > 0}
                <div class="forecast-hint">{row.countRef().toLocaleString('ru-RU')}</div>
              {/if}
            </div>

            <!-- OTS cell -->
            <div class="lg-cell">
              <div class="stepper-wrap stepper-sm" class:stepper-warn={otsWarn}>
                <button class="stepper-btn" on:click={() => dec(row.otsField)} tabindex="-1">−</button>
                <input
                  class="stepper-input"
                  class:input-warn={otsWarn}
                  type="number"
                  min="0"
                  placeholder="—"
                  bind:value={draft[row.otsField]}
                />
                <button class="stepper-btn" on:click={() => inc(row.otsField)} tabindex="-1">+</button>
              </div>
              {#if otsWarn}
                <div class="warn-badge" title="Превышает прогноз: {row.otsRef().toLocaleString('ru-RU')}">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                  </svg>
                  {row.otsRef().toLocaleString('ru-RU')}
                </div>
              {:else if row.otsRef() > 0}
                <div class="forecast-hint">{row.otsRef().toLocaleString('ru-RU')}</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Forecast note -->
      {#if forecastImpressions > 0}
        <div class="forecast-note">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0;margin-top:1px">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
          Значения рассчитаны на основе прогноза для {days} {days === 1 ? 'дня' : days < 5 ? 'дней' : 'дней'} кампании ({forecastImpressions.toLocaleString('ru-RU')} показов / {forecastOts.toLocaleString('ru-RU')} OTS). Вы можете изменить их вручную.
        </div>
      {/if}
    {/if}
  </div>

  <!-- ── Bottom nav ────────────────────────────────────────────────── -->
  <div class="bottom-nav">
    <button class="nav-link" on:click={() => dispatch('back')}>Назад</button>
    <div class="nav-pills">
      <button class="nav-pill nav-pill-blue" on:click={() => dispatch('back')}>← График показов</button>
      <button class="nav-pill nav-pill-blue" on:click={() => dispatch('next')}>Рекламные материалы и таргетинг →</button>
    </div>
    <button class="btn-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>

</div>

<style>
  .settings-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 28px 20px;
    max-width: 860px;
    margin: 0 auto;
    height: 100%;
    box-sizing: border-box;
  }

  /* ── Section card ── */
  .section-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 18px;
  }
  /* Interval card: single row layout */
  .section-card-row {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--navy, #112853);
    margin-bottom: 3px;
  }

  .section-desc {
    font-size: 12px;
    color: var(--text-muted, #64748B);
    line-height: 1.45;
    margin-bottom: 0;
  }

  /* ── Interval ── */
  .interval-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .interval-stepper {
    width: 200px;
    flex: none !important;
  }

  /* ── Stepper ── */
  .stepper-wrap {
    display: flex;
    align-items: center;
    border: 1.5px solid #CBD5E1;
    border-radius: 7px;
    overflow: hidden;
    height: 32px;
    flex: 1;
    transition: border-color .15s;
  }
  .stepper-sm { flex: 1; }
  .stepper-warn { border-color: #F59E0B !important; }

  .stepper-btn {
    width: 28px;
    height: 100%;
    border: none;
    background: #F8FAFC;
    color: #475569;
    font-size: 15px;
    font-weight: 400;
    cursor: pointer;
    flex-shrink: 0;
    transition: background .1s, color .1s;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1.5px solid #E2E8F0;
  }
  .stepper-btn:last-child {
    border-right: none;
    border-left: 1.5px solid #E2E8F0;
  }
  .stepper-btn:hover { background: #E2E8F0; color: var(--navy, #112853); }

  .stepper-input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    outline: none;
    text-align: center;
    font-size: 13px;
    font-family: inherit;
    color: var(--navy, #112853);
    background: white;
    padding: 0 2px;
    transition: background .15s;
  }
  .stepper-input.input-warn { background: #FFFBEB; color: #92400E; }
  .stepper-input::placeholder { color: #94A3B8; font-size: 12px; }
  .stepper-input::-webkit-inner-spin-button,
  .stepper-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .stepper-input[type=number] { -moz-appearance: textfield; }

  /* ── Unit toggle ── */
  .unit-toggle {
    display: flex;
    border: 1.5px solid #CBD5E1;
    border-radius: 7px;
    overflow: hidden;
    height: 32px;
    flex-shrink: 0;
  }
  .unit-btn {
    height: 100%;
    padding: 0 14px;
    border: none;
    background: white;
    font-size: 12.5px;
    font-family: inherit;
    font-weight: 500;
    color: #64748B;
    cursor: pointer;
    transition: background .1s, color .1s;
    white-space: nowrap;
  }
  .unit-btn + .unit-btn { border-left: 1.5px solid #E2E8F0; }
  .unit-btn-on {
    background: var(--navy, #112853);
    color: white;
  }

  /* ── Optimal header ── */
  .optimal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .optimal-text { flex: 1; }

  /* ── Toggle switch ── */
  .toggle-switch {
    position: relative;
    flex-shrink: 0;
    cursor: pointer;
  }
  .toggle-switch input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .toggle-track {
    display: block;
    width: 38px;
    height: 21px;
    background: #CBD5E1;
    border-radius: 11px;
    position: relative;
    transition: background .15s;
  }
  .toggle-switch input:checked + .toggle-track {
    background: #2563EB;
  }
  .toggle-thumb {
    position: absolute;
    top: 2.5px;
    left: 2.5px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
    transition: left .15s;
  }
  .toggle-switch input:checked + .toggle-track .toggle-thumb {
    left: 19.5px;
  }

  /* ── Limit grid ── */
  .limit-grid {
    margin-top: 12px;
    border: 1.5px solid #E2E8F0;
    border-radius: 8px;
    overflow: hidden;
  }

  .lg-head {
    display: flex;
    align-items: center;
    background: #F8FAFC;
    border-bottom: 1.5px solid #E2E8F0;
    padding: 7px 12px;
    gap: 12px;
  }
  .lg-col-head {
    flex: 1;
    font-size: 11.5px;
    font-weight: 600;
    color: #64748B;
    text-align: center;
  }

  .lg-row {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    gap: 12px;
    border-bottom: 1px solid #F1F5F9;
  }
  .lg-row:last-child { border-bottom: none; }

  .lg-row-label {
    width: 90px;
    flex-shrink: 0;
    font-size: 12.5px;
    font-weight: 500;
    color: #334155;
  }
  .lg-head .lg-row-label { width: 90px; flex-shrink: 0; }

  .lg-cell {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .lg-cell .stepper-wrap { flex: 1; }

  /* ── Forecast hint / warning — inline beside stepper ── */
  .forecast-hint {
    font-size: 11px;
    color: #B0BAC9;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 28px;
  }

  .warn-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: #B45309;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: default;
  }

  /* ── Forecast note ── */
  .forecast-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 10px;
    padding: 8px 10px;
    background: #EFF6FF;
    border: 1px solid #BFDBFE;
    border-radius: 7px;
    font-size: 11px;
    color: #1E40AF;
    line-height: 1.45;
  }

  /* ── Bottom nav ── */
  .bottom-nav {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 4px;
    margin-top: auto;
  }

  .nav-link {
    background: none;
    border: none;
    font-size: 13px;
    font-weight: 500;
    color: #64748B;
    cursor: pointer;
    padding: 0;
    transition: color .12s;
    white-space: nowrap;
  }
  .nav-link:hover { color: var(--navy, #112853); }
  .nav-link-next { margin-left: auto; }

  .nav-pills {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: center;
  }

  .nav-pill {
    height: 32px;
    padding: 0 16px;
    border-radius: 20px;
    border: none;
    font-size: 12.5px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background .12s, color .12s;
  }
  .nav-pill-blue {
    background: #DBEAFE;
    color: #2563EB;
  }
  .nav-pill-blue:hover {
    background: #BFDBFE;
    color: #1D4ED8;
  }
</style>
