<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()
  export let draft

  // Real API shape: photoReportSettings: { saveAll, countPerDisplay, saveMode, explicitlySetPhoto }
  // saveMode: 'BY_CAMPAIGN' | 'BY_DAY'
  if (!draft.photoReportSettings) {
    draft.photoReportSettings = {
      saveAll:           false,
      explicitlySetPhoto: false,
      countPerDisplay:   5,
      saveMode:          'BY_CAMPAIGN',
    }
  }

  function set(field, val) {
    draft.photoReportSettings = { ...draft.photoReportSettings, [field]: val }
  }
</script>

<div class="step-content">
  <h1 class="step-title">Фотоотчёты</h1>

  <!-- Card 1: Save all photo reports -->
  <div class="step-card">
    <div class="ph-card-header">
      <div class="ph-card-info">
        <span class="ph-card-title">Сохранить все фотоотчёты</span>
        <span class="ph-card-desc">Все фотоотчёты по кампании будут сохранены и доступны в личном кабинете</span>
      </div>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <button
        class="ph-toggle {draft.photoReportSettings.saveAll ? 'ph-toggle--on' : ''}"
        on:click={() => set('saveAll', !draft.photoReportSettings.saveAll)}
        role="switch"
        aria-checked={draft.photoReportSettings.saveAll}
      >
        <span class="ph-toggle-knob" />
      </button>
    </div>
  </div>

  <!-- Card 2: Custom photo settings -->
  <div class="step-card">
    <div class="ph-card-header">
      <div class="ph-card-info">
        <span class="ph-card-title">Настроить параметры фотоотчётов</span>
        <span class="ph-card-desc">Укажите количество фото на экран и режим предоставления</span>
      </div>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <button
        class="ph-toggle {draft.photoReportSettings.explicitlySetPhoto ? 'ph-toggle--on' : ''}"
        on:click={() => set('explicitlySetPhoto', !draft.photoReportSettings.explicitlySetPhoto)}
        role="switch"
        aria-checked={draft.photoReportSettings.explicitlySetPhoto}
      >
        <span class="ph-toggle-knob" />
      </button>
    </div>

    {#if draft.photoReportSettings.explicitlySetPhoto}
      <div class="ph-card-body">

        <!-- Count per display -->
        <div class="ph-section">
          <span class="ph-field-label">Количество фото на экран</span>
          <div class="ph-days-row">
            <button class="ph-days-btn"
              on:click={() => set('countPerDisplay', Math.max(1, draft.photoReportSettings.countPerDisplay - 1))}>−</button>
            <span class="ph-days-val">{draft.photoReportSettings.countPerDisplay}</span>
            <button class="ph-days-btn"
              on:click={() => set('countPerDisplay', draft.photoReportSettings.countPerDisplay + 1)}>+</button>
          </div>
        </div>

        <!-- Save mode -->
        <div class="ph-section">
          <span class="ph-field-label">Режим предоставления</span>
          <div class="ph-radio-group">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <label class="ph-radio-row" on:click={() => set('saveMode', 'BY_CAMPAIGN')}>
              <span class="ph-radio {draft.photoReportSettings.saveMode === 'BY_CAMPAIGN' ? 'ph-radio--on' : ''}">
                {#if draft.photoReportSettings.saveMode === 'BY_CAMPAIGN'}<span class="ph-radio-dot" />{/if}
              </span>
              <span class="ph-radio-label">За кампанию</span>
            </label>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <label class="ph-radio-row" on:click={() => set('saveMode', 'BY_DAY')}>
              <span class="ph-radio {draft.photoReportSettings.saveMode === 'BY_DAY' ? 'ph-radio--on' : ''}">
                {#if draft.photoReportSettings.saveMode === 'BY_DAY'}<span class="ph-radio-dot" />{/if}
              </span>
              <span class="ph-radio-label">Ежедневно</span>
            </label>
          </div>
        </div>

      </div>
    {/if}
  </div>

  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <button class="btn-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>
</div>

<style>
  .ph-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .ph-card-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .ph-card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text, #111827);
  }
  .ph-card-desc {
    font-size: 13px;
    color: var(--text-muted, #6b7280);
    line-height: 1.45;
  }

  /* Toggle */
  .ph-toggle {
    flex-shrink: 0;
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: #d1d5db;
    border: none;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
    padding: 0;
  }
  .ph-toggle--on { background: var(--accent, #6366f1); }
  .ph-toggle-knob {
    position: absolute;
    top: 3px; left: 3px;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    transition: left 0.2s;
  }
  .ph-toggle--on .ph-toggle-knob { left: 23px; }

  /* Body */
  .ph-card-body {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    border-top: 1px solid var(--border, #e5e7eb);
    padding-top: 20px;
  }
  .ph-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ph-field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Days stepper */
  .ph-days-row {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    overflow: hidden;
  }
  .ph-days-btn {
    width: 32px; height: 32px;
    border: none;
    background: var(--bg-muted, #f3f4f6);
    cursor: pointer;
    font-size: 18px;
    color: var(--text-muted, #6b7280);
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
  }
  .ph-days-btn:hover { background: #e5e7eb; }
  .ph-days-val {
    min-width: 44px;
    text-align: center;
    font-size: 15px;
    font-weight: 600;
    color: var(--text, #111827);
    padding: 0 6px;
  }

  /* Radio */
  .ph-radio-group { display: flex; flex-direction: column; gap: 10px; }
  .ph-radio-row {
    display: flex; align-items: center; gap: 10px;
    cursor: pointer; user-select: none;
  }
  .ph-radio {
    flex-shrink: 0;
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 2px solid #d1d5db;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.15s;
  }
  .ph-radio--on { border-color: var(--accent, #6366f1); }
  .ph-radio-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--accent, #6366f1);
  }
  .ph-radio-label { font-size: 14px; color: var(--text, #111827); }
</style>
