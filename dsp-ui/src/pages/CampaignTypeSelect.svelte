<script>
  import RightBar from '../components/RightBar.svelte'

  function select() {
    window.location.hash = '#/campaigns/create/rtb'
  }
</script>

<div class="layout" style="height:100%">
  <!-- Icon sidebar -->
  <aside class="sidebar-icon">
    <div class="logo-box">
      <div style="font-size:7px;line-height:1.1;text-align:center">Omni<br/>360</div>
    </div>

    <button class="icon-nav-btn" title="Обзор">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
      </svg>
    </button>
    <button class="icon-nav-btn active" title="Кампании">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
      </svg>
    </button>
    <button class="icon-nav-btn" title="Рекламные материалы">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
      </svg>
    </button>
    <button class="icon-nav-btn" title="Аналитика">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
      </svg>
    </button>
    <button class="icon-nav-btn" title="Сотрудники">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
      </svg>
    </button>

    <div class="sidebar-icon-spacer"></div>
    <button class="sidebar-expand-btn" title="Развернуть">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </aside>

  <!-- Main -->
  <div class="main-content">
    <!-- Topbar -->
    <div class="creation-topbar">
      <button class="creation-close-btn" on:click={() => { window.location.hash = '#/campaigns' }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <span style="font-size:13px;font-weight:500;color:var(--text-muted)">← Назад</span>
    </div>

    <!-- Content -->
    <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:40px">
      <div>
        <div class="type-picker-grid">
          <div class="type-card" on:click={select} role="button" tabindex="0"
            on:keydown={e => e.key === 'Enter' && select()}>
            <div class="type-card-title">RTB кампания</div>
            <div class="type-card-desc">Аукционная закупка по ставке в реальном времени</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <RightBar />
</div>
