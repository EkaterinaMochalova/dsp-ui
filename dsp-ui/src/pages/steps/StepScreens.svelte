<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import { api } from '../../lib/api.js'
  import { formatMoney } from '../../lib/utils.js'

  // Persist cache on window so it survives HMR reloads and component re-mounts
  window._dspScreensCache = {}

  const dispatch = createEventDispatcher()
  export let draft

  if (!draft.screenIds) draft.screenIds = []

  // Map
  let mapEl
  let map
  let markersLayer
  let loading = true
  let loadingProgress = 0   // 0–100
  let error = ''
  let screens = []
  let totalLoaded = 0

  // Map overlays
  let otsOverlay = false
  let cameraOverlay = false

  // Freehand draw tool
  let drawMode = false       // lasso active
  let drawPoints = []        // array of L.LatLng
  let drawPolyline = null    // live L.Polyline during drag
  let drawPolygon = null     // finished L.Polygon (shown briefly)
  let drawLayer = null       // L.LayerGroup for draw visuals

  function toggleDrawMode() {
    drawMode = !drawMode
    if (map) map.dragging[drawMode ? 'disable' : 'enable']()
    if (!drawMode) clearDraw()
  }

  function clearDraw() {
    if (drawLayer) drawLayer.clearLayers()
    drawPoints = []
    drawPolyline = null
    drawPolygon = null
  }

  // Ray-casting point-in-polygon for lat/lon points
  function pointInPolygon(lat, lon, poly) {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].lat, yi = poly[i].lng
      const xj = poly[j].lat, yj = poly[j].lng
      const intersect = ((yi > lon) !== (yj > lon)) &&
        (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  function onMapMouseDown(e) {
    if (!drawMode) return
    clearDraw()
    drawPoints = [e.latlng]
    drawPolyline = L.polyline([e.latlng], {
      color: '#2563EB', weight: 2, dashArray: '6 4', opacity: 0.85,
    }).addTo(drawLayer)
  }

  function onMapMouseMove(e) {
    if (!drawMode || !drawPolyline) return
    drawPoints.push(e.latlng)
    drawPolyline.setLatLngs(drawPoints)
  }

  function onMapMouseUp() {
    if (!drawMode || !drawPolyline || drawPoints.length < 3) {
      clearDraw()
      return
    }
    // Close the shape visually
    drawLayer.clearLayers()
    drawPolygon = L.polygon(drawPoints, {
      color: '#2563EB', weight: 2, fillColor: '#2563EB', fillOpacity: 0.08,
    }).addTo(drawLayer)

    // Select only from currently filtered screens (respects OTS/camera toggles)
    const hits = filtered.filter(s =>
      Number.isFinite(s.lat) && Number.isFinite(s.lon) &&
      pointInPolygon(s.lat, s.lon, drawPoints)
    )
    if (hits.length) {
      draft.screenIds = [...new Set([...draft.screenIds, ...hits.map(s => s.id)])]
      renderMarkers(filtered)
    }

    // Clear the polygon after 1.5 s
    setTimeout(() => {
      clearDraw()
      drawMode = false
      if (map) map.dragging.enable()
    }, 1500)
  }

  // Panel state
  let panelHeight = 280   // px, draggable
  let dragging = false
  let dragStartY = 0
  let dragStartH = 0

  // Table state
  let activeTab = 'all'   // 'all' | 'selected'
  let tableSearch = ''

  // Column filters — keyed by column id
  let colFilters = {
    // dropdown
    owner: '', city: '', side: '', format: '', photoReport: '',
    // range (stored as { min: '', max: '' })
    minBid: { min: '', max: '' },
    ots:    { min: '', max: '' },
    grp:    { min: '', max: '' },
    duration: { min: '', max: '' },
    requestHourlyAvg: { min: '', max: '' },
  }

  // Sort state
  let sortCol = ''   // 'gid'|'owner'|'city'|'side'|'format'|'size'|'minBid'|'ots'
  let sortDir = 1    // 1 = asc, -1 = desc

  // Open filter dropdown
  let openFilterCol = ''

  function toggleSort(col) {
    if (sortCol === col) sortDir = -sortDir
    else { sortCol = col; sortDir = 1 }
  }

  function toggleFilter(col, e) {
    e.stopPropagation()
    openFilterCol = openFilterCol === col ? '' : col
  }

  function setColFilter(col, val) {
    colFilters = { ...colFilters, [col]: val }
    openFilterCol = ''
  }

  // Close filter dropdown on outside click
  function onDocClick() { openFilterCol = '' }

  // Unique values per filterable column (from ALL screens, not filtered)
  $: colOptions = {
    owner:       [...new Set(screens.map(s => s.owner).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ru')),
    city:        [...new Set(screens.map(s => s.city).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ru')),
    side:        [...new Set(screens.map(s => s.side).filter(Boolean))].sort(),
    format:      [...new Set(screens.map(s => s.format).filter(Boolean))].sort(),
    photoReport: [...new Set(screens.map(s => s.photoReport).filter(Boolean))].sort(),
  }

  // Range filter helper
  function inRange(val, f) {
    if (f.min !== '' && val != null && val < Number(f.min)) return false
    if (f.max !== '' && val != null && val > Number(f.max)) return false
    return true
  }

  // Derived — OTS/camera map toggles + column filters + text search
  $: filtered = screens.filter(s => {
    if (otsOverlay    && !(s.ots > 0))             return false
    if (cameraOverlay && !s.hasCamera)             return false
    if (colFilters.owner  && s.owner  !== colFilters.owner)  return false
    if (colFilters.city   && s.city   !== colFilters.city)   return false
    if (colFilters.side   && s.side   !== colFilters.side)   return false
    if (colFilters.format && s.format !== colFilters.format) return false
    if (!inRange(s.minBid, colFilters.minBid)) return false
    if (!inRange(s.ots,    colFilters.ots))    return false
    if (!inRange(s.grp,    colFilters.grp))    return false
    if (!inRange(s.duration, colFilters.duration)) return false
    if (!inRange(s.requestHourlyAvg, colFilters.requestHourlyAvg)) return false
    if (colFilters.photoReport && s.photoReport !== colFilters.photoReport) return false
    if (!tableSearch) return true
    const q = tableSearch.toLowerCase()
    return s.address.toLowerCase().includes(q)
      || s.city.toLowerCase().includes(q)
      || s.owner.toLowerCase().includes(q)
      || s.gid.toLowerCase().includes(q)
  })

  // Sort comparator
  function cmpVal(s, col) {
    const numCols = ['minBid','ots','grp','duration','requestHourlyAvg']
    if (numCols.includes(col)) return s[col] ?? -Infinity
    return (s[col] ?? '').toString().toLowerCase()
  }

  $: sortedFiltered = sortCol
    ? [...filtered].sort((a, b) => {
        const av = cmpVal(a, sortCol), bv = cmpVal(b, sortCol)
        return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir
      })
    : filtered

  $: tabRows = activeTab === 'selected'
    ? sortedFiltered.filter(s => draft.screenIds.includes(s.id))
    : sortedFiltered

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
    loading = true; loadingProgress = 0; error = ''
    const PAGE_SIZE = 500
    const BATCH = 10
    const selectedCities = draft.cities ?? []
    const cacheKey = selectedCities.length > 0
      ? [...selectedCities].sort().join('|')
      : '__all__'

    // Return from cache if available
    if (window._dspScreensCache[cacheKey]) {
      screens = window._dspScreensCache[cacheKey]
      totalLoaded = screens.length
      loading = false
      loadingProgress = 100
      return
    }

    try {
      const first = await api.inventories.list({ page: 0, size: PAGE_SIZE })
      const totalPages = first.totalPages ?? 1
      loadingProgress = Math.round(100 / totalPages)

      const allItems = [...(first.content ?? [])]

      for (let start = 1; start < totalPages; start += BATCH) {
        const end = Math.min(start + BATCH, totalPages)
        const batch = await Promise.all(
          Array.from({ length: end - start }, (_, i) =>
            api.inventories.list({ page: start + i, size: PAGE_SIZE })
          )
        )
        batch.forEach(r => allItems.push(...(r.content ?? [])))
        loadingProgress = Math.round((end / totalPages) * 100)
      }

      const mapped = allItems.map(mapInventory).filter(
        s => Number.isFinite(s.lat) && Number.isFinite(s.lon)
      )
      screens = selectedCities.length > 0
        ? mapped.filter(s => selectedCities.includes(s.city))
        : mapped
      totalLoaded = screens.length
      window._dspScreensCache[cacheKey] = screens
    } catch (e) {
      error = 'Не удалось загрузить экраны'
      console.error(e)
    } finally {
      loading = false
    }
  }

  function mapInventory(inv) {
    const loc = inv.location ?? {}
    const itc = inv.inventoryTypeAndCity ?? {}
    const fmt = inv.type || itc.type || ''
    return {
      id: inv.id,
      gid: inv.gid || inv.name || '',
      city: inv.city?.name || itc.cityName || '',
      format: fmt,
      side: '',   // not present in API response
      size: formatScreenSize(inv, fmt),
      address: loc.address || inv.name || '',
      lat: loc.latitude ?? NaN,
      lon: loc.longitude ?? NaN,
      minBid: inv.minBidInfo?.minBidCharged ?? inv.minBidInfo?.minBid ?? null,
      ots: inv.minBidInfo?.ots ?? inv.metadata?.ots ?? null,
      owner: inv.displayOwner?.name || '',
      photo: inv.images?.[0]?.preview ?? null,
      active: inv.enabled !== false,
      hasCamera: inv.photoReportOption != null && inv.photoReportOption !== 'NO',
      duration: inv.duration ?? null,
      grp: inv.metadata?.grp ?? null,
      requestHourlyAvg: inv.requestHourlyAvg ?? null,
      resolution: inv.screenResolutionPx?.width
        ? `${inv.screenResolutionPx.width}×${inv.screenResolutionPx.height}`
        : '',
      photoReport: inv.photoReportOption ?? '',
      description: inv.description ?? '',
      lastShot: inv.lastShotTime ?? null,
    }
  }

  function formatScreenSize(inv, fmt) {
    // PVZ screens are small indoor displays with a fixed size
    if (fmt === 'PVZ_SCREEN') return '0,54×0,95м'
    const d = inv.surfaceDimensionMM
    if (d?.width && d?.height) {
      // Values < 3000 are pixel resolutions mislabeled as MM — fall back to standard size
      const w = d.width  < 3000 ? 6 : d.width  / 1000
      const h = d.height < 3000 ? 3 : d.height / 1000
      const f = v => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
      return `${f(w)}×${f(h)}м`
    }
    return ''
  }

  function initMap() {
    if (!mapEl || map) return
    map = L.map(mapEl, { center: [55.75, 37.62], zoom: 5, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    markersLayer = L.layerGroup().addTo(map)
    drawLayer   = L.layerGroup().addTo(map)
    renderMarkers(filtered)

    // Re-render on pan/zoom to keep only visible markers
    map.on('moveend zoomend', () => renderMarkers(filtered))

    // Freehand draw events
    map.on('mousedown', onMapMouseDown)
    map.on('mousemove', onMapMouseMove)
    map.on('mouseup',   onMapMouseUp)

    if (screens.length > 0) {
      const valid = screens.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      if (valid.length) map.fitBounds(L.latLngBounds(valid.map(s => [s.lat, s.lon])), { padding: [40, 40], maxZoom: 7 })
    }
  }

  // Cap at 2000 visible markers for performance; always show selected ones
  const MAX_VISIBLE = 2000

  function renderMarkers(list) {
    if (!markersLayer || !map) return
    markersLayer.clearLayers()

    const bounds = map.getBounds().pad(0.1)
    const zoom = map.getZoom()

    // At low zoom, cluster by grid to avoid 22k dots
    let visible = list.filter(s =>
      Number.isFinite(s.lat) && Number.isFinite(s.lon) && bounds.contains([s.lat, s.lon])
    )

    // Selected always shown regardless of limit
    const selected = visible.filter(s => isSelected(s.id))
    const unselected = visible.filter(s => !isSelected(s.id))

    // At low zoom subsample unselected to MAX_VISIBLE
    const maxUnsel = Math.max(0, MAX_VISIBLE - selected.length)
    const toRender = zoom >= 10
      ? [...selected, ...unselected]
      : [...selected, ...unselected.slice(0, maxUnsel)]

    for (const s of toRender) {
      const sel = isSelected(s.id)
      const m = L.circleMarker([s.lat, s.lon], {
        radius: sel ? 8 : zoom >= 10 ? 6 : 4,
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

<svelte:window on:click={onDocClick}/>

<div class="screens-shell">
  <!-- Map fills all remaining space -->
  <div class="map-area">
    {#if loading}
      <div class="map-overlay">
        <div class="spinner"></div>
        <span>Загружаю экраны… {loadingProgress > 0 ? `${loadingProgress}%` : ''}</span>
        {#if loadingProgress > 0}
          <div class="load-bar-track">
            <div class="load-bar-fill" style="width:{loadingProgress}%"></div>
          </div>
        {/if}
      </div>
    {/if}
    <div bind:this={mapEl} class="screens-map" class:draw-cursor={drawMode}></div>

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
      <!-- Freehand lasso -->
      <button
        class="map-tool-btn"
        class:active={drawMode}
        title={drawMode ? 'Отменить выделение' : 'Выделить область'}
        on:click={toggleDrawMode}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
          <path d="M3 14 C3 8, 7 3, 10 3 C14 3, 17 6, 17 10 C17 13, 15 15, 13 16 C10 17, 6 16, 3 14 Z"
            stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 14 L5 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>

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
              <input type="checkbox" checked={allVisible} indeterminate={someVisible && !allVisible} on:change={toggleAll}/>
            </th>
            <th style="width:60px"></th>
            {#each [
              { id:'gid',              label:'GID' },
              { id:'owner',            label:'Оператор',        filterType: 'dropdown' },
              { id:'city',             label:'Город',           filterType: 'dropdown' },
              { id:'side',             label:'Сторона',         filterType: 'dropdown' },
              { id:'format',           label:'Формат',          filterType: 'dropdown' },
              { id:'size',             label:'Размер' },
              { id:'minBid',           label:'Мин. ставка',     filterType: 'range' },
              { id:'ots',              label:'OTS',             filterType: 'range' },
              { id:'grp',              label:'GRP',             filterType: 'range' },
              { id:'duration',         label:'Длительность, с', filterType: 'range' },
              { id:'requestHourlyAvg', label:'Запросы/час',     filterType: 'range' },
              { id:'resolution',       label:'Разрешение' },
              { id:'photoReport',      label:'Фотоотчёт',       filterType: 'dropdown' },
              { id:'description',      label:'Описание' },
            ] as col (col.id)}
              <th class="col-hd" on:click={() => toggleSort(col.id)}>
                <span class="col-hd-inner">
                  <span class="col-hd-label"
                    class:col-active={sortCol===col.id
                      || (col.filterType==='range'
                          ? (colFilters[col.id]?.min !== '' || colFilters[col.id]?.max !== '')
                          : colFilters[col.id])}>
                    {col.label}
                  </span>
                  <!-- Sort indicator -->
                  <span class="col-sort" class:visible={sortCol===col.id}>
                    {#if sortCol===col.id}
                      {sortDir===1 ? '↑' : '↓'}
                    {:else}
                      <span style="opacity:.3">⇅</span>
                    {/if}
                  </span>
                  <!-- Filter button (filterable columns only) -->
                  {#if col.filterType}
                    <button
                      class="col-filter-btn"
                      class:col-filter-active={col.filterType==='range'
                        ? (colFilters[col.id]?.min !== '' || colFilters[col.id]?.max !== '')
                        : colFilters[col.id]}
                      title="Фильтр"
                      on:click|stopPropagation={(e) => toggleFilter(col.id, e)}
                    >
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/>
                      </svg>
                    </button>
                    <!-- Filter panel -->
                    {#if openFilterCol === col.id}
                      {#if col.filterType === 'range'}
                        <div class="col-filter-drop range-drop" on:click|stopPropagation>
                          <label class="range-label">От
                            <input class="range-input" type="number" placeholder="—"
                              bind:value={colFilters[col.id].min} />
                          </label>
                          <label class="range-label">До
                            <input class="range-input" type="number" placeholder="—"
                              bind:value={colFilters[col.id].max} />
                          </label>
                          <button class="range-clear" on:click={() => { colFilters[col.id] = {min:'',max:''}; openFilterCol='' }}>Сброс</button>
                        </div>
                      {:else}
                        <div class="col-filter-drop" on:click|stopPropagation>
                          <button class="col-filter-opt" class:sel={!colFilters[col.id]} on:click={() => setColFilter(col.id, '')}>
                            Все
                          </button>
                          {#each colOptions[col.id] ?? [] as opt}
                            <button class="col-filter-opt" class:sel={colFilters[col.id]===opt} on:click={() => setColFilter(col.id, opt)}>
                              {opt || '—'}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  {/if}
                </span>
              </th>
            {/each}
            <th style="width:32px"></th>
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="11" class="table-state-cell">
              <div class="spinner"></div> Загрузка…
            </td></tr>
          {:else if error}
            <tr><td colspan="11" class="table-state-cell" style="color:#EF4444">{error}</td></tr>
          {:else if tabRows.length === 0}
            <tr><td colspan="11" class="table-state-cell">
              {activeTab === 'selected' ? 'Нет выбранных экранов' : 'Экраны не найдены'}
            </td></tr>
          {:else}
            {#each tabRows as s (s.id)}
              <tr class="screen-row" class:sel={isSelected(s.id)} on:click={() => { focusScreen(s); toggleScreen(s.id); renderMarkers(filtered) }}>
                <td on:click|stopPropagation>
                  <input type="checkbox" checked={isSelected(s.id)} on:change={() => { toggleScreen(s.id); renderMarkers(filtered) }} />
                </td>
                <td class="cell-thumb">
                  {#if s.photo}
                    <img src={s.photo} alt="" class="screen-thumb" loading="lazy" />
                  {:else}
                    <div class="screen-thumb-placeholder">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:var(--border)">
                        <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                      </svg>
                    </div>
                  {/if}
                </td>
                <td class="cell-gid">{s.gid || s.id}</td>
                <td class="cell-muted">{s.owner || '—'}</td>
                <td class="cell-muted">{s.city || '—'}</td>
                <td class="cell-muted">{s.side || '—'}</td>
                <td class="cell-muted">{s.format || '—'}</td>
                <td class="cell-muted">{s.size || '—'}</td>
                <td class="cell-bid">{s.minBid != null ? s.minBid.toFixed(2) : '—'}</td>
                <td class="cell-muted">{s.ots != null ? s.ots.toLocaleString('ru-RU') : '—'}</td>
                <td class="cell-muted">{s.grp != null ? s.grp.toLocaleString('ru-RU') : '—'}</td>
                <td class="cell-muted">{s.duration != null ? s.duration.toLocaleString('ru-RU') : '—'}</td>
                <td class="cell-muted">{s.requestHourlyAvg != null ? s.requestHourlyAvg.toLocaleString('ru-RU') : '—'}</td>
                <td class="cell-muted">{s.resolution || '—'}</td>
                <td class="cell-muted">{s.photoReport || '—'}</td>
                <td class="cell-muted">{s.description || '—'}</td>
                <td class="cell-remove" on:click|stopPropagation>
                  {#if isSelected(s.id)}
                    <button class="remove-btn" title="Убрать" on:click={() => { toggleScreen(s.id); renderMarkers(filtered) }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                      </svg>
                    </button>
                  {/if}
                </td>
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
  .screens-map.draw-cursor { cursor: crosshair; }
  :global(.screens-map.draw-cursor .leaflet-interactive) { cursor: crosshair !important; }

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

  .load-bar-track {
    width: 200px;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  .load-bar-fill {
    height: 100%;
    background: var(--navy);
    border-radius: 2px;
    transition: width .3s ease;
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
  .map-tool-btn.active { background: #EFF6FF; color: #2563EB; border: 1.5px solid #2563EB; }

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

  /* ── Column header sort + filter ── */
  .col-hd {
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .col-hd:hover .col-hd-label { color: var(--navy); }
  .col-hd:hover .col-sort { opacity: 1; }

  .col-hd-inner {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    position: relative;
  }

  .col-hd-label { transition: color .1s; }
  .col-hd-label.col-active { color: var(--navy); }

  .col-sort {
    font-size: 10px;
    opacity: 0;
    transition: opacity .1s;
    line-height: 1;
  }
  .col-sort.visible { opacity: 1; }

  .col-filter-btn {
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .col-filter-btn:hover { color: var(--navy); background: var(--chip-bg); }
  .col-filter-btn.col-filter-active { color: var(--navy); }

  .col-filter-drop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 200;
    background: white;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,.14);
    min-width: 160px;
    max-height: 240px;
    overflow-y: auto;
    padding: 4px;
  }

  .col-filter-opt {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    background: none;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .col-filter-opt:hover { background: var(--bg); }
  .col-filter-opt.sel { background: #EFF6FF; color: var(--navy); font-weight: 600; }

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

  .cell-thumb { padding: 4px 8px; }

  .screen-thumb {
    width: 56px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }

  .screen-thumb-placeholder {
    width: 56px;
    height: 36px;
    border-radius: 4px;
    background: var(--bg);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cell-gid {
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    font-size: 11.5px;
    font-family: monospace;
  }

  .cell-bid {
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .cell-remove { padding: 4px 6px; }

  .remove-btn {
    width: 26px;
    height: 26px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity .12s, background .12s;
  }
  .screen-row:hover .remove-btn { opacity: 1; }
  .remove-btn:hover { background: #FEE2E2; color: #EF4444; opacity: 1; }

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

  /* ── Range filter ── */
  .range-drop {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 180px;
  }
  .range-label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .range-input {
    height: 28px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    padding: 0 8px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    outline: none;
    width: 100%;
  }
  .range-input:focus { border-color: var(--navy); }
  .range-clear {
    height: 26px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    font-size: 12px;
    font-family: inherit;
    color: var(--text-muted);
    cursor: pointer;
    margin-top: 2px;
  }
  .range-clear:hover { color: #EF4444; border-color: #EF4444; background: #FEF2F2; }
</style>
