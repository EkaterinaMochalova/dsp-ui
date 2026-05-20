<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import { api } from '../../lib/api.js'
  const dispatch = createEventDispatcher()

  export let draft
  export let metrics = { impressions: 0, ots: 0, budget: null }
  export let campaignOwnerIds = new Set()  // display owner IDs in this campaign's segments

  if (!draft.creativeIds)        draft.creativeIds = []
  if (!draft.creativeStatuses)   draft.creativeStatuses = {}   // id → statusKey
  if (!draft.creativeTargeting)  draft.creativeTargeting = {}

  // ── Library state ─────────────────────────────────────────────────────
  let creatives  = []
  let loading    = true
  let loadError  = ''
  let uploading  = false
  let uploadErr  = ''
  let interests       = []   // for audience dropdown
  let dataConditions  = []   // for "Данные" (externalConditionParams)
  let fileInput

  // ── Browse-panel filter state ─────────────────────────────────────────
  let browseSearch = ''
  let statusFilter = 'ALL'

  // ── Right-panel state ─────────────────────────────────────────────────
  let activeId  = draft.creativeIds[0] ?? null
  let activeTab = 'media'          // 'media' | 'conditions' | 'audience' | 'timing'

  // ── Per-vendor segments + detail for active creative ─────────────────
  let activeSegments = []
  let segmentsLoading = false
  let activeDetail = null   // full detail object when list response lacks layout.media

  $: if (activeId) loadActiveData(activeId)

  $: richCreative = activeDetail ?? activeCreative
  $: activeMedia  = richCreative?.layout?.media ?? richCreative?.mediaFiles?.[0] ?? null
  $: activeFile   = activeMedia?.file ?? null

  async function loadActiveData(id) {
    segmentsLoading = true
    activeSegments = []
    activeDetail = null
    try {
      const [segsRes, detailRes] = await Promise.allSettled([
        api.creatives.segments(id),
        api.creatives.detail(id),
      ])
      activeSegments = segsRes.status === 'fulfilled' ? (segsRes.value?.content ?? []) : []
      activeDetail   = detailRes.status === 'fulfilled' ? detailRes.value : null
    } catch { /* non-fatal */ }
    finally { segmentsLoading = false }
  }

  // ── Load data ─────────────────────────────────────────────────────────
  onMount(async () => {
    await loadCreatives()
    loadInterests()
    loadDataConditions()
  })

  async function loadCreatives() {
    loading = true; loadError = ''
    try {
      const params = {}
      if (draft.customerId) params.customerId = draft.customerId
      const res = await api.creatives.list(params)
      creatives = res?.content ?? (Array.isArray(res) ? res : [])
      if (!activeId && draft.creativeIds.length) activeId = draft.creativeIds[0]
    } catch (e) {
      if (e?.status === 404) creatives = []
      else loadError = 'Не удалось загрузить список креативов'
    } finally {
      loading = false
    }
  }

  async function loadInterests() {
    try {
      const res = await api.filters.interests()
      interests = Array.isArray(res) ? res : (res?.content ?? [])
    } catch { interests = [] }
  }

  async function loadDataConditions() {
    try {
      const res = await api.filters.externalConditions()
      dataConditions = Array.isArray(res) ? res : (res?.content ?? [])
    } catch { dataConditions = [] }
  }

  // ── Status config ─────────────────────────────────────────────────────
  const STATUS = {
    NEW:                { label: 'Новый',                    cls: 'st-blue'   },
    APPROVED:           { label: 'Согласован',               cls: 'st-green'  },
    ACTIVE:             { label: 'Согласован',               cls: 'st-green'  },
    PENDING:            { label: 'На модерации',             cls: 'st-yellow' },
    MODERATION:         { label: 'На модерации',             cls: 'st-yellow' },
    PREMODERATION:      { label: 'На модерации',             cls: 'st-yellow' },
    SENT:               { label: 'Отправлен',                cls: 'st-yellow' },
    SENDING:            { label: 'Отправляется',             cls: 'st-yellow' },
    REJECTED:           { label: 'Отклонён',                 cls: 'st-red'    },
    DECLINED:           { label: 'Отклонён',                 cls: 'st-red'    },
    SENDING_ERROR:      { label: 'Ошибка отправки',          cls: 'st-red'    },
    REACTIVATION_ERROR: { label: 'Ошибка активации',         cls: 'st-red'    },
    ERROR:              { label: 'Ошибка',                   cls: 'st-red'    },
    ARCHIVED:           { label: 'Заархивирован',            cls: 'st-grey'   },
    ARCHIVE:            { label: 'Заархивирован',            cls: 'st-grey'   },
  }

  const FILTER_TABS = [
    { key: 'ALL',      label: 'Все'          },
    { key: 'APPROVED', label: 'Согласованы'  },
    { key: 'PENDING',  label: 'На модерации' },
    { key: 'REJECTED', label: 'Отклонён'     },
    { key: 'NEW',      label: 'Новый'        },
  ]

  function statusKey(raw) {
    if (!raw) return ''
    if (raw === 'ACTIVE')                                          return 'APPROVED'
    if (raw === 'MODERATION' || raw === 'PREMODERATION')           return 'PENDING'
    if (raw === 'SENT' || raw === 'SENDING')                       return 'PENDING'
    if (raw === 'DECLINED')                                        return 'REJECTED'
    if (raw === 'SENDING_ERROR' || raw === 'REACTIVATION_ERROR' || raw === 'ERROR') return 'ERROR'
    if (raw === 'ARCHIVE')                                         return 'ARCHIVED'
    return raw
  }

  function getState(obj) { return obj?.state ?? obj?.status ?? '' }

  // ── Derived ───────────────────────────────────────────────────────────
  $: selectedCreatives = creatives.filter(c => draft.creativeIds.includes(c.id))

  // Compute activeCreative without writing back to activeId (avoids cycle)
  $: activeCreative = creatives.find(c => c.id === activeId) ?? null

  $: browseFiltered = creatives.filter(c => {
    const q = browseSearch.trim().toLowerCase()
    if (q && !c.name?.toLowerCase().includes(q)) return false
    const sk = statusKey(getState(c))
    // In "ALL" view hide NEW creatives (not sent to any owner yet) — they can't be attached
    if (statusFilter === 'ALL' && sk === 'NEW') return false
    if (statusFilter !== 'ALL' && sk !== statusFilter) return false
    return true
  })

  // ── Targeting helpers ─────────────────────────────────────────────────
  function getTargeting(id) {
    if (!draft.creativeTargeting[id]) {
      draft.creativeTargeting[id] = {
        documents: [],
        externalConditionParamsId: null,
        gender:    [],
        ageMin:    18,
        ageMax:    80,
        income:    [],
        interests: [],
        minOts:    0,
        weekdays:  [1,2,3,4,5,6,7],
        timeFrom:  '00:00',
        timeTo:    '23:59',
        weatherParams: {
          enabled:   false,
          temp:      { enabled: false, start: -40, end: 40  },
          condition: { enabled: false, values: []            },
          wind:      { enabled: false, start: 0,  end: 32   },
          uvIndex:   { enabled: false, start: 0,  end: 11   },
          aqIndex:   { enabled: false, start: 0,  end: 500  },
        },
        jamParams: {
          level: { enabled: false, start: 1, end: 4 },
        },
      }
      draft.creativeTargeting = { ...draft.creativeTargeting }
    }
    return draft.creativeTargeting[id]
  }

  $: tg = activeId ? getTargeting(activeId) : null
  // Depend on draft.creativeTargeting (replaced by mutate()) not just tg
  // so Svelte re-runs when weatherParams / jamParams change in-place.
  $: wp = draft.creativeTargeting?.[activeId]?.weatherParams ?? tg?.weatherParams
  $: jp = draft.creativeTargeting?.[activeId]?.jamParams     ?? tg?.jamParams

  function mutate() { draft.creativeTargeting = { ...draft.creativeTargeting } }

  function toggleArr(id, field, val) {
    const t = getTargeting(id)
    t[field] = t[field].includes(val) ? t[field].filter(x => x !== val) : [...t[field], val]
    mutate()
  }

  function setField(id, field, val) {
    getTargeting(id)[field] = val
    mutate()
  }

  // Weather / jam helpers
  function setWp(id, field, val) {
    const t = getTargeting(id)
    t.weatherParams = { ...t.weatherParams, [field]: val }
    mutate()
  }
  function setWpSub(id, key, subField, val) {
    const t = getTargeting(id)
    t.weatherParams = { ...t.weatherParams, [key]: { ...t.weatherParams[key], [subField]: val } }
    mutate()
  }
  function toggleCondVal(id, val) {
    const t = getTargeting(id)
    const c = t.weatherParams.condition
    const nv = c.values.includes(val) ? c.values.filter(v => v !== val) : [...c.values, val]
    t.weatherParams = { ...t.weatherParams, condition: { values: nv, enabled: nv.length > 0 } }
    mutate()
  }
  function setJam(id, subField, val) {
    const t = getTargeting(id)
    t.jamParams = { level: { ...t.jamParams.level, [subField]: val } }
    mutate()
  }

  // Documents
  function addDocument(id) {
    const t = getTargeting(id)
    t.documents = [...t.documents, `Документ ${t.documents.length + 1}`]
    mutate()
  }

  function removeDocument(id, idx) {
    const t = getTargeting(id)
    t.documents = t.documents.filter((_, i) => i !== idx)
    mutate()
  }

  // ── Creative selection / removal ──────────────────────────────────────
  function isSelected(id) { return draft.creativeIds.includes(id) }

  function toggleSelect(id) {
    if (isSelected(id)) {
      draft.creativeIds = draft.creativeIds.filter(x => x !== id)
      const { [id]: _, ...rest } = draft.creativeStatuses
      draft.creativeStatuses = rest
    } else {
      draft.creativeIds = [...draft.creativeIds, id]
      const c = creatives.find(c => c.id === id)
      if (c) draft.creativeStatuses = { ...draft.creativeStatuses, [id]: statusKey(getState(c)) }
    }
  }

  function removeCreative(id) {
    draft.creativeIds = draft.creativeIds.filter(x => x !== id)
    if (activeId === id) activeId = draft.creativeIds[0] ?? null
    const { [id]: _, ...rest } = draft.creativeStatuses
    draft.creativeStatuses = rest
  }

  // ── Upload ────────────────────────────────────────────────────────────
  function openUpload() { fileInput?.click() }

  async function handleFiles(e) {
    const files = [...(e.target.files ?? [])]
    if (!files.length) return
    uploading = true; uploadErr = ''
    try {
      for (const file of files) {
        const uploaded = await api.creatives.uploadFile(file)
        const mediaId  = uploaded?.id ?? uploaded?.mediaId ?? null
        const payload  = {
          name: file.name,
          ...(mediaId ? { mediaId } : {}),
          ...(uploaded?.url ? { url: uploaded.url } : {}),
          ...(draft.customerId ? { customerId: draft.customerId } : {}),
        }
        const created = await api.creatives.create(payload)
        const record  = created ?? uploaded
        if (record?.id) {
          creatives = [record, ...creatives]
          draft.creativeIds = [...draft.creativeIds, record.id]
          draft.creativeStatuses = { ...draft.creativeStatuses, [record.id]: statusKey(getState(record)) }
          activeId = record.id
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
    const t = (c.mediaType ?? c.type ?? '').toUpperCase()
    if (t === 'VIDEO')   return 'Видео'
    if (t === 'PICTURE' || t === 'IMAGE' || t === 'STATIC') return 'Изображение'
    return c.type ?? '—'
  }

  function durationLabel(c) {
    const d = c.duration ?? c.slotDuration
    if (!d) return '—'
    const sec = d >= 1000 ? Math.round(d / 1000) : d
    return `${sec} сек.`
  }

  function thumbUrl(c) {
    // Primary: layout.media.preview.url (actual API shape from /clients/request-medias)
    const layoutPreview = c.layout?.media?.preview?.url
    if (layoutPreview) return layoutPreview
    // Fallback: layout.media.file url (for static images)
    const layoutFile = c.layout?.media?.file?.url
    if (layoutFile) return layoutFile
    // Legacy/other shapes
    const first = c.mediaContents?.[0] ?? c.files?.[0]
    const firstFile = first?.mediaContent?.file ?? first
    return (
      c.thumbnailUrl ?? c.previewUrl ??
      firstFile?.previewUrl ?? firstFile?.url ?? firstFile?.thumbnailUrl ??
      first?.previewUrl ?? first?.url ??
      c.url ?? null
    )
  }

  function isVideo(c) {
    return (c.mediaType ?? c.type ?? '').toUpperCase() === 'VIDEO'
  }

  function getFileList(c) {
    return c.mediaContents?.length ? c.mediaContents : (c.files ?? [])
  }

  function mediaCount(c) {
    const n = getFileList(c).length
    if (n === 0) return '1 медиафайл'
    if (n % 10 === 1 && n % 100 !== 11) return `${n} медиафайл`
    if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return `${n} медиафайла`
    return `${n} медиафайлов`
  }

  function formatSize(bytes) {
    if (!bytes) return null
    if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' МБ'
    if (bytes >= 1_000)     return (bytes / 1_000).toFixed(0) + ' КБ'
    return bytes + ' Б'
  }

  function formatDuration(ms) {
    if (!ms) return null
    const sec = ms >= 1000 ? Math.round(ms / 1000) : ms
    return sec + ' сек.'
  }

  const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
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

  <!-- ── Top bar ──────────────────────────────────────────────────────── -->
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
          Загрузить
        {/if}
      </button>
    </div>
  </div>

  {#if uploadErr}
    <div class="cr-error-banner">{uploadErr}</div>
  {/if}

  <!-- ── Main two-panel area ──────────────────────────────────────────── -->
  <div class="cr-layout">

    <!-- ── LEFT: browse & select ──────────────────────────────────────── -->
    <div class="cr-browse">

      <!-- Search + filter -->
      <div class="cr-browse-filters">
        <div class="cr-search-wrap">
          <svg class="cr-search-icon" width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
          </svg>
          <input class="cr-search" type="text" placeholder="Поиск" bind:value={browseSearch} />
          {#if browseSearch}
            <button class="cr-search-clear" on:click={() => browseSearch = ''}>×</button>
          {/if}
        </div>
        <div class="cr-tabs">
          {#each FILTER_TABS as tab}
            <button
              class="cr-tab"
              class:cr-tab-on={statusFilter === tab.key}
              on:click={() => statusFilter = tab.key}
            >{tab.label}</button>
          {/each}
        </div>
      </div>

      <!-- Card list -->
      <div class="cr-browse-list">
        {#if loading}
          <div class="cr-state-inline"><span class="cr-spinner cr-spinner-lg"></span></div>
        {:else if loadError}
          <div class="cr-state-inline cr-state-err">
            {loadError}
            <button class="cr-retry" on:click={loadCreatives}>Повторить</button>
          </div>
        {:else if browseFiltered.length === 0}
          <div class="cr-state-inline">
            {#if creatives.length === 0}Нет загруженных материалов{:else}Ничего не найдено{/if}
          </div>
        {:else}
          {#each browseFiltered as c (c.id)}
            {@const sel = isSelected(c.id)}
            {@const sk  = statusKey(getState(c))}
            {@const st  = STATUS[getState(c)] ?? STATUS[sk] ?? { label: getState(c) || '—', cls: '' }}
            {@const isArchived = sk === 'ARCHIVED'}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="cr-browse-card"
              class:cr-browse-card-sel={sel}
              class:cr-browse-card-active={activeId === c.id}
              class:cr-browse-card-archived={isArchived}
              on:click={() => { activeId = c.id; if (!sel && !isArchived) toggleSelect(c.id) }}
            >
              <!-- Checkbox (stops propagation so click doesn't re-activate) -->
              <div class="cr-browse-check" on:click|stopPropagation>
                <label class="cr-check-wrap" class:cr-check-disabled={isArchived}>
                  <input type="checkbox" checked={sel} disabled={isArchived}
                    on:change={() => { if (!isArchived) { toggleSelect(c.id); if (!sel) activeId = c.id } }} />
                  <span class="cr-check-box"></span>
                </label>
              </div>

              <!-- Thumb -->
              <div class="cr-browse-thumb">
                {#if thumbUrl(c)}
                  <img src={thumbUrl(c)} alt={c.name} style="width:100%;height:100%;object-fit:cover"/>
                {:else if isVideo(c)}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                  </svg>
                {:else}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                    <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                  </svg>
                {/if}
              </div>

              <!-- Info -->
              <div class="cr-browse-info">
                <div class="cr-browse-name" title={c.name}>{c.name ?? '—'}</div>
                <span class="cr-status-badge {st.cls}">{st.label}</span>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- ── RIGHT: targeting panel ──────────────────────────────────────── -->
    <div class="cr-target">
      {#if !activeCreative}
        <div class="cr-target-empty">
          <svg width="36" height="36" viewBox="0 0 20 20" fill="currentColor" style="color:#CBD5E1">
            <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
          </svg>
          <div style="font-weight:600;color:#475569;margin-top:6px">Выберите материал</div>
          <div style="font-size:12px;color:#94A3B8;margin-top:2px">Нажмите на карточку слева для настройки таргетинга</div>
        </div>
      {:else}
        {@const tgt = getTargeting(activeCreative.id)}

        <!-- Header -->
        <div class="cr-detail-head">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <span class="cr-detail-name">{activeCreative.name}</span>
            {#if isSelected(activeCreative.id)}
              <span class="cr-selected-badge">В кампании</span>
            {:else}
              <button class="cr-add-to-camp" on:click={() => toggleSelect(activeCreative.id)}>
                + Добавить в кампанию
              </button>
            {/if}
          </div>
          <button class="cr-detail-del" on:click={() => removeCreative(activeCreative.id)} title="Убрать из кампании">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
          </button>
        </div>

        <!-- Meta -->
        <div class="cr-detail-meta">
          <div class="cr-meta-block">
            <div class="cr-meta-label">Тип</div>
            <div class="cr-meta-val">{mediaTypeLabel(activeCreative)}</div>
            <div class="cr-meta-label" style="margin-top:10px">Длительность</div>
            <div class="cr-meta-val">{durationLabel(activeCreative)}</div>
          </div>
          {#if false}<!-- Дополнительные документы hidden for now -->
          <div class="cr-meta-block">
            <div class="cr-meta-label">Дополнительные документы</div>
            <div class="cr-docs">
              {#each tgt.documents as doc, i}
                <span class="cr-doc-chip">
                  {doc}
                  <button class="cr-doc-del" on:click={() => removeDocument(activeCreative.id, i)}>×</button>
                </span>
              {/each}
              <button class="cr-add-doc" on:click={() => addDocument(activeCreative.id)}>
                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                </svg>
                Добавить документ
              </button>
            </div>
          </div>
          {/if}
        </div>

        <!-- Tabs -->
        <div class="cr-tab-bar">
          {#each [
            { k:'media',      l:'Медиафайлы' },
            { k:'conditions', l:'Условия показа' },
            { k:'audience',   l:'Аудитория' },
            { k:'timing',     l:'Временной таргетинг' },
          ] as tab}
            <button
              class="cr-tab-btn"
              class:cr-tab-active={activeTab === tab.k}
              on:click={() => activeTab = tab.k}
            >{tab.l}</button>
          {/each}
        </div>

        <!-- ── Tab: Медиафайлы ─────────────────────────────────────── -->
        {#if activeTab === 'media'}
          <div class="cr-tab-body">
            <!-- File card -->
            {#if activeMedia}
              <div class="cr-file-card">
                <!-- Preview thumb -->
                <div class="cr-file-thumb">
                  {#if thumbUrl(richCreative)}
                    <img src={thumbUrl(richCreative)} alt={activeMedia.name} style="width:100%;height:100%;object-fit:cover;border-radius:6px"/>
                  {:else if isVideo(richCreative)}
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                    </svg>
                  {:else}
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                      <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                    </svg>
                  {/if}
                </div>

                <!-- File details -->
                <div class="cr-file-details">
                  <div class="cr-file-name">{activeMedia.name ?? '—'}</div>
                  <div class="cr-file-meta-row">
                    {#if activeMedia.type}
                      <span class="cr-file-chip">{activeMedia.type === 'VIDEO' ? 'Видео' : 'Изображение'}</span>
                    {/if}
                    {#if activeFile?.resolution?.width && activeFile?.resolution?.height}
                      <span class="cr-file-chip">{activeFile.resolution.width}×{activeFile.resolution.height}</span>
                    {/if}
                    {#if formatDuration(activeMedia.duration)}
                      <span class="cr-file-chip">{formatDuration(activeMedia.duration)}</span>
                    {/if}
                    {#if formatSize(activeFile?.size)}
                      <span class="cr-file-chip">{formatSize(activeFile.size)}</span>
                    {/if}
                    {#if activeMedia.compatibleInventoryTypes?.length}
                      <span class="cr-file-chip" style="color:#64748B">{activeMedia.compatibleInventoryTypes.join(', ')}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}

            <!-- Vendor approval -->
            <div class="cr-section-label" style="margin-top:16px;margin-bottom:8px">Согласование по владельцам</div>
            {#if segmentsLoading}
              <div style="display:flex;align-items:center;gap:8px;color:#94A3B8;font-size:12.5px">
                <span class="cr-spinner"></span> Загрузка…
              </div>
            {:else if activeSegments.length === 0}
              <div style="font-size:12.5px;color:#94A3B8">Не отправлен ни одному владельцу</div>
            {:else}
              {@const matchingSegs = campaignOwnerIds.size > 0
                ? activeSegments.filter(s => campaignOwnerIds.has(s.displayOwner?.id))
                : activeSegments}
              {#if campaignOwnerIds.size > 0 && matchingSegs.length === 0}
                <div class="cr-no-match-warn">
                  ⚠️ Ни один из согласованных владельцев не входит в кампанию — креатив не будет прикреплён
                </div>
              {/if}
              {#each activeSegments as seg}
                {@const sk = statusKey(seg.state ?? '')}
                {@const st = STATUS[seg.state] ?? STATUS[sk] ?? { label: seg.state ?? '—', cls: '' }}
                {@const inCampaign = campaignOwnerIds.size === 0 || campaignOwnerIds.has(seg.displayOwner?.id)}
                <div class="cr-vendor-row" class:cr-vendor-row-dim={!inCampaign}>
                  <div class="cr-vendor-name">{seg.displayOwner?.name ?? `Владелец ${seg.id}`}</div>
                  <span class="cr-status-badge {st.cls}" style="font-size:10.5px">{st.label}</span>
                  {#if !inCampaign}<span style="font-size:10px;color:#94A3B8;flex-shrink:0">не в кампании</span>{/if}
                </div>
              {/each}
            {/if}
          </div>

        <!-- ── Tab: Условия показа ──────────────────────────────────── -->
        {:else if activeTab === 'conditions'}
          <div class="cr-tab-body">
            <p class="cr-tab-note">Стоимость использования данных будет рассчитана после завершения рекламной кампании.</p>

            <!-- ── Погода ── -->
            <div class="cr-cond-block">
              <div class="cr-cond-row">
                <span class="cr-section-label" style="margin:0">Погода</span>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="cr-toggle" class:cr-toggle-on={wp.enabled}
                  on:click={() => setWp(activeCreative.id, 'enabled', !wp.enabled)}
                  role="switch" aria-checked={wp.enabled}>
                  <div class="cr-toggle-thumb"></div>
                </div>
              </div>

              {#if wp.enabled}
                <!-- Condition chips -->
                <div class="cr-cond-sub">
                  <div class="cr-cond-sub-label">Условие погоды</div>
                  <div class="cr-chip-row" style="flex-wrap:wrap;gap:6px">
                    {#each [
                      { v:'Clear',        l:'Ясно',     e:'☀️' },
                      { v:'Clouds',       l:'Облачно',  e:'☁️' },
                      { v:'Rain',         l:'Дождь',    e:'🌧️' },
                      { v:'Drizzle',      l:'Морось',   e:'🌦️' },
                      { v:'Thunderstorm', l:'Гроза',    e:'⛈️' },
                      { v:'Snow',         l:'Снег',     e:'🌨️' },
                    ] as w}
                      <!-- svelte-ignore a11y-click-events-have-key-events -->
                      <button class="cr-chip" class:cr-chip-on={wp.condition.values.includes(w.v)}
                        on:click={() => toggleCondVal(activeCreative.id, w.v)}
                      >{w.e} {w.l}{#if wp.condition.values.includes(w.v)} <span class="cr-chip-x">×</span>{/if}</button>
                    {/each}
                  </div>
                </div>

                <!-- Temp -->
                <div class="cr-cond-sub">
                  <div class="cr-cond-row">
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="cr-toggle cr-toggle-sm" class:cr-toggle-on={wp.temp.enabled}
                      on:click={() => setWpSub(activeCreative.id,'temp','enabled',!wp.temp.enabled)}
                      role="switch" aria-checked={wp.temp.enabled}><div class="cr-toggle-thumb"></div></div>
                    <span class="cr-cond-sub-label">Температура, °C</span>
                  </div>
                  {#if wp.temp.enabled}
                    <div class="cr-range-row" style="margin-top:8px">
                      <div class="cr-range-field"><label class="cr-range-label">От</label>
                        <input class="cr-range-input" type="number" min="-80" max="60" value={wp.temp.start}
                          on:input={e=>setWpSub(activeCreative.id,'temp','start',+e.target.value)} /></div>
                      <div class="cr-range-field"><label class="cr-range-label">До</label>
                        <input class="cr-range-input" type="number" min="-80" max="60" value={wp.temp.end}
                          on:input={e=>setWpSub(activeCreative.id,'temp','end',+e.target.value)} /></div>
                    </div>
                  {/if}
                </div>

                <!-- Wind -->
                <div class="cr-cond-sub">
                  <div class="cr-cond-row">
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="cr-toggle cr-toggle-sm" class:cr-toggle-on={wp.wind.enabled}
                      on:click={() => setWpSub(activeCreative.id,'wind','enabled',!wp.wind.enabled)}
                      role="switch" aria-checked={wp.wind.enabled}><div class="cr-toggle-thumb"></div></div>
                    <span class="cr-cond-sub-label">Скорость ветра, м/с</span>
                  </div>
                  {#if wp.wind.enabled}
                    <div class="cr-range-row" style="margin-top:8px">
                      <div class="cr-range-field"><label class="cr-range-label">От</label>
                        <input class="cr-range-input" type="number" min="0" max="100" value={wp.wind.start}
                          on:input={e=>setWpSub(activeCreative.id,'wind','start',+e.target.value)} /></div>
                      <div class="cr-range-field"><label class="cr-range-label">До</label>
                        <input class="cr-range-input" type="number" min="0" max="100" value={wp.wind.end}
                          on:input={e=>setWpSub(activeCreative.id,'wind','end',+e.target.value)} /></div>
                    </div>
                  {/if}
                </div>

                <!-- UV Index -->
                <div class="cr-cond-sub">
                  <div class="cr-cond-row">
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="cr-toggle cr-toggle-sm" class:cr-toggle-on={wp.uvIndex.enabled}
                      on:click={() => setWpSub(activeCreative.id,'uvIndex','enabled',!wp.uvIndex.enabled)}
                      role="switch" aria-checked={wp.uvIndex.enabled}><div class="cr-toggle-thumb"></div></div>
                    <span class="cr-cond-sub-label">УФ-индекс (0–11)</span>
                  </div>
                  {#if wp.uvIndex.enabled}
                    <div class="cr-range-row" style="margin-top:8px">
                      <div class="cr-range-field"><label class="cr-range-label">От</label>
                        <input class="cr-range-input" type="number" min="0" max="11" value={wp.uvIndex.start}
                          on:input={e=>setWpSub(activeCreative.id,'uvIndex','start',+e.target.value)} /></div>
                      <div class="cr-range-field"><label class="cr-range-label">До</label>
                        <input class="cr-range-input" type="number" min="0" max="11" value={wp.uvIndex.end}
                          on:input={e=>setWpSub(activeCreative.id,'uvIndex','end',+e.target.value)} /></div>
                    </div>
                  {/if}
                </div>

                <!-- AQ Index -->
                <div class="cr-cond-sub">
                  <div class="cr-cond-row">
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="cr-toggle cr-toggle-sm" class:cr-toggle-on={wp.aqIndex.enabled}
                      on:click={() => setWpSub(activeCreative.id,'aqIndex','enabled',!wp.aqIndex.enabled)}
                      role="switch" aria-checked={wp.aqIndex.enabled}><div class="cr-toggle-thumb"></div></div>
                    <span class="cr-cond-sub-label">Качество воздуха (AQI)</span>
                  </div>
                  {#if wp.aqIndex.enabled}
                    <div class="cr-range-row" style="margin-top:8px">
                      <div class="cr-range-field"><label class="cr-range-label">От</label>
                        <input class="cr-range-input" type="number" min="0" max="500" value={wp.aqIndex.start}
                          on:input={e=>setWpSub(activeCreative.id,'aqIndex','start',+e.target.value)} /></div>
                      <div class="cr-range-field"><label class="cr-range-label">До</label>
                        <input class="cr-range-input" type="number" min="0" max="500" value={wp.aqIndex.end}
                          on:input={e=>setWpSub(activeCreative.id,'aqIndex','end',+e.target.value)} /></div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- ── Пробки ── -->
            <div class="cr-cond-block">
              <div class="cr-cond-row">
                <span class="cr-section-label" style="margin:0">Пробки</span>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="cr-toggle" class:cr-toggle-on={jp.level.enabled}
                  on:click={() => setJam(activeCreative.id,'enabled',!jp.level.enabled)}
                  role="switch" aria-checked={jp.level.enabled}>
                  <div class="cr-toggle-thumb"></div>
                </div>
              </div>
              {#if jp.level.enabled}
                <div class="cr-cond-sub">
                  <div class="cr-cond-sub-label">Уровень пробок (1–4)</div>
                  <div class="cr-range-row" style="margin-top:8px">
                    <div class="cr-range-field"><label class="cr-range-label">От</label>
                      <input class="cr-range-input" type="number" min="1" max="4" value={jp.level.start}
                        on:input={e=>setJam(activeCreative.id,'start',+e.target.value)} /></div>
                    <div class="cr-range-field"><label class="cr-range-label">До</label>
                      <input class="cr-range-input" type="number" min="1" max="4" value={jp.level.end}
                        on:input={e=>setJam(activeCreative.id,'end',+e.target.value)} /></div>
                  </div>
                </div>
              {/if}
            </div>
          </div>

        <!-- ── Tab: Аудитория ──────────────────────────────────────── -->
        {:else if activeTab === 'audience'}
          <div class="cr-tab-body">
            <p class="cr-tab-note">Стоимость использования данных будет рассчитана после завершения рекламной кампании.</p>

            <div class="cr-section-label">Пол</div>
            <div class="cr-chip-row">
              {#each [{v:'MALE',l:'Мужской'},{v:'FEMALE',l:'Женский'}] as g}
                <button class="cr-chip" class:cr-chip-on={tgt.gender.includes(g.v)}
                  on:click={() => toggleArr(activeCreative.id,'gender',g.v)}
                >{g.l}{#if tgt.gender.includes(g.v)} <span class="cr-chip-x">×</span>{/if}</button>
              {/each}
            </div>

            <div class="cr-section-label" style="margin-top:14px">Возраст</div>
            <div class="cr-range-row">
              <div class="cr-range-field">
                <label class="cr-range-label">От</label>
                <input class="cr-range-input" type="number" min="0" max="100" value={tgt.ageMin}
                  on:input={e => setField(activeCreative.id,'ageMin',+e.target.value)} />
              </div>
              <div class="cr-range-field">
                <label class="cr-range-label">До</label>
                <input class="cr-range-input" type="number" min="0" max="100" value={tgt.ageMax}
                  on:input={e => setField(activeCreative.id,'ageMax',+e.target.value)} />
              </div>
            </div>

            <div class="cr-section-label" style="margin-top:14px">Доход</div>
            <div class="cr-chip-row">
              {#each [{v:'HIGH',l:'Высокий A'},{v:'MEDIUM',l:'Средний B'},{v:'LOW',l:'Низкий C'}] as inc}
                <button class="cr-chip" class:cr-chip-on={tgt.income.includes(inc.v)}
                  on:click={() => toggleArr(activeCreative.id,'income',inc.v)}
                >{inc.l}{#if tgt.income.includes(inc.v)} <span class="cr-chip-x">×</span>{/if}</button>
              {/each}
            </div>

            <div class="cr-section-label" style="margin-top:14px">Интересы</div>
            <div class="cr-interests-wrap">
              {#if tgt.interests.length}
                <div class="cr-chip-row" style="margin-bottom:6px">
                  {#each tgt.interests as int, i}
                    <span class="cr-doc-chip">{int}
                      <button class="cr-doc-del" on:click={() => {
                        const t = getTargeting(activeCreative.id)
                        t.interests = t.interests.filter((_,j)=>j!==i); mutate()
                      }}>×</button>
                    </span>
                  {/each}
                </div>
              {/if}
              {#if interests.length > 0}
                <select class="cr-interests-select"
                  on:change={e => {
                    const val = e.target.value; if (!val) return
                    const t = getTargeting(activeCreative.id)
                    if (!t.interests.includes(val)) { t.interests=[...t.interests,val]; mutate() }
                    e.target.value = ''
                  }}>
                  <option value="">Выберите интересы</option>
                  {#each interests as int}<option value={int.name??int.id??int}>{int.name??int}</option>{/each}
                </select>
              {:else}
                <input class="cr-range-input" type="text" placeholder="Введите и нажмите Enter"
                  on:keydown={e => {
                    if (e.key!=='Enter'||!e.target.value.trim()) return
                    const t=getTargeting(activeCreative.id)
                    if(!t.interests.includes(e.target.value.trim())){t.interests=[...t.interests,e.target.value.trim()];mutate()}
                    e.target.value=''
                  }} />
              {/if}
            </div>

            <div class="cr-section-label" style="margin-top:14px">Данные</div>
            <div class="cr-interests-wrap">
              {#if dataConditions.length > 0}
                <select class="cr-interests-select"
                  value={tgt.externalConditionParamsId ?? ''}
                  on:change={e => { setField(activeCreative.id, 'externalConditionParamsId', e.target.value ? +e.target.value : null) }}>
                  <option value="">Не выбрано</option>
                  {#each dataConditions as dc}
                    <option value={dc.id ?? dc}>{dc.name ?? dc.title ?? dc.id ?? dc}</option>
                  {/each}
                </select>
                {#if tgt.externalConditionParamsId}
                  <button class="cr-add-doc" style="margin-top:4px" on:click={() => setField(activeCreative.id,'externalConditionParamsId',null)}>
                    × Сбросить
                  </button>
                {/if}
              {:else}
                <div style="font-size:12.5px;color:#94A3B8">Нет доступных условий</div>
              {/if}
            </div>

            <div class="cr-section-label" style="margin-top:14px">Минимальный OTS целевой аудитории</div>
            <input class="cr-range-input" type="number" min="0" style="margin-top:6px;max-width:200px"
              value={tgt.minOts}
              on:input={e => setField(activeCreative.id,'minOts',+e.target.value)} />
          </div>

        <!-- ── Tab: Временной таргетинг ────────────────────────────── -->
        {:else if activeTab === 'timing'}
          <div class="cr-tab-body">
            <div class="cr-section-label">Дни недели</div>
            <div class="cr-chip-row">
              {#each WEEKDAYS as day, i}
                {@const num = i+1}
                <button class="cr-chip cr-chip-day" class:cr-chip-on={tgt.weekdays.includes(num)}
                  on:click={() => toggleArr(activeCreative.id,'weekdays',num)}
                >{day}</button>
              {/each}
            </div>
            <div class="cr-section-label" style="margin-top:16px">Время показа</div>
            <div class="cr-range-row" style="margin-top:8px">
              <div class="cr-range-field">
                <label class="cr-range-label">С</label>
                <input class="cr-range-input" type="time" value={tgt.timeFrom}
                  on:change={e => setField(activeCreative.id,'timeFrom',e.target.value)} />
              </div>
              <div class="cr-range-field">
                <label class="cr-range-label">До</label>
                <input class="cr-range-input" type="time" value={tgt.timeTo}
                  on:change={e => setField(activeCreative.id,'timeTo',e.target.value)} />
              </div>
            </div>
          </div>
        {/if}

      {/if}
    </div><!-- cr-target -->

  </div><!-- cr-layout -->

  <!-- ── Bottom nav ───────────────────────────────────────────────────── -->
  <div class="cr-nav">
    <button class="nav-link" on:click={() => dispatch('back')}>Назад</button>
    <button class="btn-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>

</div><!-- cr-wrap -->

<style>
  /* ── Outer shell ── */
  .cr-wrap {
    display: flex; flex-direction: column;
    height: 100%; padding: 20px 24px 16px;
    box-sizing: border-box; gap: 10px; overflow: hidden;
  }

  /* ── Top bar ── */
  .cr-topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-shrink:0; }
  .cr-topbar-left { display:flex; align-items:center; gap:10px; }
  .cr-title { margin:0; font-size:19px; font-weight:700; color:var(--navy,#112853); }
  .cr-count-badge { background:#DBEAFE; color:#1D4ED8; font-size:12px; font-weight:600; padding:2px 10px; border-radius:20px; }
  .cr-topbar-right { display:flex; gap:8px; flex-shrink:0; }

  /* ── Buttons ── */
  .cr-btn { height:34px; padding:0 16px; border-radius:8px; font-size:13px; font-family:inherit; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:6px; white-space:nowrap; transition:background .12s,border-color .12s,color .12s; }
  .cr-btn:disabled { opacity:.6; cursor:default; }
  .cr-btn-ghost { background:white; border:1.5px solid #CBD5E1; color:#475569; }
  .cr-btn-ghost:hover:not(:disabled) { border-color:var(--navy,#112853); color:var(--navy,#112853); }

  /* ── Error banner ── */
  .cr-error-banner { padding:8px 14px; background:#FEF2F2; border:1px solid #FECACA; border-radius:8px; font-size:12.5px; color:#DC2626; flex-shrink:0; }

  /* ── Two-panel layout ── */
  .cr-layout { display:flex; gap:14px; flex:1; min-height:0; }

  /* ══════════ LEFT: Browse panel ══════════ */
  .cr-browse {
    width: 300px; flex-shrink:0;
    display:flex; flex-direction:column; gap:8px; overflow:hidden;
  }

  .cr-browse-filters { display:flex; flex-direction:column; gap:6px; flex-shrink:0; }

  /* Search */
  .cr-search-wrap { position:relative; display:flex; align-items:center; }
  .cr-search-icon { position:absolute; left:9px; color:#94A3B8; pointer-events:none; }
  .cr-search {
    height:30px; width:100%; padding:0 28px 0 28px;
    border:1.5px solid #E2E8F0; border-radius:8px;
    font-size:12.5px; font-family:inherit; color:#334155;
    outline:none; background:white; transition:border-color .12s;
  }
  .cr-search:focus { border-color:#93C5FD; }
  .cr-search-clear { position:absolute; right:8px; background:none; border:none; color:#94A3B8; font-size:15px; cursor:pointer; padding:0; }

  /* Status filter tabs */
  .cr-tabs { display:flex; flex-wrap:wrap; gap:4px; }
  .cr-tab {
    height:26px; padding:0 10px; border-radius:20px;
    border:1.5px solid #E2E8F0; background:white;
    font-size:11.5px; font-family:inherit; font-weight:500;
    color:#64748B; cursor:pointer; transition:all .12s; white-space:nowrap;
  }
  .cr-tab:hover { border-color:#94A3B8; color:#334155; }
  .cr-tab-on { background:var(--navy,#112853); border-color:var(--navy,#112853); color:white; }

  /* Browse list */
  .cr-browse-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:5px; }

  /* Inline state */
  .cr-state-inline { display:flex; flex-direction:column; align-items:center; gap:8px; padding:32px 0; font-size:12.5px; color:#94A3B8; text-align:center; }
  .cr-state-err { color:#DC2626; }
  .cr-retry { background:none; border:none; color:#2563EB; font-size:12px; cursor:pointer; text-decoration:underline; }

  /* Browse card */
  .cr-browse-card {
    display:flex; align-items:center; gap:9px;
    padding:8px 10px; border-radius:8px;
    border:1.5px solid #E2E8F0; background:white;
    cursor:pointer; transition:border-color .1s, background .1s; flex-shrink:0;
  }
  .cr-browse-card:hover { border-color:#94A3B8; }
  .cr-browse-card-sel { background:#EFF6FF; }
  .cr-browse-card-active { border-color:var(--navy,#112853) !important; }
  .cr-browse-card-archived { opacity:.5; cursor:default; }
  .cr-browse-card-archived:hover { border-color:#E2E8F0; }
  .cr-check-disabled { cursor:not-allowed; }

  .cr-browse-check { flex-shrink:0; }
  .cr-browse-thumb {
    width:44px; height:32px; flex-shrink:0;
    border-radius:5px; background:#F1F5F9; border:1px solid #E2E8F0;
    display:flex; align-items:center; justify-content:center; overflow:hidden;
  }
  .cr-browse-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
  .cr-browse-name { font-size:12px; font-weight:600; color:#1E293B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* Status badge */
  .cr-status-badge { display:inline-flex; align-items:center; padding:1px 7px; border-radius:20px; font-size:10.5px; font-weight:600; white-space:nowrap; align-self:flex-start; }
  .st-blue   { background:#DBEAFE; color:#1D4ED8; }
  .st-green  { background:#DCFCE7; color:#15803D; }
  .st-yellow { background:#FEF9C3; color:#854D0E; }
  .st-red    { background:#FEE2E2; color:#B91C1C; }
  .st-grey   { background:#F1F5F9; color:#64748B; }

  /* ══════════ RIGHT: Targeting panel ══════════ */
  .cr-target {
    flex:1; min-width:0;
    background:white; border:1.5px solid #E2E8F0; border-radius:12px;
    display:flex; flex-direction:column; overflow:hidden;
  }

  /* Empty state */
  .cr-target-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; gap:6px; text-align:center; }

  /* Header */
  .cr-detail-head { display:flex; align-items:center; justify-content:space-between; padding:12px 18px; border-bottom:1px solid #F1F5F9; flex-shrink:0; gap:10px; }
  .cr-detail-name { font-size:15px; font-weight:700; color:var(--navy,#112853); min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cr-selected-badge { background:#DCFCE7; color:#15803D; font-size:11px; font-weight:600; padding:2px 8px; border-radius:20px; white-space:nowrap; flex-shrink:0; }
  .cr-add-to-camp { background:none; border:1.5px solid #2563EB; color:#2563EB; border-radius:6px; font-size:11.5px; font-family:inherit; font-weight:600; padding:2px 10px; cursor:pointer; white-space:nowrap; flex-shrink:0; transition:all .1s; }
  .cr-add-to-camp:hover { background:#EFF6FF; }
  .cr-detail-del { background:none; border:none; cursor:pointer; color:#94A3B8; display:flex; align-items:center; padding:4px; border-radius:5px; transition:background .1s,color .1s; flex-shrink:0; }
  .cr-detail-del:hover { background:#FEE2E2; color:#DC2626; }

  /* Meta */
  .cr-detail-meta { display:flex; gap:20px; padding:12px 18px; border-bottom:1px solid #F1F5F9; flex-shrink:0; flex-wrap:wrap; }
  .cr-meta-block { display:flex; flex-direction:column; }
  .cr-meta-label { font-size:10.5px; color:#94A3B8; font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-bottom:3px; }
  .cr-meta-val   { font-size:13px; color:#334155; font-weight:500; }

  /* Documents */
  .cr-docs { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:4px; }
  .cr-doc-chip { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:#F1F5F9; border:1px solid #E2E8F0; border-radius:6px; font-size:12px; color:#334155; }
  .cr-doc-del { background:none; border:none; cursor:pointer; color:#94A3B8; font-size:14px; line-height:1; padding:0 1px; }
  .cr-doc-del:hover { color:#DC2626; }
  .cr-add-doc { display:inline-flex; align-items:center; gap:4px; background:none; border:none; cursor:pointer; font-size:12px; color:#2563EB; font-family:inherit; padding:0; transition:color .1s; }
  .cr-add-doc:hover { color:#1D4ED8; }

  /* Tabs */
  .cr-tab-bar { display:flex; border-bottom:1.5px solid #E2E8F0; flex-shrink:0; overflow-x:auto; }
  .cr-tab-btn { padding:9px 14px; background:none; border:none; font-size:12.5px; font-family:inherit; font-weight:500; color:#64748B; cursor:pointer; white-space:nowrap; border-bottom:2px solid transparent; margin-bottom:-1.5px; transition:color .1s,border-color .1s; }
  .cr-tab-btn:hover { color:var(--navy,#112853); }
  .cr-tab-active { color:var(--navy,#112853); border-bottom-color:var(--navy,#112853); }

  /* Tab body */
  .cr-tab-body { flex:1; overflow-y:auto; padding:14px 18px; display:flex; flex-direction:column; gap:0; }
  .cr-tab-note { font-size:12px; color:#64748B; margin:0 0 14px; line-height:1.5; }
  .cr-tab-empty { color:#94A3B8; font-size:13px; text-align:center; padding:32px 0; }
  .cr-section-label { font-size:12px; font-weight:600; color:#334155; margin-bottom:7px; }

  /* File card */
  .cr-file-card { display:flex; gap:12px; padding:12px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; margin-bottom:4px; }
  .cr-file-thumb { width:72px; height:52px; flex-shrink:0; border-radius:6px; background:#E2E8F0; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .cr-file-details { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
  .cr-file-name { font-size:12.5px; font-weight:600; color:#1E293B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cr-file-meta-row { display:flex; flex-wrap:wrap; gap:4px; }
  .cr-file-chip { display:inline-flex; align-items:center; padding:1px 7px; border-radius:20px; font-size:10.5px; font-weight:500; background:#E2E8F0; color:#475569; white-space:nowrap; }

  /* Vendor approval */
  .cr-vendor-row { display:flex; align-items:center; justify-content:space-between; padding:7px 0; border-bottom:1px solid #F1F5F9; gap:10px; }
  .cr-vendor-row:last-child { border-bottom:none; }
  .cr-vendor-row-dim { opacity:.45; }
  .cr-vendor-name { font-size:12.5px; color:#334155; font-weight:500; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cr-no-match-warn { font-size:12px; color:#B45309; background:#FFFBEB; border:1px solid #FDE68A; border-radius:6px; padding:8px 10px; margin-bottom:10px; line-height:1.4; }

  /* Chips */
  .cr-chip-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:0; }
  .cr-chip { display:inline-flex; align-items:center; gap:4px; padding:5px 12px; border-radius:20px; border:1.5px solid #E2E8F0; background:white; font-size:12.5px; font-family:inherit; font-weight:500; color:#64748B; cursor:pointer; transition:all .1s; }
  .cr-chip:hover { border-color:#94A3B8; }
  .cr-chip-on { background:#EFF6FF; border-color:var(--navy,#112853); color:var(--navy,#112853); }
  .cr-chip-day { padding:4px 9px; min-width:34px; justify-content:center; font-size:12px; }
  .cr-chip-x { font-size:13px; line-height:1; opacity:.6; }

  /* Toggles */
  .cr-toggle-row { display:flex; align-items:center; justify-content:space-between; padding:11px 0; border-bottom:1px solid #F1F5F9; }
  .cr-toggle-row:last-child { border-bottom:none; }
  .cr-toggle-label { font-size:13px; color:#334155; }
  .cr-toggle { width:36px; height:20px; border-radius:10px; background:#CBD5E1; position:relative; cursor:pointer; transition:background .15s; flex-shrink:0; }
  .cr-toggle-on { background:var(--navy,#112853); }
  .cr-toggle-thumb { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:white; transition:left .15s; box-shadow:0 1px 3px rgba(0,0,0,.2); }
  .cr-toggle-on .cr-toggle-thumb { left:18px; }

  /* Inputs */
  .cr-range-row { display:flex; gap:10px; }
  .cr-range-field { display:flex; flex-direction:column; gap:4px; flex:1; }
  .cr-range-label { font-size:11px; color:#94A3B8; font-weight:500; }
  .cr-range-input { height:34px; padding:0 10px; border:1.5px solid #E2E8F0; border-radius:8px; font-size:13px; font-family:inherit; color:#334155; outline:none; background:#F8FAFC; transition:border-color .1s; }
  .cr-range-input:focus { border-color:#93C5FD; background:white; }
  .cr-interests-wrap { display:flex; flex-direction:column; gap:6px; }
  .cr-interests-select { height:34px; padding:0 10px; border:1.5px solid #E2E8F0; border-radius:8px; font-size:13px; font-family:inherit; color:#334155; background:#F8FAFC; outline:none; cursor:pointer; }

  /* Checkbox */
  .cr-check-wrap { display:flex; align-items:center; cursor:pointer; }
  .cr-check-wrap input { display:none; }
  .cr-check-box { width:15px; height:15px; border:1.5px solid #CBD5E1; border-radius:4px; background:white; display:flex; align-items:center; justify-content:center; transition:all .1s; flex-shrink:0; }
  .cr-check-wrap input:checked + .cr-check-box { background:var(--navy,#112853); border-color:var(--navy,#112853); }
  .cr-check-wrap input:checked + .cr-check-box::after { content:''; display:block; width:8px; height:5px; border-left:2px solid white; border-bottom:2px solid white; transform:rotate(-45deg) translateY(-1px); }

  /* Spinner */
  .cr-spinner { display:inline-block; width:14px; height:14px; border:2px solid #E2E8F0; border-top-color:#64748B; border-radius:50%; animation:spin .7s linear infinite; }
  .cr-spinner-lg { width:24px; height:24px; border-width:3px; }
  @keyframes spin { to { transform:rotate(360deg); } }

  /* Nav */
  .cr-nav { display:flex; align-items:center; justify-content:space-between; flex-shrink:0; padding-top:4px; }
  .nav-link { background:none; border:none; font-size:13px; font-weight:500; color:#64748B; cursor:pointer; padding:0; transition:color .12s; }
  .nav-link:hover { color:var(--navy,#112853); }
  .nav-link-next { color:var(--navy,#112853); font-weight:600; }

  /* ── Conditions tab ── */
  .cr-cond-block {
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .cr-cond-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .cr-cond-sub {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border, #f1f5f9);
  }
  .cr-cond-sub-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
    display: block;
  }
  .cr-toggle-sm {
    width: 32px !important;
    height: 18px !important;
    border-radius: 9px !important;
  }
  .cr-toggle-sm .cr-toggle-thumb {
    width: 12px !important;
    height: 12px !important;
    top: 3px !important;
    left: 3px !important;
  }
  .cr-toggle-sm.cr-toggle-on .cr-toggle-thumb {
    left: 17px !important;
  }
</style>
