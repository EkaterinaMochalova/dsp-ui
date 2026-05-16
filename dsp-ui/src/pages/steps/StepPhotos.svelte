<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()
  export let draft

  // Init photo reports object on draft
  if (!draft.photoReports) {
    draft.photoReports = {
      saveAll: false,
      selectByCountry: false,
      period: 'campaign',   // 'campaign' | 'custom'
      days: 5,
      showSummary: false,
      showSchedule: false,
    }
  }

  function set(field, val) {
    draft.photoReports = { ...draft.photoReports, [field]: val }
  }

  // Derived count hint — rough estimate: 1 photo per screen per day capped at 10
  $: countHint = Math.min(
    (draft.screenIds?.length ?? 0) * draft.photoReports.days,
    (draft.screenIds?.length ?? 0) * 10
  )
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
        class="ph-toggle {draft.photoReports.saveAll ? 'ph-toggle--on' : ''}"
        on:click={() => set('saveAll', !draft.photoReports.saveAll)}
        role="switch"
        aria-checked={draft.photoReports.saveAll}
      >
        <span class="ph-toggle-knob" />
      </button>
    </div>
  </div>

  <!-- Card 2: Select photos by country -->
  <div class="step-card">
    <div class="ph-card-header">
      <div class="ph-card-info">
        <span class="ph-card-title">Выбрать фото для страны</span>
        <span class="ph-card-desc">Выберите количество фотоотчётов и период их предоставления</span>
      </div>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <button
        class="ph-toggle {draft.photoReports.selectByCountry ? 'ph-toggle--on' : ''}"
        on:click={() => set('selectByCountry', !draft.photoReports.selectByCountry)}
        role="switch"
        aria-checked={draft.photoReports.selectByCountry}
      >
        <span class="ph-toggle-knob" />
      </button>
    </div>

    {#if draft.photoReports.selectByCountry}
      <div class="ph-card-body">
        <!-- Period radios -->
        <div class="ph-section">
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <label class="ph-radio-row" on:click={() => set('period', 'campaign')}>
            <span class="ph-radio {draft.photoReports.period === 'campaign' ? 'ph-radio--on' : ''}">
              {#if draft.photoReports.period === 'campaign'}<span class="ph-radio-dot" />{/if}
            </span>
            <span class="ph-radio-label">За кампанию</span>
            {#if draft.photoReports.period === 'campaign'}
              <span class="ph-days-label">Количество дней</span>
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <span class="ph-days-row" on:click|stopPropagation>
                <button class="ph-days-btn" on:click={() => set('days', Math.max(1, draft.photoReports.days - 1))}>−</button>
                <span class="ph-days-val">{draft.photoReports.days}</span>
                <button class="ph-days-btn" on:click={() => set('days', draft.photoReports.days + 1)}>+</button>
              </span>
            {/if}
          </label>

          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <label class="ph-radio-row" on:click={() => set('period', 'custom')}>
            <span class="ph-radio {draft.photoReports.period === 'custom' ? 'ph-radio--on' : ''}">
              {#if draft.photoReports.period === 'custom'}<span class="ph-radio-dot" />{/if}
            </span>
            <span class="ph-radio-label">Выбрать период</span>
            {#if draft.photoReports.period === 'custom'}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <span class="ph-days-row" on:click|stopPropagation>
                <button class="ph-days-btn" on:click={() => set('days', Math.max(1, draft.photoReports.days - 1))}>−</button>
                <span class="ph-days-val">{draft.photoReports.days}</span>
                <button class="ph-days-btn" on:click={() => set('days', draft.photoReports.days + 1)}>+</button>
              </span>
            {/if}
          </label>
        </div>

        <!-- Checkboxes -->
        <div class="ph-section ph-checks">
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <label class="ph-check-row" on:click={() => set('showSummary', !draft.photoReports.showSummary)}>
            <span class="ph-checkbox {draft.photoReports.showSummary ? 'ph-checkbox--on' : ''}">
              {#if draft.photoReports.showSummary}
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {/if}
            </span>
            <span class="ph-check-label">Сводка показа</span>
          </label>

          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <label class="ph-check-row" on:click={() => set('showSchedule', !draft.photoReports.showSchedule)}>
            <span class="ph-checkbox {draft.photoReports.showSchedule ? 'ph-checkbox--on' : ''}">
              {#if draft.photoReports.showSchedule}
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {/if}
            </span>
            <span class="ph-check-label">График показа</span>
          </label>
        </div>

        <!-- Count hint -->
        {#if draft.screenIds?.length}
          <div class="ph-count-hint">
            Количество фотоотчётов: <strong>{countHint}</strong>
          </div>
        {/if}
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
  .ph-toggle--on {
    background: var(--accent, #6366f1);
  }
  .ph-toggle-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    transition: left 0.2s;
  }
  .ph-toggle--on .ph-toggle-knob {
    left: 23px;
  }

  /* Body */
  .ph-card-body {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-top: 1px solid var(--border, #e5e7eb);
    padding-top: 20px;
  }
  .ph-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Radio row */
  .ph-radio-row {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
    flex-wrap: wrap;
  }
  .ph-radio {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid #d1d5db;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s;
  }
  .ph-radio--on {
    border-color: var(--accent, #6366f1);
  }
  .ph-radio-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent, #6366f1);
  }
  .ph-radio-label {
    font-size: 14px;
    color: var(--text, #111827);
  }

  /* Days stepper */
  .ph-days-label {
    font-size: 13px;
    color: var(--text-muted, #6b7280);
    margin-left: 8px;
  }
  .ph-days-row {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    overflow: hidden;
    margin-left: 4px;
  }
  .ph-days-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: var(--bg-muted, #f3f4f6);
    cursor: pointer;
    font-size: 16px;
    color: var(--text-muted, #6b7280);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .ph-days-btn:hover {
    background: #e5e7eb;
  }
  .ph-days-val {
    min-width: 32px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--text, #111827);
    padding: 0 4px;
  }

  /* Checkboxes */
  .ph-checks {
    padding-top: 4px;
  }
  .ph-check-row {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }
  .ph-checkbox {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 2px solid #d1d5db;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }
  .ph-checkbox--on {
    background: var(--accent, #6366f1);
    border-color: var(--accent, #6366f1);
  }
  .ph-check-label {
    font-size: 14px;
    color: var(--text, #111827);
  }

  /* Count hint */
  .ph-count-hint {
    margin-top: 4px;
    font-size: 13px;
    color: var(--text-muted, #6b7280);
    background: var(--bg-muted, #f3f4f6);
    border-radius: 8px;
    padding: 8px 14px;
    display: inline-block;
  }
  .ph-count-hint strong {
    color: var(--text, #111827);
    font-weight: 600;
  }
</style>
