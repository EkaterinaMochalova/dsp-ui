<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import { api } from '../../lib/api.js'
  const dispatch = createEventDispatcher()

  export let draft
  export let metrics = { impressions: 0, ots: 0, budget: null }

  if (!draft.creativeIds) draft.creativeIds = []

  // ── State ─────────────────────────────────────────────────────────────
  let creatives  = []
  let loading    = true
  let error      = ''
  let uploading  = false
  let uploadErr  = ''

  let search       = ''
  let statusFilter = 'ALL'

  let fileInput   // bound to hidden <input type=file>
  let showPicker  = false   // "choose from uploaded" modal

  // ── Load creatives ────────────────────────────────────────────────────
  onMount(loadCreatives)

  async function loadCreatives() {
    loading = true; error = ''
    try {
      const params = {}
      if (draft.customerId) params.customerId = draft.customerId
      const res = await api.creatives.list(params)
      creatives = res?.content ?? (Array.isArray(res) ? res : [])
    } catch (e) {
      error = 'Не удалось загрузить список креативов'
    } finally {
      loading = false
    }
  }

  // ── Status config ─────────────────────────────────────────────────────
  const STATUS = {
    APPROVED: { label: 'Согласован',     cls: 'st-green'  },
    PENDING:  { label: 'На модерации',   cls: 'st-yellow' },
    REJECTED: { label: 'Отклонён',       cls: 'st-red'    },
  }

  const FILTER_TABS = [
    { key: 'ALL',      label: 'Все'           },
    { key: 'APPROVED', label: 'Согласованы'   },
    { key: 'PENDING',  label: 'На модерации'  },
    { key: 'REJECTED', label: 'Отклонён'      },
  ]

  // ── Filtering ─────────────────────────────────────────────────────────
  $: filtered = creatives.filter(c => {
    const q = search.trim().toLowerCase()
    if (q && !c.name?.toLowerCase().includes(q)) return false
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    return true
  })

  // ── Selection ─────────────────────────────────────────────────────────
  function isSelected(id)   { return draft.creativeIds.includes(id) }
  function toggleSelect(id) {
    draft.creativeIds = isSelected(id)
      ? draft.creativeIds.filter(x => x !== id)
      : [...draft.creativeIds, id]
  }
  function toggleAll() {
    const allIds = filtered.map(c => c.id)
    const allOn  = allIds.every(id => isSelected(id))
    if (allOn) {
      draft.creativeIds = draft.creativeIds.filter(id => !allIds.includes(id))
    } else {
      const set = new Set([...draft.creativeIds, ...allIds])
      draft.creativeIds = [...set]
    }
  }
  $: allFilteredSelected = filtered.length > 0 && filtered.every(c => isSelected(c.id))
  $: someFilteredSelected = filtered.some(c => isSelected(c.id))

  // ── Upload ────────────────────────────────────────────────────────────
  function openUpload() { fileInput?.click() }

  async function handleFiles(e) {
    const files = [...(e.target.files ?? [])]
    if (!files.length) return
    uploading = true; uploadErr = ''
    try {
      for (const file of files) {
        const created = await api.creatives.upload(file, file.name, null, draft.customerId)
        if (created) {
          creatives = [created, ...creatives]
          draft.creativeIds = [...draft.creativeIds, created.id]
        }
      }
    } catch (err) {
      uploadErr = 'Ошибка при загрузке файла'
    } finally {
      uploading = false
      e.target.value = ''
    }
  }

  // ── Format helpers ────────────────────────────────────────────────────
  function formatDimensions(c) {
    if (!c.files?.length && !c.width) return '—'
    if (c.files?.length) {
      return c.files.map(f => `${f.width}×${f.height}`).join(', ')
    }
    return c.width && c.height ? `${c.width}×${c.height}` : '—'
  }

  function mediaTypeLabel(c) {
    const t = c.mediaType ?? c.type ?? ''
    if (t === 'VIDEO' || t === 'video') return 'Видео'
    if (t === 'IMAGE' || t === 'image' || t === 'STATIC') return 'Изображение'
    return t || '—'
  }

  function durationLabel(c) {
    const d = c.duration ?? c.slotDuration
    return d ? `${d} с` : '—'
  }

  function thumbUrl(c) {
    return c.thumbnailUrl ?? c.previewUrl ?? c.url ?? null
  }

  function isVideo(c) {
    const t = c.mediaType ?? c.type ?? ''
    return t === 'VIDEO' || t === 'video'
  }
</script>

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept="image/*,video/*,.jpg,.jpeg,.png,.mp4,.mov"
  multiple
  style="display:none"
  on:change={handleFiles}
/>

<div class="cr-wrap">

  <!-- ── Top bar ─────────────────────────────────────────────────────── -->
  <div class="cr-topbar">
    <div class="cr-topbar-left">
      <h1 class="cr-title">Рекламные материалы и таргетинг</h1>
      {#if draft.creativeIds.length > 0}
        <span class="cr-count-badge">{draft.creativeIds.length} выбрано</span>
      {/if}
    </div>
    <div class="cr-topbar-right">
      <button class="cr-btn cr-btn-ghost" on:click={openUpload} disabled={uploading}>
        {#if uploading}
          <span class="cr-spinner"></span> Загрузка…
        {:else}
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
          </svg>
          Загрузить рекламные материалы
        {/if}
      </button>
      <button class="cr-btn cr-btn-primary" on:click={() => showPicker = true}>
        Выбрать из загруженных
      </button>
    </div>
  </div>

  {#if uploadErr}
    <div class="cr-error-banner">{uploadErr}</div>
  {/if}

  <!-- ── Filters ──────────────────────────────────────────────────────── -->
  <div class="cr-filters">
    <div class="cr-tabs">
      {#each FILTER_TABS as tab}
        <button
          class="cr-tab"
          class:cr-tab-on={statusFilter === tab.key}
          on:click={() => statusFilter = tab.key}
        >{tab.label}</button>
      {/each}
    </div>
    <div class="cr-search-wrap">
      <svg class="cr-search-icon" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
      </svg>
      <input class="cr-search" type="text" placeholder="Поиск по названию" bind:value={search} />
      {#if search}
        <button class="cr-search-clear" on:click={() => search = ''}>×</button>
      {/if}
    </div>
  </div>

  <!-- ── Table ────────────────────────────────────────────────────────── -->
  <div class="cr-table-wrap">
    {#if loading}
      <div class="cr-state">
        <span class="cr-spinner cr-spinner-lg"></span>
        <span>Загрузка креативов…</span>
      </div>
    {:else if error}
      <div class="cr-state cr-state-err">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        {error}
        <button class="cr-retry" on:click={loadCreatives}>Попробовать снова</button>
      </div>
    {:else if filtered.length === 0}
      <div class="cr-state">
        <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor" style="color:#CBD5E1">
          <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
        </svg>
        {#if creatives.length === 0}
          <div style="font-weight:600;color:#475569;margin-top:4px">Нет загруженных креативов</div>
          <div style="font-size:12px;color:#94A3B8;margin-top:2px">Загрузите рекламные материалы с помощью кнопки выше</div>
        {:else}
          <div style="font-size:13px;color:#94A3B8;margin-top:4px">Ничего не найдено</div>
        {/if}
      </div>
    {:else}
      <table class="cr-table">
        <thead>
          <tr class="cr-thead-row">
            <th class="cr-th cr-th-check">
              <label class="cr-check-wrap">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  indeterminate={someFilteredSelected && !allFilteredSelected}
                  on:change={toggleAll}
                />
                <span class="cr-check-box"></span>
              </label>
            </th>
            <th class="cr-th cr-th-thumb"></th>
            <th class="cr-th cr-th-name">Название</th>
            <th class="cr-th">Статус</th>
            <th class="cr-th">Длительность</th>
            <th class="cr-th">Медиатип</th>
            <th class="cr-th">Формат</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as c (c.id)}
            {@const sel = isSelected(c.id)}
            {@const st  = STATUS[c.status] ?? { label: c.status ?? '—', cls: '' }}
            <tr class="cr-row" class:cr-row-sel={sel} on:click={() => toggleSelect(c.id)}>

              <!-- Checkbox -->
              <td class="cr-td cr-td-check" on:click|stopPropagation>
                <label class="cr-check-wrap">
                  <input type="checkbox" checked={sel} on:change={() => toggleSelect(c.id)} />
                  <span class="cr-check-box"></span>
                </label>
              </td>

              <!-- Thumbnail -->
              <td class="cr-td cr-td-thumb">
                <div class="cr-thumb">
                  {#if thumbUrl(c)}
                    <img src={thumbUrl(c)} alt={c.name} class="cr-thumb-img" />
                  {:else if isVideo(c)}
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                    </svg>
                  {:else}
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                      <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                    </svg>
                  {/if}
                </div>
              </td>

              <!-- Name -->
              <td class="cr-td cr-td-name">
                <div class="cr-name">{c.name ?? '—'}</div>
                {#if c.createdAt}
                  <div class="cr-date">{new Date(c.createdAt).toLocaleDateString('ru-RU')}</div>
                {/if}
              </td>

              <!-- Status -->
              <td class="cr-td">
                <span class="cr-status {st.cls}">{st.label}</span>
              </td>

              <!-- Duration -->
              <td class="cr-td cr-td-num">{durationLabel(c)}</td>

              <!-- Media type -->
              <td class="cr-td">{mediaTypeLabel(c)}</td>

              <!-- Format -->
              <td class="cr-td cr-td-fmt">{formatDimensions(c)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- ── Bottom nav ───────────────────────────────────────────────────── -->
  <div class="cr-nav">
    <button class="nav-link" on:click={() => dispatch('back')}>Назад</button>
    <button class="nav-link nav-link-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>

</div>

<!-- ── Picker modal ──────────────────────────────────────────────────── -->
{#if showPicker}
  <div class="picker-backdrop" on:mousedown|self={() => showPicker = false} role="dialog" aria-modal="true">
    <div class="picker-modal" on:mousedown|stopPropagation>
      <div class="picker-head">
        <span class="picker-title">Выбрать из загруженных</span>
        <button class="picker-close" on:click={() => showPicker = false}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>

      <div class="picker-search-row">
        <input class="cr-search picker-search" type="text" placeholder="Поиск по названию" bind:value={search} />
      </div>

      <div class="picker-list">
        {#each creatives.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase())) as c (c.id)}
          {@const sel = isSelected(c.id)}
          {@const st  = STATUS[c.status] ?? { label: c.status ?? '—', cls: '' }}
          <label class="picker-row" class:picker-row-sel={sel}>
            <input type="checkbox" class="picker-check" checked={sel} on:change={() => toggleSelect(c.id)} />
            <div class="picker-thumb">
              {#if thumbUrl(c)}
                <img src={thumbUrl(c)} alt={c.name} class="cr-thumb-img" />
              {:else}
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                  <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                </svg>
              {/if}
            </div>
            <div class="picker-info">
              <div class="picker-name">{c.name ?? '—'}</div>
              <div class="picker-meta">
                <span class="cr-status {st.cls}" style="font-size:10px;padding:1px 6px">{st.label}</span>
                <span>{durationLabel(c)}</span>
                <span>{formatDimensions(c)}</span>
              </div>
            </div>
          </label>
        {:else}
          <div class="picker-empty">Нет доступных креативов</div>
        {/each}
      </div>

      <div class="picker-footer">
        <span class="picker-sel-count">Выбрано: {draft.creativeIds.length}</span>
        <button class="cr-btn cr-btn-primary" on:click={() => showPicker = false}>Готово</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Layout ── */
  .cr-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px 28px 20px;
    box-sizing: border-box;
    gap: 14px;
    overflow: hidden;
  }

  /* ── Top bar ── */
  .cr-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }
  .cr-topbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cr-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--navy, #112853);
  }
  .cr-count-badge {
    background: #DBEAFE;
    color: #1D4ED8;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 20px;
  }
  .cr-topbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  /* ── Buttons ── */
  .cr-btn {
    height: 34px;
    padding: 0 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: background .12s, border-color .12s, color .12s;
  }
  .cr-btn:disabled { opacity: .6; cursor: default; }
  .cr-btn-ghost {
    background: white;
    border: 1.5px solid #CBD5E1;
    color: #475569;
  }
  .cr-btn-ghost:hover:not(:disabled) { border-color: var(--navy,#112853); color: var(--navy,#112853); }
  .cr-btn-primary {
    background: var(--navy, #112853);
    border: 1.5px solid transparent;
    color: white;
  }
  .cr-btn-primary:hover { background: #1e3a6e; }

  /* ── Error banner ── */
  .cr-error-banner {
    padding: 8px 14px;
    background: #FEF2F2;
    border: 1px solid #FECACA;
    border-radius: 8px;
    font-size: 12.5px;
    color: #DC2626;
    flex-shrink: 0;
  }

  /* ── Filters ── */
  .cr-filters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }
  .cr-tabs {
    display: flex;
    gap: 4px;
  }
  .cr-tab {
    height: 30px;
    padding: 0 14px;
    border-radius: 20px;
    border: 1.5px solid #E2E8F0;
    background: white;
    font-size: 12.5px;
    font-family: inherit;
    font-weight: 500;
    color: #64748B;
    cursor: pointer;
    transition: all .12s;
    white-space: nowrap;
  }
  .cr-tab:hover { border-color: #94A3B8; color: #334155; }
  .cr-tab-on {
    background: var(--navy, #112853);
    border-color: var(--navy, #112853);
    color: white;
  }
  .cr-tab-on:hover { background: #1e3a6e; border-color: #1e3a6e; }

  .cr-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .cr-search-icon {
    position: absolute;
    left: 10px;
    color: #94A3B8;
    pointer-events: none;
    flex-shrink: 0;
  }
  .cr-search {
    height: 32px;
    width: 220px;
    padding: 0 32px 0 30px;
    border: 1.5px solid #E2E8F0;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    color: #334155;
    outline: none;
    background: white;
    transition: border-color .12s;
  }
  .cr-search:focus { border-color: #93C5FD; }
  .cr-search-clear {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #94A3B8;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  /* ── Table wrapper ── */
  .cr-table-wrap {
    flex: 1;
    min-height: 0;
    background: white;
    border: 1.5px solid #E2E8F0;
    border-radius: 12px;
    overflow: auto;
  }

  /* ── State (loading/empty/error) ── */
  .cr-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 240px;
    font-size: 13px;
    color: #94A3B8;
  }
  .cr-state-err { color: #DC2626; }
  .cr-retry {
    background: none; border: none; color: #2563EB;
    font-size: 12.5px; cursor: pointer; text-decoration: underline;
  }

  /* ── Table ── */
  .cr-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .cr-thead-row {
    background: #F8FAFC;
    border-bottom: 1.5px solid #E2E8F0;
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .cr-th {
    padding: 9px 12px;
    text-align: left;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #94A3B8;
    white-space: nowrap;
  }
  .cr-th-check { width: 40px; padding: 9px 0 9px 16px; }
  .cr-th-thumb { width: 52px; padding: 9px 8px; }
  .cr-th-name  { width: auto; }

  .cr-row {
    border-bottom: 1px solid #F1F5F9;
    cursor: pointer;
    transition: background .07s;
  }
  .cr-row:last-child { border-bottom: none; }
  .cr-row:hover { background: #F8FAFC; }
  .cr-row-sel { background: #EFF6FF; }
  .cr-row-sel:hover { background: #DBEAFE; }

  .cr-td {
    padding: 10px 12px;
    vertical-align: middle;
    color: #334155;
  }
  .cr-td-check { padding: 10px 0 10px 16px; width: 40px; }
  .cr-td-thumb { padding: 8px; width: 52px; }
  .cr-td-num   { font-variant-numeric: tabular-nums; }
  .cr-td-fmt   { font-size: 11.5px; color: #64748B; font-variant-numeric: tabular-nums; }

  /* ── Checkbox ── */
  .cr-check-wrap {
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .cr-check-wrap input { display: none; }
  .cr-check-box {
    width: 16px;
    height: 16px;
    border: 1.5px solid #CBD5E1;
    border-radius: 4px;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all .1s;
    flex-shrink: 0;
  }
  .cr-check-wrap input:checked + .cr-check-box {
    background: var(--navy, #112853);
    border-color: var(--navy, #112853);
  }
  .cr-check-wrap input:checked + .cr-check-box::after {
    content: '';
    display: block;
    width: 9px;
    height: 6px;
    border-left: 2px solid white;
    border-bottom: 2px solid white;
    transform: rotate(-45deg) translateY(-1px);
  }
  .cr-check-wrap input:indeterminate + .cr-check-box {
    background: var(--navy, #112853);
    border-color: var(--navy, #112853);
  }
  .cr-check-wrap input:indeterminate + .cr-check-box::after {
    content: '';
    display: block;
    width: 8px;
    height: 2px;
    background: white;
  }

  /* ── Thumbnail ── */
  .cr-thumb {
    width: 44px;
    height: 32px;
    border-radius: 6px;
    background: #F1F5F9;
    border: 1px solid #E2E8F0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .cr-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* ── Name cell ── */
  .cr-name {
    font-weight: 500;
    color: #1E293B;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }
  .cr-date {
    font-size: 11px;
    color: #94A3B8;
    margin-top: 1px;
  }

  /* ── Status badge ── */
  .cr-status {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 11.5px;
    font-weight: 500;
    white-space: nowrap;
  }
  .st-green  { background: #DCFCE7; color: #15803D; }
  .st-yellow { background: #FEF9C3; color: #854D0E; }
  .st-red    { background: #FEE2E2; color: #B91C1C; }

  /* ── Spinner ── */
  .cr-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid #E2E8F0;
    border-top-color: #64748B;
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  .cr-spinner-lg { width: 24px; height: 24px; border-width: 3px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Bottom nav ── */
  .cr-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding-top: 4px;
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
  }
  .nav-link:hover { color: var(--navy, #112853); }
  .nav-link-next { color: var(--navy, #112853); font-weight: 600; }

  /* ── Picker modal ── */
  .picker-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .picker-modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,.2);
    width: min(540px, calc(100vw - 32px));
    max-height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1.5px solid #E2E8F0;
    flex-shrink: 0;
  }
  .picker-title { font-size: 15px; font-weight: 700; color: var(--navy, #112853); }
  .picker-close {
    background: none; border: none; cursor: pointer;
    color: #94A3B8; display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 6px; transition: background .1s;
  }
  .picker-close:hover { background: #F1F5F9; color: #475569; }
  .picker-search-row {
    padding: 12px 20px;
    border-bottom: 1px solid #F1F5F9;
    flex-shrink: 0;
  }
  .picker-search { width: 100%; box-sizing: border-box; }
  .picker-list {
    flex: 1;
    overflow-y: auto;
  }
  .picker-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-bottom: 1px solid #F8FAFC;
    cursor: pointer;
    transition: background .07s;
  }
  .picker-row:hover { background: #F8FAFC; }
  .picker-row-sel { background: #EFF6FF; }
  .picker-row-sel:hover { background: #DBEAFE; }
  .picker-check { flex-shrink: 0; accent-color: var(--navy, #112853); }
  .picker-thumb {
    width: 48px; height: 34px;
    border-radius: 6px; background: #F1F5F9;
    border: 1px solid #E2E8F0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; flex-shrink: 0;
  }
  .picker-info { flex: 1; min-width: 0; }
  .picker-name { font-size: 13px; font-weight: 500; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .picker-meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; font-size: 11px; color: #94A3B8; }
  .picker-empty { padding: 40px 20px; text-align: center; color: #94A3B8; font-size: 13px; }
  .picker-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px;
    border-top: 1.5px solid #E2E8F0;
    flex-shrink: 0;
  }
  .picker-sel-count { font-size: 12.5px; color: #64748B; }
</style>
