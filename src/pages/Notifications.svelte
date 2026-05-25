<script>
  import { onMount } from 'svelte'
  import { api } from '../lib/api.js'

  let notifications = []
  let loading = true
  let error = ''
  let totalPages = 1
  let currentPage = 0
  let markingAll = false

  const STATUS_LABEL = {
    APPROVED: 'Одобрен', REJECTED: 'Отклонён', PENDING: 'На рассмотрении',
    ACTIVE: 'Активна', STOPPED: 'Остановлена', COMPLETED: 'Завершена',
    CANCELLED: 'Отменена', MODERATION: 'На модерации',
  }

  const TYPE_ICON = {
    SIMPLE: `<path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
             <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>`,
    STATE_CHANGED: `<path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>`,
  }

  function buildMessage(n) {
    if (n.message) return n.message
    if (n.eventType === 'STATE_CHANGED') {
      const e = n.args?.entity_info
      if (!e) return n.subject ?? ''
      const st = STATUS_LABEL[e.newStatus] ?? e.newStatus ?? ''
      return `Статус медиафайла «${e.segmentName ?? e.entityName ?? ''}» изменён подрядчиком «${e.displayOwnerName ?? ''}» на «${st}»`
    }
    return n.subject ?? ''
  }

  function getComment(n) {
    return n.args?.entity_info?.comment || ''
  }

  function getLink(n) {
    const e = n.args?.entity_info
    if (!e) return null
    if (e.type === 'IMPRESSION') return `#/campaigns/${e.id}`
    if (e.type === 'MEDIA')      return `#/campaigns`
    return null
  }

  function fmtDate(ms) {
    if (!ms) return '—'
    return new Date(ms).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  $: unreadCount = notifications.filter(n => !n.read).length

  async function load(page = 0) {
    loading = true; error = ''
    try {
      const data = await api.notifications.list({ page, size: 30 })
      notifications = data.content ?? []
      totalPages = data.totalPages ?? 1
      currentPage = page
    } catch {
      error = 'Не удалось загрузить уведомления'
    } finally {
      loading = false
    }
  }

  async function markAllRead() {
    const unread = notifications.filter(n => !n.read).map(n => n.id)
    if (!unread.length) return
    markingAll = true
    try {
      await api.notifications.markRead(unread)
      notifications = notifications.map(n => ({ ...n, read: true }))
    } catch {
      // non-critical
    } finally {
      markingAll = false
    }
  }

  async function markOneRead(n) {
    if (n.read) return
    try {
      await api.notifications.markRead([n.id])
      notifications = notifications.map(r => r.id === n.id ? { ...r, read: true } : r)
    } catch {}
  }

  onMount(() => load(0))
</script>

<div class="notif-page">

  <!-- Header -->
  <div class="notif-header">
    <div>
      <h1 class="notif-title">Уведомления</h1>
      {#if !loading}
        <p class="notif-sub">
          {notifications.length} уведомлений
          {#if unreadCount > 0}<span class="unread-chip">{unreadCount} непрочитанных</span>{/if}
        </p>
      {/if}
    </div>
    {#if unreadCount > 0}
      <button class="btn-mark-all" on:click={markAllRead} disabled={markingAll}>
        {markingAll ? 'Отмечаем…' : 'Отметить все прочитанными'}
      </button>
    {/if}
  </div>

  {#if error}
    <div class="notif-error">{error}</div>
  {:else if loading}
    <div class="notif-spinner">
      <div class="spinner"></div>
      <span>Загрузка…</span>
    </div>
  {:else if notifications.length === 0}
    <div class="notif-empty">
      <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor" style="color:#d1d5db">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
      </svg>
      <p>Уведомлений пока нет</p>
    </div>
  {:else}
    <div class="notif-list">
      {#each notifications as n (n.id)}
        {@const msg = buildMessage(n)}
        {@const comment = getComment(n)}
        {@const link = getLink(n)}
        <div class="notif-item" class:unread={!n.read} on:click={() => markOneRead(n)} role="article">
          <!-- Left accent bar for unread -->
          {#if !n.read}<div class="unread-bar"></div>{/if}

          <!-- Icon -->
          <div class="notif-icon" class:icon-state={n.eventType === 'STATE_CHANGED'}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              {@html TYPE_ICON[n.eventType] ?? TYPE_ICON.SIMPLE}
            </svg>
          </div>

          <!-- Body -->
          <div class="notif-body">
            <div class="notif-date">{fmtDate(n.created)}</div>
            <div class="notif-subject" class:subject-unread={!n.read}>{n.subject}</div>
            <div class="notif-msg">{@html msg}</div>
            {#if comment}
              <div class="notif-comment">Комментарий: {comment}</div>
            {/if}
          </div>

          <!-- Action -->
          {#if link}
            <a href={link} class="btn-goto" on:click|stopPropagation={() => markOneRead(n)}>
              Перейти
            </a>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="pager">
        <button class="pager-btn" disabled={currentPage === 0} on:click={() => load(currentPage - 1)}>← Назад</button>
        <span class="pager-info">Стр. {currentPage + 1} из {totalPages}</span>
        <button class="pager-btn" disabled={currentPage >= totalPages - 1} on:click={() => load(currentPage + 1)}>Вперёд →</button>
      </div>
    {/if}
  {/if}

</div>

<style>
  .notif-page {
    padding: 28px 32px 48px;
    max-width: 820px;
    min-height: 100%;
    box-sizing: border-box;
  }

  /* ── Header ── */
  .notif-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
    gap: 16px;
  }
  .notif-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--text, #111827);
    margin: 0 0 4px;
  }
  .notif-sub {
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .unread-chip {
    display: inline-flex;
    align-items: center;
    background: #eff6ff;
    color: #3b82f6;
    border: 1px solid #bfdbfe;
    border-radius: 20px;
    padding: 1px 8px;
    font-size: 11px;
    font-weight: 600;
  }
  .btn-mark-all {
    flex-shrink: 0;
    background: none;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    padding: 7px 14px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text-muted, #6b7280);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .btn-mark-all:hover:not(:disabled) { background: #f9fafb; color: var(--text, #374151); }
  .btn-mark-all:disabled { opacity: 0.5; cursor: default; }

  /* ── States ── */
  .notif-error {
    padding: 16px; background: #fef2f2; border-radius: 8px;
    color: #dc2626; font-size: 13px;
  }
  .notif-spinner {
    display: flex; align-items: center; gap: 12px;
    padding: 60px 0; color: var(--text-muted, #6b7280); font-size: 13px;
  }
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid #e5e7eb; border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.7s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .notif-empty {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 80px 0; color: var(--text-muted, #9ca3af);
    font-size: 14px;
  }

  /* ── List ── */
  .notif-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    overflow: hidden;
  }

  .notif-item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 16px 20px;
    background: #fff;
    border-bottom: 1px solid var(--border, #f3f4f6);
    position: relative;
    transition: background 0.12s;
  }
  .notif-item:last-child { border-bottom: none; }
  .notif-item:hover { background: #fafafa; }
  .notif-item.unread { background: #f8faff; }
  .notif-item.unread:hover { background: #eff6ff; }

  /* Blue left border for unread */
  .unread-bar {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: #3b82f6;
    border-radius: 0;
  }

  /* Icon */
  .notif-icon {
    flex-shrink: 0;
    width: 32px; height: 32px;
    border-radius: 8px;
    background: #e0e7ff;
    color: #6366f1;
    display: flex; align-items: center; justify-content: center;
    margin-top: 2px;
  }
  .notif-icon.icon-state {
    background: #d1fae5;
    color: #059669;
  }

  /* Body */
  .notif-body {
    flex: 1;
    min-width: 0;
  }
  .notif-date {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    margin-bottom: 3px;
  }
  .notif-subject {
    font-size: 13px;
    font-weight: 500;
    color: var(--text, #374151);
    margin-bottom: 4px;
  }
  .notif-subject.subject-unread {
    font-weight: 700;
    color: var(--text, #111827);
  }
  .notif-msg {
    font-size: 13px;
    color: var(--text, #374151);
    line-height: 1.5;
  }
  .notif-msg :global(a) {
    color: #3b82f6;
    text-decoration: underline;
  }
  .notif-comment {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-muted, #9ca3af);
    font-style: italic;
  }

  /* Goto button */
  .btn-goto {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 20px;
    padding: 6px 16px;
    font-size: 12.5px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s;
    margin-top: 2px;
  }
  .btn-goto:hover { background: #2563eb; }

  /* Pagination */
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 20px;
    padding: 12px 0;
  }
  .pager-btn {
    background: none;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text, #374151);
    cursor: pointer;
    transition: background 0.12s;
  }
  .pager-btn:hover:not(:disabled) { background: #f3f4f6; }
  .pager-btn:disabled { opacity: 0.4; cursor: default; }
  .pager-info { font-size: 12px; color: var(--text-muted, #6b7280); }
</style>
