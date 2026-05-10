<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import { api } from '../../lib/api.js'
  const dispatch = createEventDispatcher()

  export let draft
  export let metrics = { impressions: 0, ots: 0, budget: null }

  if (!draft.creativeIds)        draft.creativeIds = []
  if (!draft.creativeTargeting)  draft.creativeTargeting = {}

  // ── Library state ─────────────────────────────────────────────────────
  let creatives  = []
  let loading    = true
  let loadError  = ''
  let uploading  = false
  let uploadErr  = ''
  let interests  = []           // for audience dropdown
  let fileInput

  // ── Picker modal state ────────────────────────────────────────────────
  let showPicker   = false
  let pickerSearch = ''
  let statusFilter = 'ALL'

  // ── Right-panel state ─────────────────────────────────────────────────
  let activeId  = draft.creativeIds[0] ?? null
  let activeTab = 'media'          // 'media' | 'conditions' | 'audience' | 'timing'

  // ── Load data ─────────────────────────────────────────────────────────
  onMount(async () => {
    await loadCreatives()
    loadInterests()
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

  // ── Status config ─────────────────────────────────────────────────────
  const STATUS = {
    NEW:                { label: 'Новый',            cls: 'st-blue'   },
    APPROVED:           { label: 'Согласован',       cls: 'st-green'  },
    ACTIVE:             { label: 'Согласован',       cls: 'st-green'  },
    PENDING:            { label: 'На модерации',     cls: 'st-yellow' },
    MODERATION:         { label: 'На модерации',     cls: 'st-yellow' },
    PREMODERATION:      { label: 'На модерации',     cls: 'st-yellow' },
    REJECTED:           { label: 'Отклонён',         cls: 'st-red'    },
    DECLINED:           { label: 'Отклонён',         cls: 'st-red'    },
    SENDING_ERROR:      { label: 'Ошибка отправки',  cls: 'st-red'    },
    REACTIVATION_ERROR: { label: 'Ошибка активации', cls: 'st-red'    },
    ERROR:              { label: 'Ошибка',           cls: 'st-red'    },
    ARCHIVED:           { label: 'Заархивирован',    cls: 'st-grey'   },
    ARCHIVE:            { label: 'Заархивирован',    cls: 'st-grey'   },
  }

  const FILTER_TABS = [
    { key: 'ALL',      label: 'Все'          },
    { key: 'APPROVED', label: 'Согласованы'  },
    { key: 'PENDING',  label: 'На модерации' },
    { key: 'REJECTED', label: 'Отклонён'     },
  ]

  function statusKey(raw) {
    if (!raw) return ''
    if (raw === 'ACTIVE')                                          return 'APPROVED'
    if (raw === 'MODERATION' || raw === 'PREMODERATION')           return 'PENDING'
    if (raw === 'DECLINED')                                        return 'REJECTED'
    if (raw === 'SENDING_ERROR' || raw === 'REACTIVATION_ERROR' || raw === 'ERROR') return 'ERROR'
    if (raw === 'ARCHIVE')                                         return 'ARCHIVED'
    return raw
  }

  function getState(obj) { return obj?.state ?? obj?.status ?? '' }

  // ── Derived ───────────────────────────────────────────────────────────
  $: selectedCreatives = creatives.filter(c => draft.creativeIds.includes(c.id))
  $: activeCreative    = selectedCreatives.find(c => c.id === activeId) ?? null
  $: pickerFiltered    = creatives.filter(c => {
    const q = pickerSearch.trim().toLowerCase()
    if (q && !c.name?.toLowerCase().includes(q)) return false
    if (statusFilter !== 'ALL' && statusKey(getState(c)) !== statusFilter) return false
    return true
  })

  // auto-select first when list changes
  $: if (!activeCreative && selectedCreatives.length) activeId = selectedCreatives[0]?.id

  // ── Targeting helpers ─────────────────────────────────────────────────
  function getTargeting(id) {
    if (!draft.creativeTargeting[id]) {
      draft.creativeTargeting[id] = {
        documents:   [],
        weather:     [],    // array of selected: 'sunny'|'rainy'|'snowy'|'cloudy'
        temperature: false,
        windSpeed:   false,
        uvIndex:     false,
        airQuality:  false,
        traffic:     false,
        gender:      [],    // 'MALE'|'FEMALE'
        ageMin:      18,
        ageMax:      80,
        income:      [],    // 'HIGH'|'MEDIUM'|'LOW'
        interests:   [],
        minOts:      0,
        // timing
        weekdays:    [1,2,3,4,5,6,7],  // 1=Mon..7=Sun
        timeFrom:    '00:00',
        timeTo:      '23:59',
      }
      draft.creativeTargeting = { ...draft.creativeTargeting }
    }
    return draft.creativeTargeting[id]
  }

  $: tg = activeId ? getTargeting(activeId) : null

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
    draft.creativeIds = isSelected(id)
      ? draft.creativeIds.filter(x => x !== id)
      : [...draft.creativeIds, id]
  }

  function removeCreative(id) {
    draft.creativeIds = draft.creativeIds.filter(x => x !== id)
    if (activeId === id) activeId = draft.creativeIds[0] ?? null
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
    const first = c.mediaContents?.[0] ?? c.files?.[0]
    return c.thumbnailUrl ?? c.previewUrl ?? first?.previewUrl ?? first?.url ?? c.url ?? null
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

  <!-- ── Page header ──────────────────────────────────────────────────── -->
  <div class="cr-topbar">
    <div class="cr-topbar-left">
      <h1 class="cr-title">Рекламные материалы и таргетинг</h1>
      {#if selectedCreatives.length > 0}
        <span class="cr-count-badge">{selectedCreatives.length} выбрано</span>
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

  <!-- ── Main area ─────────────────────────────────────────────────────── -->
  {#if loading}
    <div class="cr-state"><span class="cr-spinner cr-spinner-lg"></span> Загрузка…</div>
  {:else if selectedCreatives.length === 0}
    <!-- Empty state -->
    <div class="cr-empty">
      <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor" style="color:#CBD5E1">
        <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
      </svg>
      <div class="cr-empty-title">Рекламные материалы не выбраны</div>
      <div class="cr-empty-sub">Добавьте материалы из библиотеки для настройки таргетинга</div>
      <button class="cr-btn cr-btn-primary" on:click={() => showPicker = true}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
        </svg>
        Рекламные материалы
      </button>
    </div>
  {:else}
    <!-- Two-panel layout -->
    <div class="cr-layout">

      <!-- ── Left panel: selected creatives ──────────────────────────── -->
      <div class="cr-panel-left">
        <button class="cr-add-btn" on:click={() => showPicker = true}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
          </svg>
          Рекламные материалы
        </button>

        <div class="cr-list">
          {#each selectedCreatives as c (c.id)}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="cr-list-item"
              class:cr-list-item-active={activeId === c.id}
              on:click={() => { activeId = c.id; activeTab = 'media' }}
            >
              <div class="cr-list-thumb">
                {#if thumbUrl(c)}
                  <img src={thumbUrl(c)} alt={c.name} style="width:100%;height:100%;object-fit:cover"/>
                {:else if isVideo(c)}
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                  </svg>
                {:else}
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                    <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                  </svg>
                {/if}
              </div>
              <div class="cr-list-info">
                <div class="cr-list-name">{c.name ?? '—'}</div>
                <div class="cr-list-sub">{mediaCount(c)}</div>
              </div>
              {#if activeId === c.id}
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8;flex-shrink:0">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                </svg>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- ── Right panel: targeting config ───────────────────────────── -->
      {#if activeCreative}
        {@const tgt = getTargeting(activeId)}
        <div class="cr-panel-right">

          <!-- Header -->
          <div class="cr-detail-head">
            <span class="cr-detail-name">{activeCreative.name}</span>
            <button class="cr-detail-del" on:click={() => removeCreative(activeId)} title="Удалить">
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
            <div class="cr-meta-block">
              <div class="cr-meta-label">Дополнительные документы</div>
              <div class="cr-docs">
                {#each tgt.documents as doc, i}
                  <span class="cr-doc-chip">
                    {doc}
                    <button class="cr-doc-del" on:click={() => removeDocument(activeId, i)}>×</button>
                  </span>
                {/each}
                <button class="cr-add-doc" on:click={() => addDocument(activeId)}>
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                  </svg>
                  Добавить документ
                </button>
              </div>
            </div>
          </div>

          <!-- Tabs -->
          <div class="cr-tab-bar">
            {#each [
              { k:'media',      l:'Медиафайлы' },
              { k:'conditions', l:'Условия показа' },
              { k:'audience',   l:'Аудитория' },
              { k:'timing',     l:'Временной таргетинг и экраны' },
            ] as tab}
              <button
                class="cr-tab-btn"
                class:cr-tab-active={activeTab === tab.k}
                on:click={() => activeTab = tab.k}
              >{tab.l}</button>
            {/each}
          </div>

          <!-- ── Tab: Медиафайлы ──────────────────────────────────────── -->
          {#if activeTab === 'media'}
            <div class="cr-tab-body">
              {#if getFileList(activeCreative).length === 0}
                <div class="cr-tab-empty">Медиафайлы не найдены</div>
              {:else}
                <div class="cr-media-list">
                  {#each getFileList(activeCreative) as f, i}
                    {@const fk = statusKey(getState(f)) || statusKey(getState(activeCreative))}
                    <div class="cr-media-row">
                      <span class="cr-media-name">{f.name ?? `Файл ${i+1}`}</span>
                      {#if f.width && f.height}
                        <span class="cr-media-dim">{f.width}×{f.height}</span>
                      {/if}
                      {#if fk === 'APPROVED'}
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:#16A34A;flex-shrink:0">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                      {:else if fk}
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:#D97706;flex-shrink:0">
                          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

          <!-- ── Tab: Условия показа ──────────────────────────────────── -->
          {:else if activeTab === 'conditions'}
            <div class="cr-tab-body">
              <p class="cr-tab-note">Стоимость использования данных будет рассчитана после завершения рекламной кампании.</p>

              <!-- Weather chips -->
              <div class="cr-section-label">Погода</div>
              <div class="cr-chip-row">
                {#each [
                  { v:'sunny',  l:'Солнечно', e:'☀️' },
                  { v:'rainy',  l:'Дождь',    e:'🌧️' },
                  { v:'snowy',  l:'Снегопад', e:'🌨️' },
                  { v:'cloudy', l:'Облачно',  e:'☁️' },
                ] as w}
                  <button
                    class="cr-chip"
                    class:cr-chip-on={tgt.weather.includes(w.v)}
                    on:click={() => toggleArr(activeId, 'weather', w.v)}
                  >{w.e} {w.l}{#if tgt.weather.includes(w.v)} <span class="cr-chip-x">×</span>{/if}</button>
                {/each}
              </div>

              <!-- Parameter toggles -->
              {#each [
                { f:'temperature', l:'Температура'           },
                { f:'windSpeed',   l:'Скорость ветра, м/с'  },
                { f:'uvIndex',     l:'УФ-индекс'             },
                { f:'airQuality',  l:'Индекс качества воздуха' },
                { f:'traffic',     l:'Пробки'                },
              ] as row}
                <div class="cr-toggle-row">
                  <span class="cr-toggle-label">{row.l}</span>
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="cr-toggle"
                    class:cr-toggle-on={tgt[row.f]}
                    on:click={() => setField(activeId, row.f, !tgt[row.f])}
                    role="switch"
                    aria-checked={tgt[row.f]}
                  >
                    <div class="cr-toggle-thumb"></div>
                  </div>
                </div>
              {/each}
            </div>

          <!-- ── Tab: Аудитория ──────────────────────────────────────── -->
          {:else if activeTab === 'audience'}
            <div class="cr-tab-body">
              <p class="cr-tab-note">Стоимость использования данных будет рассчитана после завершения рекламной кампании.</p>

              <!-- Gender -->
              <div class="cr-section-label">Пол</div>
              <div class="cr-chip-row">
                {#each [{ v:'MALE', l:'Мужской' }, { v:'FEMALE', l:'Женский' }] as g}
                  <button
                    class="cr-chip"
                    class:cr-chip-on={tgt.gender.includes(g.v)}
                    on:click={() => toggleArr(activeId, 'gender', g.v)}
                  >{g.l}{#if tgt.gender.includes(g.v)} <span class="cr-chip-x">×</span>{/if}</button>
                {/each}
              </div>

              <!-- Age -->
              <div class="cr-section-label" style="margin-top:16px">Возраст</div>
              <div class="cr-range-row">
                <div class="cr-range-field">
                  <label class="cr-range-label">От</label>
                  <input class="cr-range-input" type="number" min="0" max="100"
                    value={tgt.ageMin}
                    on:input={e => setField(activeId, 'ageMin', Number(e.target.value))} />
                </div>
                <div class="cr-range-field">
                  <label class="cr-range-label">До</label>
                  <input class="cr-range-input" type="number" min="0" max="100"
                    value={tgt.ageMax}
                    on:input={e => setField(activeId, 'ageMax', Number(e.target.value))} />
                </div>
              </div>

              <!-- Income -->
              <div class="cr-section-label" style="margin-top:16px">Доход</div>
              <div class="cr-chip-row">
                {#each [
                  { v:'HIGH',   l:'Высокий A' },
                  { v:'MEDIUM', l:'Средний B'  },
                  { v:'LOW',    l:'Низкий C'   },
                ] as inc}
                  <button
                    class="cr-chip"
                    class:cr-chip-on={tgt.income.includes(inc.v)}
                    on:click={() => toggleArr(activeId, 'income', inc.v)}
                  >{inc.l}{#if tgt.income.includes(inc.v)} <span class="cr-chip-x">×</span>{/if}</button>
                {/each}
              </div>

              <!-- Interests -->
              <div class="cr-section-label" style="margin-top:16px">Интересы</div>
              <div class="cr-interests-wrap">
                <div class="cr-interests-selected">
                  {#each tgt.interests as int, i}
                    <span class="cr-doc-chip">
                      {int}
                      <button class="cr-doc-del" on:click={() => {
                        const t = getTargeting(activeId)
                        t.interests = t.interests.filter((_,j) => j !== i)
                        mutate()
                      }}>×</button>
                    </span>
                  {/each}
                </div>
                {#if interests.length > 0}
                  <select class="cr-interests-select"
                    on:change={e => {
                      const val = e.target.value
                      if (!val) return
                      const t = getTargeting(activeId)
                      if (!t.interests.includes(val)) { t.interests = [...t.interests, val]; mutate() }
                      e.target.value = ''
                    }}>
                    <option value="">Выберите интересы</option>
                    {#each interests as int}
                      <option value={int.name ?? int.id ?? int}>{int.name ?? int}</option>
                    {/each}
                  </select>
                {:else}
                  <input class="cr-range-input" type="text" placeholder="Интересы (введите вручную)"
                    on:keydown={e => {
                      if (e.key !== 'Enter' || !e.target.value.trim()) return
                      const t = getTargeting(activeId)
                      if (!t.interests.includes(e.target.value.trim())) {
                        t.interests = [...t.interests, e.target.value.trim()]; mutate()
                      }
                      e.target.value = ''
                    }} />
                {/if}
              </div>

              <!-- Min OTS -->
              <div class="cr-section-label" style="margin-top:16px">Минимальный OTS целевой аудитории</div>
              <input class="cr-range-input" type="number" min="0"
                value={tgt.minOts}
                on:input={e => setField(activeId, 'minOts', Number(e.target.value))}
                style="max-width:100%;margin-top:6px" />
            </div>

          <!-- ── Tab: Временной таргетинг и экраны ───────────────────── -->
          {:else if activeTab === 'timing'}
            <div class="cr-tab-body">
              <div class="cr-section-label">Дни недели</div>
              <div class="cr-chip-row" style="margin-top:8px">
                {#each WEEKDAYS as day, i}
                  {@const num = i + 1}
                  <button
                    class="cr-chip cr-chip-day"
                    class:cr-chip-on={tgt.weekdays.includes(num)}
                    on:click={() => toggleArr(activeId, 'weekdays', num)}
                  >{day}</button>
                {/each}
              </div>

              <div class="cr-section-label" style="margin-top:16px">Время показа</div>
              <div class="cr-range-row" style="margin-top:8px">
                <div class="cr-range-field">
                  <label class="cr-range-label">С</label>
                  <input class="cr-range-input" type="time"
                    value={tgt.timeFrom}
                    on:change={e => setField(activeId, 'timeFrom', e.target.value)} />
                </div>
                <div class="cr-range-field">
                  <label class="cr-range-label">До</label>
                  <input class="cr-range-input" type="time"
                    value={tgt.timeTo}
                    on:change={e => setField(activeId, 'timeTo', e.target.value)} />
                </div>
              </div>
            </div>
          {/if}

        </div><!-- cr-panel-right -->
      {/if}
    </div><!-- cr-layout -->
  {/if}

  <!-- ── Bottom nav ───────────────────────────────────────────────────── -->
  <div class="cr-nav">
    <button class="nav-link" on:click={() => dispatch('back')}>Назад</button>
    <button class="nav-link nav-link-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>

</div><!-- cr-wrap -->

<!-- ═══════════════ Picker modal (card grid) ══════════════════════════ -->
{#if showPicker}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="picker-backdrop" on:mousedown|self={() => showPicker = false}>
    <div class="picker-modal" on:mousedown|stopPropagation>

      <!-- Picker header -->
      <div class="picker-head">
        <span class="picker-title">Рекламные материалы</span>
        <button class="picker-close" on:click={() => showPicker = false}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>

      <!-- Picker filters -->
      <div class="picker-filters">
        <div class="cr-search-wrap" style="flex:1;max-width:320px">
          <svg class="cr-search-icon" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
          </svg>
          <input class="cr-search" type="text" placeholder="Поиск по названию" bind:value={pickerSearch} />
          {#if pickerSearch}
            <button class="cr-search-clear" on:click={() => pickerSearch = ''}>×</button>
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

      <!-- Picker grid -->
      <div class="picker-grid-wrap">
        {#if pickerFiltered.length === 0}
          <div class="cr-state" style="height:200px">Ничего не найдено</div>
        {:else}
          <div class="picker-grid">
            {#each pickerFiltered as c (c.id)}
              {@const sel = isSelected(c.id)}
              {@const sk  = statusKey(getState(c))}
              {@const st  = STATUS[getState(c)] ?? STATUS[sk] ?? { label: getState(c) || '—', cls: '' }}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div class="picker-card" class:picker-card-sel={sel} on:click={() => toggleSelect(c.id)}>
                <div class="picker-card-check">
                  <label class="cr-check-wrap">
                    <input type="checkbox" checked={sel} on:change={() => toggleSelect(c.id)} />
                    <span class="cr-check-box"></span>
                  </label>
                </div>
                <div class="picker-card-thumb">
                  {#if thumbUrl(c)}
                    <img src={thumbUrl(c)} alt={c.name} style="width:100%;height:100%;object-fit:cover"/>
                  {:else if isVideo(c)}
                    <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                    </svg>
                  {:else}
                    <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor" style="color:#94A3B8">
                      <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                    </svg>
                  {/if}
                </div>
                <div class="picker-card-name" title={c.name}>{c.name ?? '—'}</div>
                <span class="cr-status-badge {st.cls}" style="font-size:10px;padding:1px 7px">
                  {st.label}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Picker footer -->
      <div class="picker-footer">
        <span class="picker-sel-count">Выбрано: {draft.creativeIds.length}</span>
        <div style="display:flex;gap:8px">
          <button class="cr-btn cr-btn-ghost" on:click={() => showPicker = false}>Отменить</button>
          <button class="cr-btn cr-btn-primary" on:click={() => {
            showPicker = false
            if (draft.creativeIds.length && !activeId) activeId = draft.creativeIds[0]
            else if (!draft.creativeIds.includes(activeId)) activeId = draft.creativeIds[0] ?? null
          }}>Выбрать</button>
        </div>
      </div>

    </div>
  </div>
{/if}

<style>
  /* ── Layout ── */
  .cr-wrap {
    display: flex; flex-direction: column;
    height: 100%; padding: 24px 28px 20px;
    box-sizing: border-box; gap: 12px; overflow: hidden;
  }

  /* ── Top bar ── */
  .cr-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }
  .cr-topbar-left { display: flex; align-items: center; gap: 10px; }
  .cr-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--navy, #112853); }
  .cr-count-badge { background: #DBEAFE; color: #1D4ED8; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 20px; }
  .cr-topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  /* ── Buttons ── */
  .cr-btn {
    height: 34px; padding: 0 16px; border-radius: 8px;
    font-size: 13px; font-family: inherit; font-weight: 500;
    cursor: pointer; display: flex; align-items: center; gap: 6px;
    white-space: nowrap; transition: background .12s, border-color .12s, color .12s;
  }
  .cr-btn:disabled { opacity: .6; cursor: default; }
  .cr-btn-ghost  { background: white; border: 1.5px solid #CBD5E1; color: #475569; }
  .cr-btn-ghost:hover:not(:disabled)   { border-color: var(--navy,#112853); color: var(--navy,#112853); }
  .cr-btn-primary { background: var(--navy,#112853); border: 1.5px solid transparent; color: white; }
  .cr-btn-primary:hover { background: #1e3a6e; }

  /* ── Error banner ── */
  .cr-error-banner { padding: 8px 14px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; font-size: 12.5px; color: #DC2626; flex-shrink: 0; }

  /* ── State ── */
  .cr-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; flex: 1; font-size: 13px; color: #94A3B8; }

  /* ── Empty state ── */
  .cr-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; flex: 1; text-align: center; }
  .cr-empty-title { font-size: 15px; font-weight: 600; color: #475569; }
  .cr-empty-sub   { font-size: 13px; color: #94A3B8; }

  /* ── Two-panel layout ── */
  .cr-layout { display: flex; gap: 16px; flex: 1; min-height: 0; }

  /* ── Left panel ── */
  .cr-panel-left {
    width: 230px; flex-shrink: 0;
    display: flex; flex-direction: column; gap: 8px;
  }

  .cr-add-btn {
    display: flex; align-items: center; gap: 6px;
    height: 32px; padding: 0 12px;
    background: none; border: 1.5px dashed #CBD5E1;
    border-radius: 8px; font-size: 12.5px; font-family: inherit;
    font-weight: 500; color: #64748B; cursor: pointer; transition: all .12s;
    white-space: nowrap;
  }
  .cr-add-btn:hover { border-color: var(--navy,#112853); color: var(--navy,#112853); }

  .cr-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; }

  .cr-list-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 8px;
    border: 1.5px solid #E2E8F0; background: white;
    cursor: pointer; transition: all .1s;
  }
  .cr-list-item:hover { border-color: #94A3B8; }
  .cr-list-item-active { border-color: var(--navy,#112853); background: #EFF6FF; }

  .cr-list-thumb {
    width: 40px; height: 30px; flex-shrink: 0;
    border-radius: 5px; background: #F1F5F9;
    border: 1px solid #E2E8F0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .cr-list-info { flex: 1; min-width: 0; }
  .cr-list-name { font-size: 12px; font-weight: 600; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cr-list-sub  { font-size: 10.5px; color: #94A3B8; margin-top: 1px; }

  /* ── Right panel ── */
  .cr-panel-right {
    flex: 1; min-width: 0;
    background: white; border: 1.5px solid #E2E8F0; border-radius: 12px;
    display: flex; flex-direction: column; overflow: hidden;
  }

  .cr-detail-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; border-bottom: 1px solid #F1F5F9; flex-shrink: 0;
  }
  .cr-detail-name { font-size: 16px; font-weight: 700; color: var(--navy,#112853); }
  .cr-detail-del {
    background: none; border: none; cursor: pointer;
    color: #94A3B8; display: flex; align-items: center;
    padding: 4px; border-radius: 5px; transition: background .1s, color .1s;
  }
  .cr-detail-del:hover { background: #FEE2E2; color: #DC2626; }

  /* Meta row */
  .cr-detail-meta {
    display: flex; gap: 24px; padding: 14px 20px;
    border-bottom: 1px solid #F1F5F9; flex-shrink: 0; flex-wrap: wrap;
  }
  .cr-meta-block { display: flex; flex-direction: column; }
  .cr-meta-label { font-size: 11px; color: #94A3B8; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 3px; }
  .cr-meta-val   { font-size: 13px; color: #334155; font-weight: 500; }

  /* Documents */
  .cr-docs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
  .cr-doc-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; background: #F1F5F9; border: 1px solid #E2E8F0;
    border-radius: 6px; font-size: 12px; color: #334155;
  }
  .cr-doc-del { background: none; border: none; cursor: pointer; color: #94A3B8; font-size: 14px; line-height: 1; padding: 0 1px; }
  .cr-doc-del:hover { color: #DC2626; }
  .cr-add-doc {
    display: inline-flex; align-items: center; gap: 4px;
    background: none; border: none; cursor: pointer;
    font-size: 12px; color: #2563EB; font-family: inherit; padding: 0;
    transition: color .1s;
  }
  .cr-add-doc:hover { color: #1D4ED8; }

  /* ── Tabs ── */
  .cr-tab-bar {
    display: flex; border-bottom: 1.5px solid #E2E8F0;
    flex-shrink: 0; overflow-x: auto;
  }
  .cr-tab-btn {
    padding: 10px 16px; background: none; border: none;
    font-size: 13px; font-family: inherit; font-weight: 500;
    color: #64748B; cursor: pointer; white-space: nowrap;
    border-bottom: 2px solid transparent; margin-bottom: -1.5px;
    transition: color .1s, border-color .1s;
  }
  .cr-tab-btn:hover { color: var(--navy,#112853); }
  .cr-tab-active { color: var(--navy,#112853); border-bottom-color: var(--navy,#112853); }

  /* ── Tab body ── */
  .cr-tab-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 0; }
  .cr-tab-note { font-size: 12px; color: #64748B; margin: 0 0 16px; line-height: 1.5; }
  .cr-tab-empty { color: #94A3B8; font-size: 13px; text-align: center; padding: 32px 0; }
  .cr-section-label { font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 8px; }

  /* ── Media file list ── */
  .cr-media-list { display: flex; flex-direction: column; gap: 4px; }
  .cr-media-row {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 12px; background: #F8FAFC;
    border: 1px solid #E2E8F0; border-radius: 6px;
    font-size: 12.5px; color: #334155;
  }
  .cr-media-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cr-media-dim  { color: #64748B; font-variant-numeric: tabular-nums; flex-shrink: 0; }

  /* ── Chips ── */
  .cr-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 0; }
  .cr-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 5px 12px; border-radius: 20px;
    border: 1.5px solid #E2E8F0; background: white;
    font-size: 12.5px; font-family: inherit; font-weight: 500;
    color: #64748B; cursor: pointer; transition: all .1s;
  }
  .cr-chip:hover { border-color: #94A3B8; }
  .cr-chip-on { background: #EFF6FF; border-color: var(--navy,#112853); color: var(--navy,#112853); }
  .cr-chip-day { padding: 5px 10px; min-width: 38px; justify-content: center; }
  .cr-chip-x { font-size: 14px; line-height: 1; opacity: .6; }

  /* ── Toggle ── */
  .cr-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 0; border-bottom: 1px solid #F1F5F9;
  }
  .cr-toggle-row:last-child { border-bottom: none; }
  .cr-toggle-label { font-size: 13px; color: #334155; }
  .cr-toggle {
    width: 38px; height: 22px; border-radius: 11px;
    background: #CBD5E1; position: relative; cursor: pointer;
    transition: background .15s; flex-shrink: 0;
  }
  .cr-toggle-on { background: var(--navy,#112853); }
  .cr-toggle-thumb {
    position: absolute; top: 3px; left: 3px;
    width: 16px; height: 16px; border-radius: 50%;
    background: white; transition: left .15s;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
  }
  .cr-toggle-on .cr-toggle-thumb { left: 19px; }

  /* ── Range / age / time ── */
  .cr-range-row { display: flex; gap: 12px; }
  .cr-range-field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .cr-range-label { font-size: 11px; color: #94A3B8; font-weight: 500; }
  .cr-range-input {
    height: 36px; padding: 0 12px;
    border: 1.5px solid #E2E8F0; border-radius: 8px;
    font-size: 13px; font-family: inherit; color: #334155;
    outline: none; background: #F8FAFC; transition: border-color .1s;
  }
  .cr-range-input:focus { border-color: #93C5FD; background: white; }

  /* Interests */
  .cr-interests-wrap { display: flex; flex-direction: column; gap: 8px; }
  .cr-interests-selected { display: flex; flex-wrap: wrap; gap: 6px; }
  .cr-interests-select {
    height: 36px; padding: 0 12px;
    border: 1.5px solid #E2E8F0; border-radius: 8px;
    font-size: 13px; font-family: inherit; color: #334155;
    background: #F8FAFC; outline: none; cursor: pointer;
  }

  /* ── Spinner ── */
  .cr-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #E2E8F0; border-top-color: #64748B; border-radius: 50%; animation: spin .7s linear infinite; }
  .cr-spinner-lg { width: 24px; height: 24px; border-width: 3px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Nav ── */
  .cr-nav { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding-top: 4px; }
  .nav-link { background: none; border: none; font-size: 13px; font-weight: 500; color: #64748B; cursor: pointer; padding: 0; transition: color .12s; }
  .nav-link:hover { color: var(--navy,#112853); }
  .nav-link-next { color: var(--navy,#112853); font-weight: 600; }

  /* ════ Picker modal ════ */
  .picker-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .picker-modal {
    background: white; border-radius: 14px;
    box-shadow: 0 24px 64px rgba(0,0,0,.22);
    width: min(900px, calc(100vw - 40px));
    max-height: calc(100vh - 80px);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .picker-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1.5px solid #E2E8F0; flex-shrink: 0;
  }
  .picker-title { font-size: 16px; font-weight: 700; color: var(--navy,#112853); }
  .picker-close {
    background: none; border: none; cursor: pointer; color: #94A3B8;
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 6px; transition: background .1s;
  }
  .picker-close:hover { background: #F1F5F9; color: #475569; }
  .picker-filters {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 12px 20px; border-bottom: 1px solid #F1F5F9; flex-shrink: 0;
  }
  .picker-grid-wrap { flex: 1; overflow-y: auto; padding: 16px 20px; }
  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .picker-card {
    position: relative; background: white;
    border: 1.5px solid #E2E8F0; border-radius: 10px;
    padding: 10px; cursor: pointer; transition: border-color .1s, background .1s;
    display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
  }
  .picker-card:hover { border-color: #94A3B8; }
  .picker-card-sel { border-color: var(--navy,#112853); background: #EFF6FF; }
  .picker-card-check { position: absolute; top: 8px; left: 8px; z-index: 1; }
  .picker-card-thumb {
    width: 100%; aspect-ratio: 16/9; border-radius: 6px;
    background: #F1F5F9; border: 1px solid #E2E8F0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; flex-shrink: 0;
  }
  .picker-card-name {
    font-size: 11.5px; font-weight: 600; color: #1E293B;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;
  }
  .picker-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; border-top: 1.5px solid #E2E8F0; flex-shrink: 0;
  }
  .picker-sel-count { font-size: 12.5px; color: #64748B; }

  /* ── Picker search / tabs ── */
  .cr-search-wrap { position: relative; display: flex; align-items: center; }
  .cr-search-icon { position: absolute; left: 10px; color: #94A3B8; pointer-events: none; flex-shrink: 0; }
  .cr-search {
    height: 32px; width: 100%; padding: 0 32px 0 30px;
    border: 1.5px solid #E2E8F0; border-radius: 8px;
    font-size: 13px; font-family: inherit; color: #334155;
    outline: none; background: white; transition: border-color .12s;
  }
  .cr-search:focus { border-color: #93C5FD; }
  .cr-search-clear { position: absolute; right: 8px; background: none; border: none; color: #94A3B8; font-size: 16px; cursor: pointer; line-height: 1; padding: 0; }
  .cr-tabs { display: flex; gap: 4px; }
  .cr-tab {
    height: 30px; padding: 0 12px; border-radius: 20px;
    border: 1.5px solid #E2E8F0; background: white;
    font-size: 12px; font-family: inherit; font-weight: 500;
    color: #64748B; cursor: pointer; transition: all .12s; white-space: nowrap;
  }
  .cr-tab:hover { border-color: #94A3B8; color: #334155; }
  .cr-tab-on { background: var(--navy,#112853); border-color: var(--navy,#112853); color: white; }

  /* ── Status badges ── */
  .cr-status-badge {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap;
  }
  .st-blue   { background: #DBEAFE; color: #1D4ED8; }
  .st-green  { background: #DCFCE7; color: #15803D; }
  .st-yellow { background: #FEF9C3; color: #854D0E; }
  .st-red    { background: #FEE2E2; color: #B91C1C; }
  .st-grey   { background: #F1F5F9; color: #64748B; }

  /* ── Checkbox ── */
  .cr-check-wrap { display: flex; align-items: center; cursor: pointer; }
  .cr-check-wrap input { display: none; }
  .cr-check-box {
    width: 16px; height: 16px; border: 1.5px solid #CBD5E1; border-radius: 4px;
    background: white; display: flex; align-items: center; justify-content: center;
    transition: all .1s; flex-shrink: 0;
  }
  .cr-check-wrap input:checked + .cr-check-box { background: var(--navy,#112853); border-color: var(--navy,#112853); }
  .cr-check-wrap input:checked + .cr-check-box::after {
    content: ''; display: block; width: 9px; height: 6px;
    border-left: 2px solid white; border-bottom: 2px solid white;
    transform: rotate(-45deg) translateY(-1px);
  }
</style>
