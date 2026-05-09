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
      // 404 = endpoint not yet mapped; treat as empty library, not a hard error
      if (e?.status === 404) {
        creatives = []
      } else {
        error = 'Не удалось загрузить список креативов'
      }
    } finally {
      loading = false
    }
  }

  // ── Status config ─────────────────────────────────────────────────────
  // The API may return: APPROVED / PENDING / REJECTED / ACTIVE / MODERATION / DECLINED
  const STATUS = {
    APPROVED:   { label: 'Согласован',   cls: 'st-green'  },
    ACTIVE:     { label: 'Согласован',   cls: 'st-green'  },
    PENDING:    { label: 'На модерации', cls: 'st-yellow' },
    MODERATION: { label: 'На модерации', cls: 'st-yellow' },
    REJECTED:   { label: 'Отклонён',     cls: 'st-red'    },
    DECLINED:   { label: 'Отклонён',     cls: 'st-red'    },
  }

  // Canonical key for filtering (collapse aliases)
  function statusKey(raw) {
    if (!raw) return ''
    if (raw === 'ACTIVE')     return 'APPROVED'
    if (raw === 'MODERATION') return 'PENDING'
    if (raw === 'DECLINED')   return 'REJECTED'
    return raw
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
    if (statusFilter !== 'ALL' && statusKey(c.status) !== statusFilter) return false
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
        // Step 1: upload the binary file → get media record back
        const uploaded = await api.creatives.uploadFile(file)
        // Step 2: create the creative record referencing the uploaded media
        const mediaId = uploaded?.id ?? uploaded?.mediaId ?? null
        const payload = {
          name: file.name,
          ...(mediaId ? { mediaId } : {}),
          ...(uploaded?.url  ? { url:  uploaded.url  } : {}),
          ...(draft.customerId ? { customerId: draft.customerId } : {}),
        }
        const created = await api.creatives.create(payload)
        const record = created ?? uploaded  // fall back to upload response if create returns null
        if (record?.id) {
          creatives = [record, ...creatives]
          draft.creativeIds = [...draft.creativeIds, record.id]
        }
      }
    } catch (err) {
      uploadErr = err?.data?.message ?? err?.data ?? 'Ошибка при загрузке файла'
    } finally {
      uploading = false
      e.target.value = ''
    }
  }

  // ── Format helpers ────────────────────────────────────────────────────
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

  <!-- ── Card grid ────────────────────────────────────────────────────── -->
  <div class="cr-grid-wrap">
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
      <div class="cr-grid">
        {#each filtered as c (c.id)}
          {@const sel = isSelected(c.id)}
          {@const sk  = statusKey(c.status)}
          {@const st  = STATUS[c.status] ?? STATUS[sk] ?? { label: c.status ?? '—', cls: '' }}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="cr-card" class:cr-card-sel={sel} on:click={() => toggleSelect(c.id)}>

            <!-- Checkbox -->
            <div class="cr-card-check" on:click|stopPropagation>
              <label class="cr-check-wrap">
                <input type="checkbox" checked={sel} on:change={() => toggleSelect(c.id)} />
                <span class="cr-check-box"></span>
              </label>
            </div>

            <!-- Thumbnail -->
            <div class="cr-card-thumb">
              {#if thumbUrl(c)}
                <img src={thumbUrl(c)} alt={c.name} class="cr-thumb-img" />
              {:else if isVideo(c)}
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                </svg>
              {:else}
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                  <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                </svg>
              {/if}
            </div>

            <!-- Info -->
            <div class="cr-card-info">
              <div class="cr-card-name" title={c.name}>{c.name ?? '—'}</div>

              <!-- Overall status badge -->
              <div class="cr-card-status-row">
                <span class="cr-status-badge {st.cls}">
                  {#if sk === 'APPROVED'}
                    <svg class="st-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                    </svg>
                  {:else if sk === 'PENDING'}
                    <svg class="st-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                    </svg>
                  {:else if sk === 'REJECTED'}
                    <svg class="st-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                    </svg>
                  {/if}
                  {st.label}
                </span>
              </div>

              <!-- Per-file dimensions with individual statuses -->
              {#if c.files?.length}
                <div class="cr-card-files">
                  {#each c.files as f}
                    {@const fk = statusKey(f.status ?? c.status)}
                    <div class="cr-file-row">
                      {#if fk === 'APPROVED'}
                        <svg class="file-icon file-icon-ok" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                      {:else}
                        <svg class="file-icon file-icon-warn" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                      {/if}
                      <span class="cr-file-dim">{f.width && f.height ? `${f.width} x ${f.height}` : '—'}</span>
                    </div>
                  {/each}
                </div>
              {:else if c.width && c.height}
                <div class="cr-card-files">
                  <div class="cr-file-row">
                    {#if sk === 'APPROVED'}
                      <svg class="file-icon file-icon-ok" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                      </svg>
                    {:else}
                      <svg class="file-icon file-icon-warn" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                      </svg>
                    {/if}
                    <span class="cr-file-dim">{c.width} x {c.height}</span>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Bottom nav ───────────────────────────────────────────────────── -->
  <div class="cr-nav">
    <button class="nav-link" on:click={() => dispatch('back')}>Назад</button>
    <button class="nav-link nav-link-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>

</div>

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
  .cr-topbar-left { display: flex; align-items: center; gap: 10px; }
  .cr-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--navy, #112853); }
  .cr-count-badge {
    background: #DBEAFE; color: #1D4ED8;
    font-size: 12px; font-weight: 600;
    padding: 2px 10px; border-radius: 20px;
  }
  .cr-topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  /* ── Buttons ── */
  .cr-btn {
    height: 34px; padding: 0 16px; border-radius: 8px;
    font-size: 13px; font-family: inherit; font-weight: 500;
    cursor: pointer; display: flex; align-items: center; gap: 6px;
    white-space: nowrap; transition: background .12s, border-color .12s, color .12s;
  }
  .cr-btn:disabled { opacity: .6; cursor: default; }
  .cr-btn-ghost { background: white; border: 1.5px solid #CBD5E1; color: #475569; }
  .cr-btn-ghost:hover:not(:disabled) { border-color: var(--navy,#112853); color: var(--navy,#112853); }

  /* ── Error banner ── */
  .cr-error-banner {
    padding: 8px 14px; background: #FEF2F2;
    border: 1px solid #FECACA; border-radius: 8px;
    font-size: 12.5px; color: #DC2626; flex-shrink: 0;
  }

  /* ── Filters ── */
  .cr-filters {
    display: flex; align-items: center;
    justify-content: space-between; gap: 12px; flex-shrink: 0;
  }
  .cr-tabs { display: flex; gap: 4px; }
  .cr-tab {
    height: 30px; padding: 0 14px; border-radius: 20px;
    border: 1.5px solid #E2E8F0; background: white;
    font-size: 12.5px; font-family: inherit; font-weight: 500;
    color: #64748B; cursor: pointer; transition: all .12s; white-space: nowrap;
  }
  .cr-tab:hover { border-color: #94A3B8; color: #334155; }
  .cr-tab-on { background: var(--navy,#112853); border-color: var(--navy,#112853); color: white; }
  .cr-tab-on:hover { background: #1e3a6e; border-color: #1e3a6e; }

  .cr-search-wrap { position: relative; display: flex; align-items: center; }
  .cr-search-icon { position: absolute; left: 10px; color: #94A3B8; pointer-events: none; flex-shrink: 0; }
  .cr-search {
    height: 32px; width: 220px; padding: 0 32px 0 30px;
    border: 1.5px solid #E2E8F0; border-radius: 8px;
    font-size: 13px; font-family: inherit; color: #334155;
    outline: none; background: white; transition: border-color .12s;
  }
  .cr-search:focus { border-color: #93C5FD; }
  .cr-search-clear {
    position: absolute; right: 8px; background: none; border: none;
    color: #94A3B8; font-size: 16px; cursor: pointer; line-height: 1; padding: 0;
  }

  /* ── Grid wrapper ── */
  .cr-grid-wrap {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* ── Card grid ── */
  .cr-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
  }

  /* ── Card ── */
  .cr-card {
    position: relative;
    background: white;
    border: 1.5px solid #E2E8F0;
    border-radius: 10px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    cursor: pointer;
    transition: border-color .1s, background .1s, box-shadow .1s;
  }
  .cr-card:hover { border-color: #94A3B8; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
  .cr-card-sel { border-color: var(--navy,#112853); background: #EFF6FF; }
  .cr-card-sel:hover { border-color: var(--navy,#112853); background: #DBEAFE; }

  /* Checkbox in top-left corner */
  .cr-card-check {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1;
  }

  /* ── Thumbnail ── */
  .cr-card-thumb {
    width: 140px;
    height: 90px;
    flex-shrink: 0;
    border-radius: 7px;
    background: #F1F5F9;
    border: 1px solid #E2E8F0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    margin-top: 2px;
  }
  .cr-thumb-img { width: 100%; height: 100%; object-fit: cover; }

  /* ── Card info ── */
  .cr-card-info { flex: 1; min-width: 0; padding-top: 2px; }
  .cr-card-name {
    font-size: 12.5px;
    font-weight: 600;
    color: #1E293B;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
  }

  /* ── Status badge (overall) ── */
  .cr-card-status-row { margin-bottom: 7px; }
  .cr-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px 2px 5px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .st-icon { width: 12px; height: 12px; flex-shrink: 0; }
  .st-green  { background: #DCFCE7; color: #15803D; }
  .st-yellow { background: #FEF9C3; color: #854D0E; }
  .st-red    { background: #FEE2E2; color: #B91C1C; }

  /* ── Per-file dimensions ── */
  .cr-card-files { display: flex; flex-direction: column; gap: 3px; }
  .cr-file-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .file-icon { width: 13px; height: 13px; flex-shrink: 0; }
  .file-icon-ok   { color: #16A34A; }
  .file-icon-warn { color: #D97706; }
  .cr-file-dim { font-size: 11.5px; color: #475569; font-variant-numeric: tabular-nums; }

  /* ── Checkbox ── */
  .cr-check-wrap { display: flex; align-items: center; cursor: pointer; }
  .cr-check-wrap input { display: none; }
  .cr-check-box {
    width: 16px; height: 16px;
    border: 1.5px solid #CBD5E1; border-radius: 4px;
    background: white; display: flex; align-items: center; justify-content: center;
    transition: all .1s; flex-shrink: 0;
  }
  .cr-check-wrap input:checked + .cr-check-box {
    background: var(--navy,#112853); border-color: var(--navy,#112853);
  }
  .cr-check-wrap input:checked + .cr-check-box::after {
    content: ''; display: block; width: 9px; height: 6px;
    border-left: 2px solid white; border-bottom: 2px solid white;
    transform: rotate(-45deg) translateY(-1px);
  }

  /* ── State (loading / empty / error) ── */
  .cr-state {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px; height: 240px;
    font-size: 13px; color: #94A3B8;
  }
  .cr-state-err { color: #DC2626; }
  .cr-retry {
    background: none; border: none; color: #2563EB;
    font-size: 12.5px; cursor: pointer; text-decoration: underline;
  }

  /* ── Spinner ── */
  .cr-spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid #E2E8F0; border-top-color: #64748B;
    border-radius: 50%; animation: spin .7s linear infinite;
  }
  .cr-spinner-lg { width: 24px; height: 24px; border-width: 3px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Bottom nav ── */
  .cr-nav {
    display: flex; align-items: center; justify-content: space-between;
    flex-shrink: 0; padding-top: 4px;
  }
  .nav-link {
    background: none; border: none; font-size: 13px; font-weight: 500;
    color: #64748B; cursor: pointer; padding: 0; transition: color .12s;
  }
  .nav-link:hover { color: var(--navy, #112853); }
  .nav-link-next { color: var(--navy, #112853); font-weight: 600; }
</style>
