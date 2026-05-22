<script>
  import { page, currentUser } from '../lib/stores.js'

  function nav(target) { window.location.hash = `#/${target}` }

  function initials(name) {
    if (!name) return '?'
    return name.split(/[\s@]/).filter(Boolean).map(p => p[0]).join('').slice(0,2).toUpperCase()
  }
</script>

<aside class="sidebar">

  <!-- Logo -->
  <div class="sidebar-logo">
    <div class="logo-box">
      <span>Omni</span><span>360</span>
    </div>
  </div>

  <!-- Billing widget -->
  <div class="billing-widget">
    <div class="billing-amount">1.000.000,00 ₽</div>
    <button class="billing-btn">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      Пополнить
    </button>
  </div>

  <!-- Nav -->
  <nav class="sidebar-nav">

    <button class="nav-item" class:active={$page === 'overview'} on:click={() => nav('overview')}>
      <!-- Grid / overview icon -->
      <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
      </svg>
      Обзор
    </button>

    <button class="nav-item" class:active={$page === 'campaigns' || $page === ''} on:click={() => nav('campaigns')}>
      <!-- Play / campaigns icon -->
      <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
      </svg>
      Кампании
      <span class="nav-dot"></span>
    </button>

    <button class="nav-item" class:active={$page === 'medias'} on:click={() => nav('medias')}>
      <!-- Image icon -->
      <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
      </svg>
      Рекламные
      <span class="nav-dot"></span>
    </button>

    <button class="nav-item" class:active={$page === 'analytics'} on:click={() => nav('analytics')}>
      <!-- Chart icon -->
      <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
      </svg>
      Аналитика
    </button>

    <button class="nav-item" class:active={$page === 'directories' || $page.startsWith('directories/')} on:click={() => nav('directories')}>
      <!-- Book / directories icon -->
      <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
      </svg>
      Справочники
    </button>

  </nav>

  <!-- User avatar -->
  <div class="sidebar-footer">
    <div class="user-avatar">{initials($currentUser?.name || $currentUser?.email || '')}</div>
    <div class="user-info">
      <div class="user-name">{$currentUser?.name || $currentUser?.email || 'Профиль'}</div>
    </div>
  </div>
</aside>

<style>
  .sidebar-footer {
    margin-top: auto;
    padding: 12px 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255,255,255,0.15);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user-name {
    font-size: 11px;
    color: rgba(255,255,255,0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

</style>
