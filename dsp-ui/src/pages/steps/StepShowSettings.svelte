<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()
  export let draft

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
    { label: 'По кампании', countField: 'limitCampaign',  otsField: 'otsLimitCampaign' },
    { label: 'В сутки',     countField: 'limitDay',       otsField: 'otsLimitDay'      },
    { label: 'В час',       countField: 'limitHour',      otsField: 'otsLimitHour'     },
    { label: 'В минуту',    countField: 'limitMinute',    otsField: 'otsLimitMinute'   },
  ]
</script>

<div class="settings-wrap">

  <!-- ── Interval ─────────────────────────────────────────────────── -->
  <div class="section-card">
    <div class="section-title">Интервал между показами</div>
    <div class="interval-row">
      <div class="stepper-wrap">
        <button class="stepper-btn" on:click={decInterval} tabindex="-1">−</button>
        <input
          class="stepper-input"
          type="number"
          placeholder="Ввести интервал"
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
      <div>
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
          <div class="lg-row">
            <div class="lg-row-label">{row.label}</div>

            <!-- Count cell -->
            <div class="lg-cell">
              <div class="stepper-wrap stepper-sm">
                <button class="stepper-btn" on:click={() => dec(row.countField)} tabindex="-1">−</button>
                <input
                  class="stepper-input"
                  type="number"
                  min="0"
                  placeholder="—"
                  bind:value={draft[row.countField]}
                />
                <button class="stepper-btn" on:click={() => inc(row.countField)} tabindex="-1">+</button>
              </div>
            </div>

            <!-- OTS cell -->
            <div class="lg-cell">
              <div class="stepper-wrap stepper-sm">
                <button class="stepper-btn" on:click={() => dec(row.otsField)} tabindex="-1">−</button>
                <input
                  class="stepper-input"
                  type="number"
                  min="0"
                  placeholder="—"
                  bind:value={draft[row.otsField]}
                />
                <button class="stepper-btn" on:click={() => inc(row.otsField)} tabindex="-1">+</button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Bottom nav ────────────────────────────────────────────────── -->
  <div class="bottom-nav">
    <button class="nav-link" on:click={() => dispatch('back')}>Назад</button>
    <div class="nav-pills">
      <button class="nav-pill nav-pill-blue" on:click={() => dispatch('back')}>← График показов</button>
      <button class="nav-pill nav-pill-blue" on:click={() => dispatch('next')}>Рекламные материалы и таргетинг →</button>
    </div>
    <button class="nav-link nav-link-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>

</div>

<style>
  .settings-wrap {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 28px 32px 24px;
    max-width: 900px;
    margin: 0 auto;
    height: 100%;
    box-sizing: border-box;
  }

  /* ── Section card ── */
  .section-card {
    background: white;
    border: 1.5px solid #E2E8F0;
    border-radius: 12px;
    padding: 20px 24px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--navy, #112853);
    margin-bottom: 4px;
  }

  .section-desc {
    font-size: 12.5px;
    color: var(--text-muted, #64748B);
    line-height: 1.5;
    margin-bottom: 14px;
  }

  /* ── Interval ── */
  .interval-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* ── Stepper ── */
  .stepper-wrap {
    display: flex;
    align-items: center;
    border: 1.5px solid #CBD5E1;
    border-radius: 8px;
    overflow: hidden;
    height: 36px;
    flex: 1;
  }
  .stepper-sm { flex: 1; }

  .stepper-btn {
    width: 34px;
    height: 100%;
    border: none;
    background: #F8FAFC;
    color: #475569;
    font-size: 16px;
    font-weight: 500;
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
    padding: 0 4px;
  }
  .stepper-input::placeholder { color: #94A3B8; }
  /* hide native number spinners */
  .stepper-input::-webkit-inner-spin-button,
  .stepper-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .stepper-input[type=number] { -moz-appearance: textfield; }

  /* ── Unit toggle ── */
  .unit-toggle {
    display: flex;
    border: 1.5px solid #CBD5E1;
    border-radius: 8px;
    overflow: hidden;
    height: 36px;
    flex-shrink: 0;
  }
  .unit-btn {
    height: 100%;
    padding: 0 16px;
    border: none;
    background: white;
    font-size: 13px;
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
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  /* ── Toggle switch ── */
  .toggle-switch {
    position: relative;
    flex-shrink: 0;
    margin-top: 2px;
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
    width: 44px;
    height: 24px;
    background: #CBD5E1;
    border-radius: 12px;
    position: relative;
    transition: background .15s;
  }
  .toggle-switch input:checked + .toggle-track {
    background: #2563EB;
  }
  .toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
    transition: left .15s;
  }
  .toggle-switch input:checked + .toggle-track .toggle-thumb {
    left: 23px;
  }

  /* ── Limit grid ── */
  .limit-grid {
    margin-top: 18px;
    border: 1.5px solid #E2E8F0;
    border-radius: 10px;
    overflow: hidden;
  }

  .lg-head {
    display: flex;
    align-items: center;
    background: #F8FAFC;
    border-bottom: 1.5px solid #E2E8F0;
    padding: 10px 16px;
    gap: 12px;
  }
  .lg-col-head {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: #64748B;
    text-align: center;
  }

  .lg-row {
    display: flex;
    align-items: center;
    padding: 10px 16px;
    gap: 12px;
    border-bottom: 1.5px solid #F1F5F9;
  }
  .lg-row:last-child { border-bottom: none; }
  .lg-row:hover { background: #FAFBFC; }

  .lg-row-label {
    width: 120px;
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 500;
    color: #334155;
  }
  .lg-head .lg-row-label {
    width: 120px;
    flex-shrink: 0;
  }

  .lg-cell {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
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
  .nav-link-next {
    margin-left: auto;
  }

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
