<script>
  import { onMount } from 'svelte'
  import RightBar from '../components/RightBar.svelte'
  import StepStart       from './steps/StepStart.svelte'
  import StepBasicParams from './steps/StepBasicParams.svelte'
  import StepScreens     from './steps/StepScreens.svelte'
  import StepShowSettings from './steps/StepShowSettings.svelte'
  import StepBudget      from './steps/StepBudget.svelte'
  import StepCreatives   from './steps/StepCreatives.svelte'
  import StepAnalytics   from './steps/StepAnalytics.svelte'
  import StepSummary     from './steps/StepSummary.svelte'

  export let campaignType = 'RTB'

  // Campaign draft state
  let draft = {
    type: campaignType,
    name: '',
    customerId: null,
    brandId: null,
    bidType: 'IMPRESSIONS', // IMPRESSIONS | OTS
    startDate: null,
    endDate: null,
    optimalStrategy: false,
    limitType: 'COUNT',
    limitCampaign: '',
    limitDay: '',
    limitHour: '',
    interval: '',
    intervalUnit: 'SEC',
    vatEnabled: false,
    buyerMarkup: '',
    budgetMode: 'RECOMMENDED',
    cities: [],
    cityIds: [],
    screenIds: [],
  }

  // Forecast metrics (updated when screens/dates change)
  let metrics = { impressions: 0, ots: 0, budget: null }
  let hasScreensAndDates = false

  // Steps definition
  const STEPS = [
    { id: 'basic',     label: 'Основные параметры', subs: ['Рекламодатель', 'Бренд', 'Ставка'] },
    { id: 'screens',   label: 'Экраны',             subs: [] },
    { id: 'settings',  label: 'Настройка показов',  subs: ['Стратегия показов', 'Ограничения показов', 'Интервал'] },
    { id: 'budget',    label: 'Бюджет',             subs: [] },
    { id: 'creatives', label: 'Рекламные материалы и таргетинг', subs: [] },
    { id: 'analytics', label: 'Фотоотчёты и аналитика', subs: ['Настройка фотоотчётов', 'Настройка аналитики'] },
    { id: 'summary',   label: 'Сводка',             subs: [] },
  ]

  let currentStep = 'start'
  let completedSteps = {}   // plain object — spread creates new ref, guaranteed reactive

  function goToStep(id) { currentStep = id }

  function completeStep(id) {
    completedSteps = { ...completedSteps, [id]: true }  // new object → Svelte sees the change
    const idx = STEPS.findIndex(s => s.id === id)
    if (idx < STEPS.length - 1) currentStep = STEPS[idx + 1].id
  }

  function prevStep(id) {
    const idx = STEPS.findIndex(s => s.id === id)
    currentStep = idx > 0 ? STEPS[idx - 1].id : 'start'
  }

  // Both completedSteps and currentStep are direct deps — always recomputes correctly
  $: stepRows = STEPS.map(s => ({
    ...s,
    status: completedSteps[s.id] ? 'done' : currentStep === s.id ? 'active' : 'pending',
  }))

  function formatDateRange() {
    if (!draft.startDate || !draft.endDate) return null
    const fmt = d => new Date(d).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }).replace(/\./g, '.')
    return `${fmt(draft.startDate)}–${fmt(draft.endDate)}`
  }

  $: dateLabel = formatDateRange()
  $: campaignName = draft.name || `Рекламная кампания от ${new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'numeric', year:'numeric' })}`

  const TYPE_BADGE = {
    RTB: 'Аукционная', OPEN_RTB: 'Open RTB',
    GUARANTEED: 'Гарантированная', FLEX_GUARANTEED: 'Flex',
    MEDIA_PLAN: 'Медиаплан', STATIC: 'Статик',
  }
  $: typeBadgeLabel = TYPE_BADGE[campaignType] ?? campaignType
</script>

<div class="layout" style="height:100%">

  <!-- Icon sidebar -->
  <aside class="sidebar-icon">
    <div class="logo-box" style="width:32px;height:32px;font-size:7px;border-radius:7px;margin-bottom:8px">
      <div style="line-height:1.1;text-align:center">Omni<br/>360</div>
    </div>
    <button class="icon-nav-btn" title="Обзор" on:click={() => { window.location.hash='#/overview' }}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
    </button>
    <button class="icon-nav-btn active" title="Кампании">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
    </button>
    <button class="icon-nav-btn" title="Рекламные материалы">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg>
    </button>
    <button class="icon-nav-btn" title="Аналитика">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
    </button>
    <button class="icon-nav-btn" title="Сотрудники">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
    </button>
    <div class="sidebar-icon-spacer"></div>
    <button class="sidebar-expand-btn">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </aside>

  <!-- Wizard left panel -->
  <div class="wizard-panel">
    <div class="wizard-badges">
      <span class="wizard-draft-badge">Черновик</span>
      <span class="wizard-type-badge">{typeBadgeLabel}</span>
    </div>

    <div class="wizard-steps">
      {#each stepRows as step (step.id)}
        <div class="wizard-step">
          <button class="wizard-step-header" on:click={() => goToStep(step.id)}>
            {#if step.status === 'done'}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="flex-shrink:0;margin-top:1px">
                <circle cx="9" cy="9" r="9" fill="#112853"/>
                <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {:else if step.status === 'active'}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="flex-shrink:0;margin-top:1px">
                <circle cx="9" cy="9" r="8" stroke="#2563EB" stroke-width="2"/>
                <circle cx="9" cy="9" r="4" fill="#2563EB"/>
              </svg>
            {:else}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="flex-shrink:0;margin-top:1px">
                <circle cx="9" cy="9" r="8" stroke="#C8D0DA" stroke-width="1.5"/>
              </svg>
            {/if}
            <span class="wizard-step-label"
              class:active={step.status === 'active'}
              class:done={step.status === 'done'}>
              {step.label}
            </span>
          </button>
          {#if step.subs.length && (step.status === 'active' || step.status === 'done')}
            <div class="wizard-substeps">
              {#each step.subs as sub}
                <button class="wizard-substep">{sub}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Bottom metrics -->
    <div class="wizard-metrics">
      {#if dateLabel}
        <div class="wizard-dates">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="color:var(--text-muted)">
            <path d="M11 3a1 1 0 10-2 0v1H7V3a1 1 0 10-2 0v1H4a2 2 0 00-2 2v7a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-1V3zM4 7h8v5H4V7z"/>
          </svg>
          {dateLabel}
        </div>
      {/if}

      {#if !hasScreensAndDates}
        <div class="wizard-hint">
          <svg class="wizard-hint-icon" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
          <div class="wizard-hint-text">Выберите даты и хотя бы один экран для расчёта прогноза</div>
        </div>
      {/if}

      <div class="wizard-metric-row">
        <span>Количество выходов</span>
        <span class="wizard-metric-val">{metrics.impressions.toLocaleString('ru-RU')}</span>
      </div>
      <div class="wizard-metric-row">
        <span>Количество OTS</span>
        <span class="wizard-metric-val">{metrics.ots.toLocaleString('ru-RU')}</span>
      </div>
      {#if metrics.budget !== null}
        <div class="wizard-metric-row highlight">
          <span>Рекомендованный бюджет</span>
          <span class="wizard-metric-val">₽ {metrics.budget.toLocaleString('ru-RU')}</span>
        </div>
      {:else}
        <div class="wizard-metric-row">
          <span>Бюджет, ₽</span>
          <span class="wizard-metric-val">0</span>
        </div>
      {/if}

      <div class="wizard-actions">
        <button class="btn-save">Сохранить</button>
        <button class="btn-launch" class:ready={Object.keys(completedSteps).length >= STEPS.length - 1}>Запустить</button>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="main-content">
    <!-- Topbar -->
    <div class="creation-topbar">
      <button class="creation-close-btn" on:click={() => { window.location.hash='#/campaigns' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
      <span class="creation-title">{campaignName}</span>
      <button class="creation-topbar-action" title="Скачать">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
      <button class="creation-topbar-action" title="Загрузить">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>

    <!-- Step content -->
    {#if currentStep === 'start'}
      <StepStart on:start={() => goToStep('basic')} on:explore={() => goToStep('screens')} />
    {:else if currentStep === 'basic'}
      <StepBasicParams bind:draft on:next={() => completeStep('basic')} on:back={() => goToStep('start')} />
    {:else if currentStep === 'screens'}
      <StepScreens bind:draft on:next={() => completeStep('screens')} on:back={() => prevStep('screens')} />
    {:else if currentStep === 'settings'}
      <StepShowSettings bind:draft on:next={() => completeStep('settings')} on:back={() => prevStep('settings')} />
    {:else if currentStep === 'budget'}
      <StepBudget bind:draft {metrics} on:next={() => completeStep('budget')} on:back={() => prevStep('budget')} />
    {:else if currentStep === 'creatives'}
      <StepCreatives bind:draft on:next={() => completeStep('creatives')} on:back={() => prevStep('creatives')} />
    {:else if currentStep === 'analytics'}
      <StepAnalytics bind:draft on:next={() => completeStep('analytics')} on:back={() => prevStep('analytics')} />
    {:else if currentStep === 'summary'}
      <StepSummary bind:draft {metrics} on:back={() => prevStep('summary')} />
    {/if}
  </div>

  <RightBar />
</div>
