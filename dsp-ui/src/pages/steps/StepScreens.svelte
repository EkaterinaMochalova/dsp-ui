<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import { api } from '../../lib/api.js'
  import { formatMoney } from '../../lib/utils.js'

  const dispatch = createEventDispatcher()
  export let draft

  if (!draft.screenIds) draft.screenIds = []

  let mapEl
  let map
  let markersLayer
  let loading = true
  let error = ''
  let screens = []
  let totalLoaded = 0

  // Filters
  let filterCity = ''
  let filterFormat = ''
  let searchText = ''

  // Derived sets
  $: cities = [...new Set(screens.map(s => s.city).filter(Boolean))].sort()
  $: formats = [...new Set(screens.map(s => s.format).filter(Boolean))].sort()

  $: filtered = screens.filter(s => {
    if (filterCity && s.city !== filterCity) return false
    if (filterFormat && s.format !== filterFormat) return false
    if (searchText) {
      const q = searchText.toLowerCase()
      if (!s.address.toLowerCase().includes(q) && !s.city.toLowerCase().includes(q)) return false
    }
    return true
  })

  $: selectedScreens = screens.filter(s => draft.screenIds.includes(s.id))

  // Re-render markers whenever filtered or selected changes
  $: if (map && markersLayer) renderMarkers(filtered)

  function isSelected(id) { return draft.screenIds.includes(id) }

  function toggleScreen(id) {
    draft.screenIds = isSelected(id)
      ? draft.screenIds.filter(x => x !== id)
      : [...draft.screenIds, id]
  }

  function selectFiltered() {
    draft.screenIds = [...new Set([...draft.screenIds, ...filtered.map(s => s.id)])]
  }

  function clearAll() { draft.screenIds = [] }

  onMount(async () => {
    await loadScreens()
    initMap()
  })

  onDestroy(() => {
    if (map) { map.remove(); map = null }
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
      active: inv.enabled !== false,
      owner: inv.displayOwner?.name || '',
    }
  }

  function initMap() {
    if (!mapEl || map) return

    map = L.map(mapEl, {
      center: [55.75, 37.62],
      zoom: 5,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    markersLayer = L.layerGroup().addTo(map)
    renderMarkers(filtered)

    if (screens.length > 0) {
      const bounds = L.latLngBounds(screens.map(s => [s.lat, s.lon]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
    }
  }

  function renderMarkers(list) {
    if (!markersLayer) return
    markersLayer.clearLayers()

    for (const s of list) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue
      const sel = isSelected(s.id)
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: sel ? 8 : 5,
        fillColor: sel ? '#112853' : '#55C1FA',
        color: sel ? '#112853' : '#2a8fb5',
        weight: sel ? 2 : 1,
        fillOpacity: sel ? 0.95 : 0.75,
      })

      marker.bindTooltip(
        `<strong>${s.address || s.city}</strong><br/>${s.format || ''}${s.minBid ? `<br/>от ${formatMoney(s.minBid)}` : ''}`,
        { direction: 'top', offset: [0, -4] }
      )

      marker.on('click', () => {
        toggleScreen(s.id)
        renderMarkers(filtered)
      })

      markersLayer.addLayer(marker)
    }
  }

  function focusScreen(s) {
    if (map && Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
      map.setView([s.lat, s.lon], 14)
    }
  }
</script>

<div class="screens-shell">
  <div class="screens-layout">
    <!-- Left sidebar: filters + selected list -->
    <div class="screens-sidebar">
      <!-- Filters section -->
      <div class="sb-section">
        <div class="sb-label">Фильтры</div>

        <input
          class="sb-input"
          type="text"
          placeholder="Поиск по адресу…"
          bind:value={searchText}
        />

        <select class="sb-select" bind:value={filterCity}>
          <option value="">Все города</option>
          {#each cities as c}<option value={c}>{c}</option>{/each}
        </select>

        <select class="sb-select" bind:value={filterFormat}>
          <option value="">Все форматы</option>
          {#each formats as f}<option value={f}>{f}</option>{/each}
        </select>

        <div class="sb-stat">
          {#if loading}
            Загрузка экранов…
          {:else if error}
            <span style="color:#EF4444">{error}</span>
          {:else}
            {filtered.length} экранов{filtered.length !== totalLoaded ? ` из ${totalLoaded}` : ''}
          {/if}
        </div>

        <button class="sb-btn-outline" on:click={selectFiltered} disabled={filtered.length === 0 || loading}>
          Выбрать все
        </button>
      </div>

      <!-- Selected screens section -->
      <div class="sb-section sb-selected-section">
        <div class="sb-label">
          Выбрано
          <span class="sb-badge">{draft.screenIds.length}</span>
          {#if draft.screenIds.length > 0}
            <button class="sb-clear" on:click={clearAll}>Сбросить</button>
          {/if}
        </div>

        {#if selectedScreens.length === 0}
          <div class="sb-empty">Кликните по маркеру на карте для выбора</div>
        {:else}
          <div class="sb-list">
            {#each selectedScreens as s (s.id)}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div class="sb-item" on:click={() => focusScreen(s)} role="button" tabindex="0">
                <div class="sb-item-addr">{s.address || '—'}</div>
                <div class="sb-item-meta">
                  {s.city}{s.format ? ` · ${s.format}` : ''}{s.minBid ? ` · от ${formatMoney(s.minBid)}` : ''}
                </div>
                <button class="sb-remove" on:click|stopPropagation={() => toggleScreen(s.id)}>×</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Map -->
    <div class="screens-map-wrap">
      {#if loading}
        <div class="map-overlay">
          <div class="spinner"></div>
          Загружаю экраны…
        </div>
      {/if}
      <div bind:this={mapEl} class="screens-map"></div>
    </div>
  </div>

  <!-- Step nav -->
  <div class="step-nav screens-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <span class="screens-count-label">
      {draft.screenIds.length > 0 ? `Выбрано: ${draft.screenIds.length} экранов` : 'Экраны не выбраны'}
    </span>
    <button class="btn-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>
</div>

<style>
  /* Shell fills the main-content column flex */
  .screens-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .screens-layout {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  .screens-sidebar {
    width: 268px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    background: #fff;
  }

  .sb-section {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .sb-selected-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    border-bottom: none;
  }

  .sb-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--text-muted);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sb-badge {
    background: var(--navy);
    color: #fff;
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
  }

  .sb-clear {
    margin-left: auto;
    background: none;
    border: none;
    color: #EF4444;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .sb-clear:hover { text-decoration: underline; }

  .sb-input, .sb-select {
    width: 100%;
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    color: var(--text);
    background: #fff;
    padding: 0 8px;
    margin-bottom: 7px;
    outline: none;
    box-sizing: border-box;
  }
  .sb-input:focus, .sb-select:focus { border-color: var(--navy); }

  .sb-stat {
    font-size: 11.5px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .sb-btn-outline {
    width: 100%;
    height: 28px;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    background: none;
    color: var(--navy);
    font-size: 11.5px;
    font-family: inherit;
    cursor: pointer;
    font-weight: 600;
  }
  .sb-btn-outline:hover:not(:disabled) { background: var(--navy-light); }
  .sb-btn-outline:disabled { opacity: .4; cursor: default; }

  .sb-empty {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
    padding: 4px 0;
  }

  .sb-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 8px;
  }

  .sb-item {
    position: relative;
    padding: 7px 26px 7px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    background: var(--bg);
    transition: background .12s;
  }
  .sb-item:hover { background: var(--navy-light); }

  .sb-item-addr {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sb-item-meta {
    font-size: 10.5px;
    color: var(--text-muted);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sb-remove {
    position: absolute;
    top: 5px;
    right: 5px;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }
  .sb-remove:hover { color: #EF4444; }

  /* ── Map ── */
  .screens-map-wrap {
    flex: 1;
    position: relative;
    min-width: 0;
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

  /* ── Step nav ── */
  .screens-nav {
    border-top: 1px solid var(--border);
    padding: 12px 24px;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    background: #fff;
  }

  .screens-count-label {
    font-size: 12.5px;
    color: var(--text-muted);
  }
</style>
