<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()

  let iframeEl
  let iframeLoaded = false
  let plannerDone = false
  let plannerResult = null

  function formatMoney(n) {
    if (!n) return '—'
    return Math.round(n).toLocaleString('ru-RU') + ' ₽'
  }

  function handleMessage(e) {
    if (e.data?.type === 'planner:calc-done') {
      plannerResult = e.data
      plannerDone = true
    }
  }

  function onIframeLoad() {
    iframeLoaded = true
    // Inject the DSP token into the iframe's sessionStorage.
    // Same-origin access is allowed because the iframe is served from /planner/index.html.
    // The planner's getDspToken() reads from sessionStorage, so this enables live inventory.
    try {
      const token = localStorage.getItem('dsp_token')
      if (token) {
        iframeEl.contentWindow.sessionStorage.setItem('dsp_token', token)
      }
    } catch (err) {
      console.warn('[StepPlanner] could not inject token into iframe:', err)
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage)
  })

  onDestroy(() => {
    window.removeEventListener('message', handleMessage)
  })

  function apply() {
    if (!plannerResult) return
    dispatch('apply', plannerResult)
  }
</script>

<div class="planner-step">
  <!-- Header bar -->
  <div class="planner-topbar">
    <button class="back-btn" on:click={() => dispatch('back')}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
      </svg>
      Назад
    </button>
    <div class="planner-topbar-title">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:#6366f1;flex-shrink:0">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
      </svg>
      Автоматический подбор АП
    </div>
    {#if !iframeLoaded}
      <span class="loading-dot">Загрузка…</span>
    {/if}
  </div>

  <!-- Planner iframe -->
  <div class="planner-frame-wrap">
    <iframe
      bind:this={iframeEl}
      src="/planner/index.html"
      class="planner-iframe"
      class:loaded={iframeLoaded}
      title="Планировщик размещения"
      on:load={onIframeLoad}
    ></iframe>
  </div>

  <!-- Apply bar — appears after calculation -->
  {#if plannerDone && plannerResult}
    {@const chosen = plannerResult.chosen ?? []}
    {@const meta   = plannerResult.meta   ?? {}}
    {@const brief  = plannerResult.brief  ?? {}}
    <div class="apply-bar">
      <div class="apply-summary">
        <div class="apply-stat">
          <span class="apply-stat-val">{chosen.length}</span>
          <span class="apply-stat-lbl">экранов</span>
        </div>
        {#if meta.totalBudget}
          <div class="apply-divider"></div>
          <div class="apply-stat">
            <span class="apply-stat-val">{formatMoney(meta.totalBudget)}</span>
            <span class="apply-stat-lbl">бюджет</span>
          </div>
        {/if}
        {#if meta.totalPlays}
          <div class="apply-divider"></div>
          <div class="apply-stat">
            <span class="apply-stat-val">{Math.round(meta.totalPlays).toLocaleString('ru-RU')}</span>
            <span class="apply-stat-lbl">выходов</span>
          </div>
        {/if}
        {#if meta.totalOts}
          <div class="apply-divider"></div>
          <div class="apply-stat">
            <span class="apply-stat-val">{Math.round(meta.totalOts).toLocaleString('ru-RU')}</span>
            <span class="apply-stat-lbl">OTS</span>
          </div>
        {/if}
        {#if brief.dates?.start && brief.dates?.end}
          <div class="apply-divider"></div>
          <div class="apply-stat">
            <span class="apply-stat-val">{brief.dates.start} — {brief.dates.end}</span>
            <span class="apply-stat-lbl">период</span>
          </div>
        {/if}
      </div>
      <button class="btn-apply" on:click={apply}>
        Применить к кампании
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .planner-step {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Top bar ── */
  .planner-topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border, #e5e7eb);
    background: #fff;
    flex-shrink: 0;
  }
  .planner-topbar-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text, #111827);
  }
  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    cursor: pointer;
    font-family: inherit;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background 0.12s;
  }
  .back-btn:hover { background: #f3f4f6; }
  .loading-dot {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    margin-left: auto;
  }

  /* ── Iframe ── */
  .planner-frame-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }
  .planner-iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
    opacity: 0;
    transition: opacity 0.3s;
  }
  .planner-iframe.loaded {
    opacity: 1;
  }

  /* ── Apply bar ── */
  .apply-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 20px;
    background: #fff;
    border-top: 1px solid var(--border, #e5e7eb);
    flex-shrink: 0;
    box-shadow: 0 -4px 16px rgba(0,0,0,0.06);
  }
  .apply-summary {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .apply-stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .apply-stat-val {
    font-size: 13px;
    font-weight: 600;
    color: var(--text, #111827);
  }
  .apply-stat-lbl {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #9ca3af);
  }
  .apply-divider {
    width: 1px;
    height: 28px;
    background: var(--border, #e5e7eb);
  }
  .btn-apply {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s, transform 0.1s;
    flex-shrink: 0;
  }
  .btn-apply:hover {
    opacity: 0.9;
    transform: translateX(1px);
  }
</style>
