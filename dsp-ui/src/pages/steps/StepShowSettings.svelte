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
    <div class="section-title mb0">Интервал между показами</div>
    <div class="interval-row">
      <div class="num-wrap">
        <button class="nb" on:click={decInterval} tabindex="-1">−</button>
        <input class="ni" type="number" placeholder="0" bind:value={draft.interval} min="0" />
        <button class="nb" on:click={incInterval} tabindex="-1">+</button>
      </div>
      <div class="unit-toggle">
        <button class="unit-btn" class:unit-btn-on={draft.intervalUnit === 'SEC'}
          on:click={() => draft.intervalUnit = 'SEC'}>Сек.</button>
        <button class="unit-btn" class:unit-btn-on={draft.intervalUnit === 'MIN'}
          on:click={() => draft.intervalUnit = 'MIN'}>Мин.</button>
      </div>
    </div>
  </div>

  <!-- ── Optimal model ─────────────────────────────────────────────── -->
  <div class="section-card">
    <div class="optimal-header">
      <div class="optimal-text">
        <div class="section-title mb0">Оптимальная модель</div>
        <div class="section-desc">Равномерно распределяет показы на протяжении всей кампании</div>
      </div>
      <label class="toggle-switch" title={draft.optimalStrategy ? 'Выключить' : 'Включить'}>
        <input type="checkbox" bind:checked={draft.optimalStrategy} />
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
    </div>

    {#if !draft.optimalStrategy}
      <!-- ── Limit grid ─────────────────────────────────────────────── -->
      <div class="lt">
        <!-- Header -->
        <div class="lt-head">
          <div class="lt-label"></div>
          <div class="lt-col-head">Максимум показов</div>
          <div class="lt-col-head">Максимум OTS</div>
        </div>

        <!-- Rows -->
        {#each LIMIT_ROWS as row}
          {@const countWarn = overLimit(draft[row.countField], row.countRef())}
          {@const otsWarn   = overLimit(draft[row.otsField],   row.otsRef())}
          <div class="lt-row">
            <div class="lt-label">{row.label}</div>

            <!-- Count cell -->
            <div class="lt-cell">
              <div class="num-wrap" class:num-warn={countWarn}>
                <button class="nb" on:click={() => dec(row.countField)} tabindex="-1">−</button>
                <input class="ni" class:ni-warn={countWarn} type="number" min="0"
                  placeholder={row.countRef() > 0 ? row.countRef() : '0'}
                  bind:value={draft[row.countField]} />
                <button class="nb" on:click={() => inc(row.countField)} tabindex="-1">+</button>
              </div>
              {#if countWarn}
                <span class="warn-badge" title="Превышает прогноз: {row.countRef().toLocaleString('ru-RU')}">
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                  &gt;{row.countRef().toLocaleString('ru-RU')}
                </span>
              {:else if row.countRef() > 0}
                <span class="forecast-hint">{row.countRef().toLocaleString('ru-RU')}</span>
              {/if}
            </div>

            <!-- OTS cell -->
            <div class="lt-cell">
              <div class="num-wrap" class:num-warn={otsWarn}>
                <button class="nb" on:click={() => dec(row.otsField)} tabindex="-1">−</button>
                <input class="ni" class:ni-warn={otsWarn} type="number" min="0"
                  placeholder={row.otsRef() > 0 ? row.otsRef() : '0'}
                  bind:value={draft[row.otsField]} />
                <button class="nb" on:click={() => inc(row.otsField)} tabindex="-1">+</button>
              </div>
              {#if otsWarn}
                <span class="warn-badge" title="Превышает прогноз: {row.otsRef().toLocaleString('ru-RU')}">
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                  &gt;{row.otsRef().toLocaleString('ru-RU')}
                </span>
              {:else if row.otsRef() > 0}
                <span class="forecast-hint">{row.otsRef().toLocaleString('ru-RU')}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Forecast note -->
      {#if forecastImpressions > 0}
        <div class="forecast-note">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0;margin-top:1px">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
          Прогноз для {days} {days === 1 ? 'дня' : 'дней'}: {forecastImpressions.toLocaleString('ru-RU')} показов · {forecastOts.toLocaleString('ru-RU')} OTS. Значения рассчитаны автоматически, вы можете изменить их вручную.
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
    padding: 20px 28px;
    max-width: 760px;
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
  .section-card-row {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .mb0 { margin-bottom: 0; }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--navy, #112853);
    margin-bottom: 2px;
  }
  .section-desc {
    font-size: 12px;
    color: var(--text-muted, #64748B);
    line-height: 1.4;
  }

  /* ── Compact number input ── */
  .num-wrap {
    display: inline-flex;
    align-items: center;
    border: 1.5px solid #CBD5E1;
    border-radius: 7px;
    overflow: hidden;
    height: 30px;
    background: white;
    transition: border-color .15s;
  }
  .num-wrap:focus-within { border-color: var(--navy, #112853); }
  .num-wrap.num-warn { border-color: #F59E0B; }

  .nb {
    width: 26px;
    height: 100%;
    border: none;
    background: none;
    color: #94A3B8;
    font-size: 16px;
    font-weight: 300;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color .1s, background .1s;
    padding: 0;
    font-family: inherit;
  }
  .nb:first-child { border-right: 1px solid #E2E8F0; }
  .nb:last-child  { border-left:  1px solid #E2E8F0; }
  .nb:hover { color: var(--navy, #112853); background: #F1F5F9; }

  .ni {
    width: 72px;
    text-align: center;
    border: none;
    outline: none;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    color: var(--navy, #112853);
    background: transparent;
    padding: 0 2px;
  }
  .ni.ni-warn { color: #92400E; }
  .ni::placeholder { color: #CBD5E1; font-weight: 400; }
  .ni::-webkit-inner-spin-button,
  .ni::-webkit-outer-spin-button { -webkit-appearance: none; }
  .ni[type=number] { -moz-appearance: textfield; }

  /* ── Interval row ── */
  .interval-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  /* ── Unit toggle ── */
  .unit-toggle {
    display: flex;
    border: 1.5px solid #CBD5E1;
    border-radius: 7px;
    overflow: hidden;
    height: 30px;
  }
  .unit-btn {
    height: 100%;
    padding: 0 13px;
    border: none;
    background: white;
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    color: #64748B;
    cursor: pointer;
    transition: background .1s, color .1s;
  }
  .unit-btn + .unit-btn { border-left: 1.5px solid #E2E8F0; }
  .unit-btn-on { background: var(--navy, #112853); color: white; }

  /* ── Optimal header ── */
  .optimal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .optimal-text { flex: 1; }

  /* ── Toggle switch ── */
  .toggle-switch { position: relative; flex-shrink: 0; cursor: pointer; }
  .toggle-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
  .toggle-track {
    display: block;
    width: 36px;
    height: 20px;
    background: #CBD5E1;
    border-radius: 10px;
    position: relative;
    transition: background .15s;
  }
  .toggle-switch input:checked + .toggle-track { background: #2563EB; }
  .toggle-thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 16px; height: 16px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
    transition: left .15s;
  }
  .toggle-switch input:checked + .toggle-track .toggle-thumb { left: 18px; }

  /* ── Limit table ── */
  .lt {
    margin-top: 14px;
    border-top: 1px solid #F1F5F9;
  }
  .lt-head {
    display: flex;
    align-items: center;
    padding: 6px 0 6px;
    gap: 8px;
  }
  .lt-col-head {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    color: #94A3B8;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .lt-row {
    display: flex;
    align-items: center;
    padding: 5px 0;
    gap: 8px;
    border-top: 1px solid #F8FAFC;
  }
  .lt-label {
    width: 88px;
    flex-shrink: 0;
    font-size: 12.5px;
    color: #475569;
  }
  .lt-cell {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  /* ── Forecast hint / warning ── */
  .forecast-hint {
    font-size: 11px;
    color: #CBD5E1;
    font-weight: 500;
    white-space: nowrap;
    min-width: 24px;
  }
  .warn-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: #D97706;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
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
    line-height: 1.5;
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
  .nav-pill-blue { background: #DBEAFE; color: #2563EB; }
  .nav-pill-blue:hover { background: #BFDBFE; color: #1D4ED8; }
</style>
