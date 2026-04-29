<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import { api } from '../../lib/api.js'
  import { formatMoney } from '../../lib/utils.js'

  const dispatch = createEventDispatcher()
  export let draft

  if (!draft.screenIds) draft.screenIds = []

  // Map
  let mapEl
  let map
  let markersLayer
  let loading = true
  let error = ''
  let screens = []
  let totalLoaded = 0

  // Map overlays
  let otsOverlay = false
  let cameraOverlay = false

  // Panel state
  let panelHeight = 280   // px, draggable
  let dragging = false
  let dragStartY = 0
  let dragStartH = 0

  // Table state
  let activeTab = 'all'   // 'all' | 'selected'
  let tableSearch = ''
  let filterDistrict = ''
  let filterIndex = ''

  // Derived
  $: draftCities = draft.cities ?? []

  $: filtered = screens.filter(s => {
    if (draftCities.length > 0 && !draftCities.includes(s.city)) return false
    if (tableSearch) {
      const q = tableSearch.toLowerCase()
      if (!s.address.toLowerCase().includes(q) && !s.city.toLowerCase().includes(q) && !s.owner.toLowerCase().includes(q)) return false
    }
    return true
  })

  $: tabRows = activeTab === 'selected'
    ? filtered.filter(s => draft.screenIds.includes(s.id))
    : filtered

  $: if (map && markersLayer) renderMarkers(filtered)

  function isSelected(id) { return draft.screenIds.includes(id) }

  function toggleScreen(id) {
    draft.screenIds = isSelected(id)
      ? draft.screenIds.filter(x => x !== id)
      : [...draft.screenIds, id]
  }

  function toggleAll() {
    const visibleIds = tabRows.map(s => s.id)
    const allSelected = visibleIds.every(id => draft.screenIds.includes(id))
    if (allSelected) {
      draft.screenIds = draft.screenIds.filter(id => !visibleIds.includes(id))
    } else {
      draft.screenIds = [...new Set([...draft.screenIds, ...visibleIds])]
    }
  }

  $: allVisible = tabRows.length > 0 && tabRows.every(s => draft.screenIds.includes(s.id))
  $: someVisible = tabRows.some(s => draft.screenIds.includes(s.id))

  onMount(async () => {
    await loadScreens()
    initMap()
  })

  onDestroy(() => {
    if (map) { map.remove(); map = null }
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
  })

  async function loadScreens() {
    loading = true; error = ''
    try {
      const first = await api.inventories.list({ page: 0, size: 100 })
      const pages = [first.content ?? []]
      const totalPages = first.totalPages ?? 1
      const extraPages = Math.min(totalPages - 1, 4)
      if (extraPages > 0) {
        const rest = await Promise.all(
          Array.from({ length: extraPages }, (_, i) =>
            api.inventories.list({ page: i + 1, size: 100 })
          )
        )
        rest.forEach(r => pages.push(r.content ?? []))
      }
      screens = pages.flat().map(mapInventory).filter(
        s => Number.isFinite(s.lat) && Number.isFinite(s.lon)
      )
      totalLoaded = first.totalElements ?? screens.length
    } catch (e) {
      error = 'Не удалось загрузить экраны'
      console.error(e)
    } finally {
      loading = false
    }
  }

  function mapInventory(inv) {
    const loc = inv.location ?? {}
    const meta = inv.inventoryType ?? inv.inventoryTypeAndCity ?? {}
    return {
      id: inv.id,
      city: inv.inventoryTypeAndCity?.cityName
        || (typeof loc.city === 'string' ? loc.city : loc.city?.name)
        || '',
      format: meta.format || meta.name || inv.type || '',
      address: loc.address || inv.name || '',
      lat: loc.latitude ?? NaN,
      lon: loc.longitude ?? NaN,
      minBid: inv.minBidInfo?.minBidCharged ?? inv.minBidInfo?.minBid ?? null,
      ots: inv.minBidInfo?.ots ?? null,
      owner: inv.displayOwner?.name || '',
      active: inv.enabled !== false,
    }
  }

  function initMap() {
    if (!mapEl || map) return
    map = L.map(mapEl, { center: [55.75, 37.62], zoom: 5, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    markersLayer = L.layerGroup().addTo(map)
    renderMarkers(filtered)
    if (screens.length > 0) {
      const valid = screens.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      if (valid.length) map.fitBounds(L.latLngBounds(valid.map(s => [s.lat, s.lon])), { padding: [40, 40], maxZoom: 10 })
    }
  }

  function renderMarkers(list) {
    if (!markersLayer) return
    markersLayer.clearLayers()
    for (const s of list) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue
      const sel = isSelected(s.id)
      const m = L.circleMarker([s.lat, s.lon], {
        radius: sel ? 8 : 5,
        fillColor: sel ? '#112853' : '#55C1FA',
        color: sel ? '#112853' : '#2a8fb5',
        weight: sel ? 2 : 1,
        fillOpacity: sel ? 0.95 : 0.75,
      })
      m.bindTooltip(
        `<strong>${s.address || s.city}</strong><br/>${s.format || ''}${s.minBid ? `<br/>от ${formatMoney(s.minBid)}` : ''}`,
        { direction: 'top', offset: [0, -4] }
      )
      m.on('click', () => { toggleScreen(s.id); renderMarkers(filtered) })
      markersLayer.addLayer(m)
    }
  }

  function focusScreen(s) {
    if (map && Number.isFinite(s.lat) && Number.isFinite(s.lon))
      map.setView([s.lat, s.lon], 14)
  }

  // Drag to resize panel
  function onDragStart(e) {
    dragging = true
    dragStartY = e.clientY
    dragStartH = panelHeight
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    e.preventDefault()
  }

  function onDragMove(e) {
    if (!dragging) return
    const delta = dragStartY - e.clientY
    panelHeight = Math.max(120, Math.min(600, dragStartH + delta))
  }

  function onDragEnd() {
    dragging = false
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
  }
</script>

<div class="screens-shell">
  <!-- Map fills all remaining space -->
  <div class="map-area">
    {#if loading}
      <div class="map-overlay">
        <div class="spinner"></div>
        Загружаю экраны…
      </div>
    {/if}
    <div bind:this={mapEl} class="screens-map"></div>

    <!-- Floating: Pre-campaign targeting -->
    <div class="map-float-top-left">
      <button class="map-float-btn">
        Pre-campaign таргетинг
        <svg viewBox="0 0 10 6" fill="none" width="10" height="6">
          <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Floating: Search -->
    <div class="map-float-top-right">
      <button class="map-icon-btn" title="Поиск по карте">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M9 17A8 8 0 109 1a8 8 0 000 16zM17 17l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Floating: Map filter bar (bottom of map, above panel) -->
    <div class="map-float-bottom">
      <!-- Drawing tools -->
      <div class="map-tools-group">
        <button class="map-tool-btn" title="Прямоугольник">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="map-tool-btn" title="Круг">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="map-tool-btn" title="Полигон">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1l5.5 4.5-2 6h-7l-2-6L7 1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="map-tool-btn" title="Свободная линия">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 10 C4 4, 7 2, 12 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
          </svg>
        </button>
      </div>

      <div class="map-tools-divider"></div>

      <!-- Import POI -->
      <button class="map-float-btn map-float-btn-sm">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
        </svg>
        Импортировать POI
      </button>

      <div class="map-tools-divider"></div>

      <!-- OTS toggle -->
      <label class="map-toggle-label">
        OTS
        <button
          class="map-toggle" class:on={otsOverlay}
          on:click={() => otsOverlay = !otsOverlay}
          role="switch" aria-checked={otsOverlay}
        >
          <span class="map-toggle-thumb"></span>
        </button>
      </label>

      <!-- Camera toggle -->
      <label class="map-toggle-label">
        Камера
        <button
          class="map-toggle" class:on={cameraOverlay}
          on:click={() => cameraOverlay = !cameraOverlay}
          role="switch" aria-checked={cameraOverlay}
        >
          <span class="map-toggle-thumb"></span>
        </button>
      </label>
    </div>
  </div>

  <!-- Bottom screens panel -->
  <div class="screens-panel" style="height:{panelHeight}px">
    <!-- Drag handle -->
    <div class="panel-drag-handle" on:mousedown={onDragStart} role="separator" aria-label="Изменить размер">
      <div class="drag-knob"></div>
    </div>

    <!-- Panel top actions -->
    <div class="panel-top-actions">
      <div class="panel-filters">
        <div class="panel-search-box">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style="color:var(--text-muted);flex-shrink:0">
            <path d="M9 17A8 8 0 109 1a8 8 0 000 16zM17 17l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input
            class="panel-search-input"
            type="text"
            placeholder="Поиск по адресу, оператору…"
            bind:value={tableSearch}
          />
        </div>
        <select class="panel-select" bind:value={filterDistrict}>
          <option value="">Район</option>
        </select>
        <select class="panel-select" bind:value={filterIndex}>
          <option value="">Индекс</option>
        </select>
      </div>
      <button class="panel-expand-btn" title="Развернуть" on:click={() => panelHeight = panelHeight < 400 ? 500 : 280}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>

    <!-- Action bar: tabs + count -->
    <div class="panel-action-bar">
      <div class="panel-tabs">
        <button class="panel-tab" class:active={activeTab==='all'} on:click={() => activeTab='all'}>
          Все экраны
        </button>
        <button class="panel-tab" class:active={activeTab==='selected'} on:click={() => activeTab='selected'}>
          Выбранные
          {#if draft.screenIds.length > 0}
            <span class="panel-tab-count">{draft.screenIds.length}</span>
          {/if}
        </button>
      </div>
      <span class="panel-count">{totalLoaded > 0 ? `${totalLoaded.toLocaleString('ru-RU')} экранов` : ''}</span>
    </div>

    <!-- Table -->
    <div class="panel-table-wrap">
      <table class="panel-table">
        <thead>
          <tr>
            <th style="width:36px">
              <input
                type="checkbox"
                checked={allVisible}
                indeterminate={someVisible && !allVisible}
                on:change={toggleAll}
              />
            </th>
            <th>Адрес</th>
            <th>Город</th>
            <th>Формат</th>
            <th>Оператор</th>
            <th>OTS</th>
            <th>Мин. ставка</th>
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="7" class="table-state-cell">
              <div class="spinner"></div> Загрузка…
            </td></tr>
          {:else if error}
            <tr><td colspan="7" class="table-state-cell" style="color:#EF4444">{error}</td></tr>
          {:else if tabRows.length === 0}
            <tr><td colspan="7" class="table-state-cell">
              {activeTab === 'selected' ? 'Нет выбранных экранов' : 'Экраны не найдены'}
            </td></tr>
          {:else}
            {#each tabRows as s (s.id)}
              <tr class="screen-row" class:sel={isSelected(s.id)} on:click={() => { focusScreen(s); toggleScreen(s.id); renderMarkers(filtered) }}>
                <td on:click|stopPropagation>
                  <input type="checkbox" checked={isSelected(s.id)} on:change={() => { toggleScreen(s.id); renderMarkers(filtered) }} />
                </td>
                <td class="cell-addr">{s.address || '—'}</td>
                <td class="cell-muted">{s.city || '—'}</td>
                <td class="cell-muted">{s.format || '—'}</td>
                <td class="cell-muted">{s.owner || '—'}</td>
                <td class="cell-muted">{s.ots != null ? s.ots.toLocaleString('ru-RU') : '—'}</td>
                <td class="cell-muted">{s.minBid != null ? formatMoney(s.minBid) : '—'}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Nav bar -->
  <div class="screens-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <div class="nav-actions">
      <button class="nav-action-btn">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
        </svg>
        Сохранить экраны
      </button>
      <button class="nav-action-btn">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/>
        </svg>
        Ставка
      </button>
      <button class="nav-action-btn">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
        </svg>
        График вещания
      </button>
    </div>
    <button class="btn-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>
</div>

<style>
  .screens-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  /* ── Map ── */
  .map-area {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .screens-map {
    width: 100%;
    height: 100%;
  }

  .map-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(255,255,255,.88);
    z-index: 500;
    font-size: 14px;
    color: var(--text-muted);
  }

  /* Floating map elements */
  .map-float-top-left {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 400;
  }

  .map-float-top-right {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 400;
  }

  .map-float-bottom {
    position: absolute;
    bottom: 12px;
    left: 12px;
    z-index: 400;
    display: flex;
    align-items: center;
    gap: 6px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 10px;
    box-shadow: 0 2px 12px rgba(0,0,0,.12);
  }

  .map-float-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    cursor: pointer;
    box-shadow: 0 1px 6px rgba(0,0,0,.1);
    white-space: nowrap;
  }
  .map-float-btn:hover { background: var(--bg); }
  .map-float-btn-sm { height: 28px; font-size: 12px; }

  .map-icon-btn {
    width: 32px;
    height: 32px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
    box-shadow: 0 1px 6px rgba(0,0,0,.1);
  }
  .map-icon-btn:hover { color: var(--text); background: var(--bg); }

  .map-tools-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .map-tool-btn {
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
  }
  .map-tool-btn:hover { background: var(--chip-bg); color: var(--text); }

  .map-tools-divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 4px;
  }

  .map-toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    white-space: nowrap;
  }

  .map-toggle {
    position: relative;
    width: 32px;
    height: 18px;
    background: var(--border);
    border: none;
    border-radius: 9px;
    cursor: pointer;
    padding: 0;
    transition: background .15s;
  }
  .map-toggle.on { background: var(--navy); }

  .map-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    transition: transform .15s;
    pointer-events: none;
  }
  .map-toggle.on .map-toggle-thumb { transform: translateX(14px); }

  /* ── Bottom panel ── */
  .screens-panel {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: white;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 120px;
  }

  .panel-drag-handle {
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ns-resize;
    flex-shrink: 0;
    background: white;
  }
  .panel-drag-handle:hover .drag-knob { background: var(--text-muted); }

  .drag-knob {
    width: 36px;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    transition: background .12s;
  }

  .panel-top-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px 8px;
    flex-shrink: 0;
  }

  .panel-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .panel-search-box {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    padding: 0 10px;
    flex: 1;
    min-width: 0;
    background: #fff;
  }
  .panel-search-box:focus-within { border-color: var(--navy); }

  .panel-search-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    background: transparent;
    min-width: 0;
  }
  .panel-search-input::placeholder { color: var(--text-muted); }

  .panel-select {
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text-muted);
    background: #fff;
    padding: 0 8px;
    cursor: pointer;
    outline: none;
    flex-shrink: 0;
  }
  .panel-select:focus { border-color: var(--navy); color: var(--text); }

  .panel-expand-btn {
    width: 30px;
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .panel-expand-btn:hover { background: var(--bg); color: var(--text); }

  .panel-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px 4px;
    flex-shrink: 0;
  }

  .panel-tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--border);
  }

  .panel-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    cursor: pointer;
    font-weight: 500;
    transition: color .12s;
  }
  .panel-tab:hover { color: var(--text); }
  .panel-tab.active { color: var(--navy); border-bottom-color: var(--navy); font-weight: 700; }

  .panel-tab-count {
    background: var(--navy);
    color: white;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 10.5px;
    font-weight: 700;
  }

  .panel-count {
    font-size: 12px;
    color: var(--text-muted);
  }

  /* ── Table ── */
  .panel-table-wrap {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
  }

  .panel-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }

  .panel-table thead {
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 1;
  }

  .panel-table th {
    padding: 6px 10px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .panel-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .screen-row { cursor: pointer; }
  .screen-row:hover td { background: var(--navy-light); }
  .screen-row.sel td { background: rgba(17,40,83,.05); }

  .cell-addr {
    font-weight: 600;
    color: var(--text);
    max-width: 240px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-muted { color: var(--text-muted); white-space: nowrap; }

  .table-state-cell {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
  }

  /* ── Nav ── */
  .screens-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 24px;
    border-top: 1px solid var(--border);
    background: white;
    flex-shrink: 0;
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nav-action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    background: white;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    cursor: pointer;
    font-weight: 500;
  }
  .nav-action-btn:hover { background: var(--bg); border-color: var(--navy); color: var(--navy); }
</style>
