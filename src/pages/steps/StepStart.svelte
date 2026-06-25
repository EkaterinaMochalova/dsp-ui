<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()
</script>

<div class="step-content" style="justify-content:center">
  <h1 style="font-size:26px;font-weight:700;color:var(--text);margin-bottom:28px">С чего начать?</h1>

  <div style="width:100%;max-width:480px;display:flex;flex-direction:column;gap:12px">
    <button class="start-card" on:click={() => dispatch('start')}>
      <div>
        <div class="start-card-title">Стандартный запуск</div>
        <div class="start-card-desc">Настройте и запустите кампанию в соответствии с вашим бюджетом.</div>
      </div>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="color:var(--text-muted);flex-shrink:0">
        <path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <button class="start-card" on:click={() => dispatch('planner')}>
      <div>
        <div class="start-card-title">Планировщик</div>
        <div class="start-card-desc">Подберите оптимальный набор экранов по городам и бюджету с помощью медиапланировщика.</div>
      </div>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="color:var(--text-muted);flex-shrink:0">
        <path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <button class="start-card start-card--ai" on:click={() => dispatch('brief')}>
      <div>
        <div class="start-card-title">
          ИИ бриф
          <span class="ai-badge">AI</span>
        </div>
        <div class="start-card-desc">Опишите кампанию в свободной форме — ИИ автоматически составит план на основе вашего брифа.</div>
      </div>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="color:#6366f1;flex-shrink:0">
        <path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .start-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: border-color .15s, box-shadow .15s;
    gap: 16px;
  }
  .start-card:hover {
    border-color: var(--navy);
    box-shadow: 0 2px 12px rgba(17,40,83,.08);
  }
  .start-card--ai {
    border-color: #e0e7ff;
    background: linear-gradient(135deg, #fff 60%, #f5f3ff);
  }
  .start-card--ai:hover {
    border-color: #6366f1;
    box-shadow: 0 2px 16px rgba(99,102,241,.14);
  }
  .ai-badge {
    display: inline-flex;
    align-items: center;
    background: #6366f1;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 1px 5px;
    border-radius: 4px;
    vertical-align: middle;
    margin-left: 6px;
    line-height: 14px;
  }
  .start-card-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 4px;
  }
  .start-card-desc {
    font-size: 12.5px;
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
