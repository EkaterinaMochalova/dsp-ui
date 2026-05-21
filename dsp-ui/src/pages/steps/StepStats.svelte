<script>
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte'
  import { api } from '../../lib/api.js'
  import { formatMoney } from '../../lib/utils.js'
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'

  const dispatch = createEventDispatcher()
  export let draft

  const campId = draft.id ?? draft.campaignId

  // ── Tab state ─────────────────────────────────────────────────────────────
  let activeTab = 'table'

  // ── KPI summary ───────────────────────────────────────────────────────────
  let kpi = null
  let kpiLoading = true

  // ── Table tab ─────────────────────────────────────────────────────────────
  // Raw rows fetched from the server (one server-page at a time in normal mode,
  // or a large batch when a filter is active so client-side filtering has enough data)
  let allRows    = []    // full server batch currently loaded
  let srvPage    = 0     // server page index
  let srvTotal   = 0     // total records on server (unfiltered)
  let srvPages   = 1     // total server pages
  const SRV_NORMAL  = 50   // rows per server fetch in normal (no-filter) mode
  const SRV_FILTER  = 500  // large batch when a filter is active
  let impLoading = false
  let impError   = ''

  // Client-side view pagination (applied on top of local filtering)
  const VIEW_SIZE = 20
  let viewPage = 0

  // ── Photo report helpers ─────────────────────────────────────────────────
  // The API may return the photo URL under various field names.
  function getPhotoUrl(row) {
    return row.shotUrl
      ?? row.photoUrl
      ?? row.shot?.url
      ?? row.shot?.fileUrl
      ?? row.photoReport?.url
      ?? row.photoReport?.fileUrl
      ?? row.shots?.[0]?.url
      ?? row.shots?.[0]?.fileUrl
      ?? row.mediaShot?.url
      ?? null
  }
  let lightboxUrl = null  // currently shown full-size photo

  // ── Column visibility ─────────────────────────────────────────────────────
  const COL_VIS_KEY = 'dsp_imp_col_vis'
  const COL_DEFS = [
    { key: 'date',     label: 'Дата/Время' },
    { key: 'local',    label: 'Местное время' },
    { key: 'screen',   label: 'Экран' },
    { key: 'format',   label: 'Формат' },
    { key: 'creative', label: 'Креатив' },
    { key: 'photo',    label: 'Фотоотчет' },
    { key: 'status',   label: 'Статус' },
    { key: 'reason',   label: 'Причина отказа' },
    { key: 'ots',      label: 'OTS' },
    { key: 'cost',     label: 'Стоимость' },
  ]
  let colVis = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_VIS_KEY))
      if (saved && typeof saved === 'object') return { ...Object.fromEntries(COL_DEFS.map(c => [c.key, true])), ...saved }
    } catch {}
    return Object.fromEntries(COL_DEFS.map(c => [c.key, true]))
  })()
  let colPickerOpen = false
  function toggleColVis(key) {
    colVis = { ...colVis, [key]: !colVis[key] }
    try { localStorage.setItem(COL_VIS_KEY, JSON.stringify(colVis)) } catch {}
  }
  $: visibleColCount = COL_DEFS.filter(c => colVis[c.key]).length

  // ── Sort ──────────────────────────────────────────────────────────────────
  let sortCol = 'date'   // default: newest first
  let sortDir = -1       // -1 = desc, 1 = asc

  function toggleSort(col) {
    if (sortCol === col) sortDir = -sortDir
    else { sortCol = col; sortDir = 1 }
    viewPage = 0
  }

  function sortVal(r, col) {
    if (col === 'date')     return r.showTime ?? 0
    if (col === 'local')    return r.inventoryShowTime ?? ''
    if (col === 'screen')   return r.inventory?.name ?? ''
    if (col === 'format')   return r.inventoryFormat ?? ''
    if (col === 'creative') return r.media?.name ?? ''
    if (col === 'status')   return r.bidRequestState ?? ''
    if (col === 'reason')   return r.failureReasonCodeName ?? r.failureReasonType ?? ''
    if (col === 'ots')      return r.ots ?? r.opOts ?? 0
    if (col === 'cost')     return r.chargedPrice ?? 0
    return ''
  }

  // ── Column filter popover ─────────────────────────────────────────────────
  let openFilterCol = ''
  let filterDropSearch = ''

  function toggleFilter(col) {
    openFilterCol = openFilterCol === col ? '' : col
    filterDropSearch = ''
  }

  function onDocClick() { openFilterCol = '' }

  // Filters (all client-side — API ignores these as query params)
  let filterStatus   = ''   // '' | 'SUCCESS' | 'FAILED'
  let filterDateFrom = ''   // YYYY-MM-DD
  let filterDateTo   = ''   // YYYY-MM-DD
  let filterLocal    = ''   // free-text on local time string (e.g. "13" matches 13:xx)
  let filterScreen   = ''   // free-text search on inventory name + address
  let filterFormat   = ''   // exact match on inventoryFormat
  let filterCreative = ''   // free-text search on media.name
  let filterReason   = ''   // exact match on failureReasonCodeName/Type
  let filterOtsMin   = ''   // numeric min for OTS
  let filterOtsMax   = ''   // numeric max for OTS
  let filterCostMin  = ''   // numeric min for charged price
  let filterCostMax  = ''   // numeric max for charged price

  $: hasAnyFilter = !!(filterStatus || filterDateFrom || filterDateTo || filterLocal ||
                       filterScreen || filterFormat || filterCreative || filterReason ||
                       filterOtsMin || filterOtsMax || filterCostMin || filterCostMax)

  // Derived: filtered rows
  $: filteredRows = allRows.filter(r => {
    if (filterStatus === 'SUCCESS' && r.bidRequestState !== 'SUCCESS') return false
    if (filterStatus === 'FAILED'  && r.bidRequestState === 'SUCCESS') return false
    if (filterFormat   && r.inventoryFormat !== filterFormat) return false
    if (filterReason) {
      const reason = r.failureReasonCodeName ?? r.failureReasonType ?? ''
      if (reason !== filterReason) return false
    }
    if (filterLocal) {
      const localStr = fmtLocalTime(r.inventoryShowTime)
      if (!localStr.includes(filterLocal)) return false
    }
    if (filterScreen) {
      const haystack = `${r.inventory?.name ?? ''} ${r.address ?? ''} ${r.inventoryGid ?? ''}`.toLowerCase()
      if (!haystack.includes(filterScreen.toLowerCase())) return false
    }
    if (filterCreative) {
      if (!(r.media?.name ?? '').toLowerCase().includes(filterCreative.toLowerCase())) return false
    }
    if (filterDateFrom || filterDateTo) {
      const d = r.showTime ? new Date(r.showTime).toISOString().slice(0, 10) : ''
      if (filterDateFrom && d < filterDateFrom) return false
      if (filterDateTo   && d > filterDateTo)   return false
    }
    if (filterOtsMin !== '' || filterOtsMax !== '') {
      const ots = r.ots ?? r.opOts ?? 0
      if (filterOtsMin !== '' && ots < Number(filterOtsMin)) return false
      if (filterOtsMax !== '' && ots > Number(filterOtsMax)) return false
    }
    if (filterCostMin !== '' || filterCostMax !== '') {
      const cost = r.chargedPrice ?? 0
      if (filterCostMin !== '' && cost < Number(filterCostMin)) return false
      if (filterCostMax !== '' && cost > Number(filterCostMax)) return false
    }
    return true
  })
  $: sortedRows = sortCol
    ? [...filteredRows].sort((a, b) => {
        const av = sortVal(a, sortCol), bv = sortVal(b, sortCol)
        return av < bv ? -sortDir : av > bv ? sortDir : 0
      })
    : filteredRows
  $: viewRows       = sortedRows.slice(viewPage * VIEW_SIZE, (viewPage + 1) * VIEW_SIZE)
  $: viewTotalPages = Math.max(1, Math.ceil(sortedRows.length / VIEW_SIZE))

  // Dropdown options derived from full loaded dataset
  $: formats = [...new Set(allRows.map(r => r.inventoryFormat).filter(Boolean))].sort()
  $: reasons = [...new Set(
      allRows.map(r => r.failureReasonCodeName ?? r.failureReasonType).filter(Boolean)
    )].sort()

  // True when we have the full server dataset loaded locally
  $: hasFullDataset = srvTotal > 0 && allRows.length >= srvTotal

  // ── Chart tab ─────────────────────────────────────────────────────────────
  // chartMetric drives which endpoint is called and how the Y-axis is labelled
  // 'impressions' → /impression-chart-stats/impressions
  // 'cost'        → /impression-chart-stats/cost   (avgStats=true)
  // 'ots'         → /impression-chart-stats/ots    (avgStats=true)
  let chartMetric = 'impressions'
  let chartData = {}
  let chartLoading = false
  let chartError = ''
  const today = new Date().toISOString().slice(0, 10)
  // The most recent day that this campaign was (or is) active — used as default
  const _latestDay = (() => {
    if (!draft.endDate) return today
    return draft.endDate < today ? draft.endDate : today
  })()
  // BY_HOURS shows a single day; default to last active day.
  // BY_DAYS shows a range; dates will expand when the user switches.
  let chartGroupType = 'BY_HOURS'
  let chartFrom = _latestDay
  let chartTo   = _latestDay

  // ── Map tab ───────────────────────────────────────────────────────────────
  let mapEl = null
  let map = null
  let invStats = []
  let mapLoading = false
  let mapError = ''
  let mapInited = false

  // ── Screens tab ───────────────────────────────────────────────────────────
  // Resizable columns: Экран | GID | Город | Оператор | Формат | Выходы | OTS | Бюджет | CPM | Фото
  const _SCR_CW_KEY = 'dsp_scrn_col_w'
  const _SCR_CW_DEF = [200, 72, 100, 130, 100, 80, 80, 100, 72, 60]
  let scrnColW = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(_SCR_CW_KEY))
      if (Array.isArray(s) && s.length === _SCR_CW_DEF.length) return s
    } catch {}
    return [..._SCR_CW_DEF]
  })()
  function scrnRzStart(idx, e) {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = scrnColW[idx]
    const onMove = ev => { scrnColW = scrnColW.map((v, i) => i === idx ? Math.max(40, w0 + ev.clientX - x0) : v) }
    const onUp   = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      try { localStorage.setItem(_SCR_CW_KEY, JSON.stringify(scrnColW)) } catch {}
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  let scrnSortCol = 'showed'
  let scrnSortDir = -1

  // ── Screens+Map combined filter ───────────────────────────────────────────
  let scrnSearch   = ''
  let scrnActivity = ''   // '' | 'high' | 'mid' | 'low' | 'none'
  let highlightedInvId = null
  let scrnRowEls = {}     // invId → <tr> DOM element

  $: maxShowed = Math.max(...invStats.map(r => r.totalShowed ?? 0), 1)

  function showedColor(n) {
    if (n === 0) return '#EF4444'
    const ratio = n / maxShowed
    return ratio >= 0.67 ? '#22C55E' : ratio >= 0.33 ? '#EAB308' : '#F97316'
  }
  function activityTier(n) {
    if (n === 0) return 'none'
    const ratio = n / maxShowed
    return ratio >= 0.67 ? 'high' : ratio >= 0.33 ? 'mid' : 'low'
  }
  $: scrnFilteredRows = scrnSortedRows.filter(row => {
    const showed = row.totalShowed ?? 0
    if (scrnActivity && activityTier(showed) !== scrnActivity) return false
    if (scrnSearch.trim()) {
      const s = screenObjMap.get(row.inventory?.id)
      const q = scrnSearch.trim().toLowerCase()
      const name = (row.inventory?.name ?? '').toLowerCase()
      const addr = (s?.address ?? '').toLowerCase()
      const gid  = (s?.gid  ?? '').toLowerCase()
      const city = (s?.city ?? '').toLowerCase()
      if (!name.includes(q) && !addr.includes(q) && !gid.includes(q) && !city.includes(q)) return false
    }
    return true
  })

  // Map marker layer — cleared & rebuilt when filter changes
  let markerLayer = null
  let markerByInvId = new Map()

  function updateMapMarkers(rows) {
    if (!map) return
    if (!markerLayer) markerLayer = L.layerGroup().addTo(map)
    else markerLayer.clearLayers()
    markerByInvId.clear()

    const valid = rows.filter(r => r.inventory?.location?.latitude)
    for (const row of valid) {
      const loc = row.inventory.location
      const n   = row.totalShowed ?? 0
      const s   = screenObjMap.get(row.inventory?.id)
      const marker = L.circleMarker([loc.latitude, loc.longitude], {
        radius: 8, fillColor: showedColor(n), color: '#fff', weight: 1.5, fillOpacity: 0.9,
      })
        .bindPopup(
          `<b>${row.inventory.name ?? ''}</b><br>` +
          (s?.address ? `<span style="font-size:11px;color:#666">${s.address}${s.city ? ', '+s.city : ''}</span><br>` : '') +
          (s?.gid     ? `GID: ${s.gid}<br>` : '') +
          `Показы: ${fmt(n)}<br>` +
          `OTS: ${fmt(row.totalOpOts ?? row.totalOts ?? row.totalDmpOts)}<br>` +
          `CPM: ${fmt(row.cpm, 2)} ₽<br>` +
          `Стоимость: ${formatMoney(row.totalShowedBudget ?? row.showPrice ?? 0)}`
        )
        .on('click', () => {
          highlightedInvId = row.inventory.id
          const el = scrnRowEls[row.inventory.id]
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
        .addTo(markerLayer)
      markerByInvId.set(row.inventory.id, marker)
    }

    if (valid.length) {
      map.fitBounds(
        L.latLngBounds(valid.map(r => [r.inventory.location.latitude, r.inventory.location.longitude])),
        { padding: [40, 40], maxZoom: 13 }
      )
    }
  }

  function selectRowOnMap(row) {
    if (!row.inventory?.location?.latitude) return
    highlightedInvId = row.inventory.id
    const marker = markerByInvId.get(row.inventory.id)
    if (marker && map) {
      map.setView([row.inventory.location.latitude, row.inventory.location.longitude], 14, { animate: true })
      setTimeout(() => marker.openPopup(), 300)
    }
  }

  // Reactively update markers when filter changes (after map is ready)
  $: if (map && scrnFilteredRows) updateMapMarkers(scrnFilteredRows)

  function toggleScrnSort(col) {
    if (scrnSortCol === col) scrnSortDir = -scrnSortDir
    else { scrnSortCol = col; scrnSortDir = -1 }
  }

  // Cross-reference map: inventoryId → screenObject (from draft)
  $: screenObjMap = new Map(
    (draft.screenObjects ?? []).filter(s => s?.id).map(s => [s.id, s])
  )

  function scrnSortVal(r, col) {
    const s = screenObjMap.get(r.inventory?.id)
    if (col === 'name')   return r.inventory?.name ?? ''
    if (col === 'gid')    return s?.gid ?? ''
    if (col === 'city')   return s?.city ?? ''
    if (col === 'owner')  return s?.owner ?? ''
    if (col === 'format') return s?.format ?? ''
    if (col === 'showed') return r.totalShowed ?? 0
    if (col === 'budget') return r.totalShowedBudget ?? r.customerStats?.budgetShowed ?? 0
    if (col === 'ots')    return r.totalOpOts ?? r.totalOts ?? r.totalEstimatedOts ?? 0
    if (col === 'cpm')    return r.cpm ?? 0
    if (col === 'shots')  return r.shotCount ?? 0
    return ''
  }

  $: scrnSortedRows = [...invStats].sort((a, b) => {
    const av = scrnSortVal(a, scrnSortCol), bv = scrnSortVal(b, scrnSortCol)
    return av < bv ? -scrnSortDir : av > bv ? scrnSortDir : 0
  })

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmt(n, dec = 0) {
    if (n == null || n === '') return '—'
    return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  }

  function fmtMs(ms) {
    if (!ms) return '—'
    return new Date(ms).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  function fmtLocalTime(isoStr) {
    // Parse as local time (no Z suffix from the server = local time already)
    // If it does have Z/offset, toLocaleTimeString converts to browser locale
    if (!isoStr) return '—'
    const d = new Date(isoStr.endsWith('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z')
    if (isNaN(d)) return isoStr.slice(11, 19)
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function dateToMs(dateStr) {
    if (!dateStr) return null
    // Always produce UTC midnight so the server (which uses UTC) sees the right day.
    // new Date("YYYY-MM-DD") parses as UTC per spec; adding T00:00:00 makes it *local* — avoid that.
    return new Date(dateStr).getTime()  // "YYYY-MM-DD" → UTC midnight per spec
  }

  const IMP_STATUS = {
    SUCCESS:               { label: 'Показан',           cls: 'badge-green' },
    FAILED:                { label: 'Не показан',         cls: 'badge-red'   },
    LOST_IN_INNER_AUCTION: { label: 'Внутр. аукцион',    cls: 'badge-orange' },
    LOST_IN_AUCTION:       { label: 'Проигр. аукцион',   cls: 'badge-orange' },
  }

  function impStatus(row) {
    return IMP_STATUS[row.bidRequestState] ?? { label: row.bidRequestState ?? '—', cls: 'badge-gray' }
  }

  // ── On mount ──────────────────────────────────────────────────────────────
  onMount(async () => {
    document.addEventListener('click', onDocClick)
    if (!campId) { kpiLoading = false; return }
    loadKpi()
    loadImpressions(0)
  })

  onDestroy(() => {
    document.removeEventListener('click', onDocClick)
    if (map) { map.remove(); map = null }
  })

  // ── KPI — aggregate from inventory-stats (reliable per-inventory breakdown) ─
  async function loadKpi() {
    kpiLoading = true
    try {
      const rows = await api.stats.inventoryStats(campId)
      if (!Array.isArray(rows) || !rows.length) { kpiLoading = false; return }
      invStats = rows   // shared with map + screens tabs — avoids a duplicate API call
      let showed = 0, ots = 0, budget = 0, cpmSum = 0, cpmCount = 0
      for (const r of rows) {
        showed  += r.totalShowed ?? 0
        ots     += r.totalOpOts ?? r.totalOts ?? 0
        budget  += r.totalShowedBudget ?? r.customerStats?.budgetShowed ?? r.showPrice ?? 0
        if (r.cpm) { cpmSum += r.cpm; cpmCount++ }
      }
      kpi = { showed, ots, budget, cpm: cpmCount ? cpmSum / cpmCount : 0 }
    } catch { kpi = null }
    kpiLoading = false
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  // Normal mode: load one server page (SRV_NORMAL rows).
  // Filter mode: fetch ALL pages in parallel and concatenate — ensures filtered
  // results span the entire dataset, not just the first batch.
  async function loadImpressions(page) {
    if (!campId) return
    impLoading = true; impError = ''
    try {
      const data = await api.stats.list(campId, { page, size: SRV_NORMAL, sort: 'showTime,desc' })
      allRows  = data.content ?? []
      srvTotal = data.totalElements ?? 0
      srvPages = data.totalPages ?? 1
      srvPage  = page
      viewPage = 0
    } catch { impError = 'Не удалось загрузить показы' }
    impLoading = false
  }

  // Load ALL server pages in parallel and concatenate — used when a filter is active
  // so client-side filtering covers the full dataset (e.g. 6 successes spread across
  // 1541 total rows that span multiple pages).
  async function loadAllForFilter() {
    if (!campId) return
    impLoading = true; impError = ''
    try {
      // Page 0 first so we know totalPages
      const first = await api.stats.list(campId, { page: 0, size: SRV_FILTER, sort: 'showTime,desc' })
      const total = first.totalElements ?? 0
      const pages = first.totalPages ?? 1
      let rows = first.content ?? []

      if (pages > 1) {
        const rest = await Promise.all(
          Array.from({ length: pages - 1 }, (_, i) =>
            api.stats.list(campId, { page: i + 1, size: SRV_FILTER, sort: 'showTime,desc' })
              .then(d => d.content ?? []).catch(() => [])
          )
        )
        rows = [...rows, ...rest.flat()]
      }

      allRows  = rows
      srvTotal = total
      srvPages = 1     // all data is now local, no further server paging needed
      srvPage  = 0
      viewPage = 0
    } catch { impError = 'Не удалось загрузить показы' }
    impLoading = false
  }

  // Compute "has any active filter" from current variable values directly.
  // We cannot use the reactive $: hasAnyFilter here because Svelte batches reactive
  // updates — reading $: vars immediately after setting a dependency gives stale values.
  function anyFilterActive() {
    return !!(filterStatus || filterDateFrom || filterDateTo || filterLocal ||
              filterScreen || filterFormat || filterCreative || filterReason ||
              filterOtsMin || filterOtsMax || filterCostMin || filterCostMax)
  }

  // Called by the top-level status pills and the Статус column dropdown
  function applyFilter() {
    viewPage = 0
    if (anyFilterActive()) {
      if (!hasFullDataset) loadAllForFilter()
      // else: reactive filteredRows recomputes automatically from allRows
    } else {
      loadImpressions(0)
    }
  }

  // Called by column-header filter inputs (debounced so typing doesn't spam)
  let _colFilterTimer = null
  function applyColumnFilter() {
    viewPage = 0
    clearTimeout(_colFilterTimer)
    _colFilterTimer = setTimeout(() => {
      if (anyFilterActive() && !hasFullDataset) loadAllForFilter()
      // else: reactive filteredRows recomputes automatically
    }, 220)
  }

  // ── Chart ─────────────────────────────────────────────────────────────────
  // Map UI metric key → API endpoint suffix and whether avgStats is needed
  const METRICS = [
    { key: 'impressions', label: 'Показы',    color: '#6366f1', avgStats: false },
    { key: 'cost',        label: 'Стоимость', color: '#10b981', avgStats: true  },
    { key: 'ots',         label: 'OTS',       color: '#0ea5e9', avgStats: true  },
  ]
  $: activeMetric = METRICS.find(m => m.key === chartMetric) ?? METRICS[0]

  async function loadChart() {
    if (!campId) return
    chartLoading = true; chartError = ''
    try {
      const metric = activeMetric
      const params = { chartGroupType }
      if (metric.avgStats) params.avgStats = true
      const f = dateToMs(chartFrom)
      const t = dateToMs(chartTo)
      if (chartGroupType === 'BY_HOURS') {
        // Server expects start=end=UTC midnight of the single day being viewed.
        // Prod app sends identical values for both params.
        const day = f ?? t
        if (day != null) { params.start = day; params.end = day }
      } else {
        // BY_DAYS: send full inclusive range (end = start of last day + 23:59:59.999)
        if (f != null) params.start = f
        if (t != null) params.end   = t + 86399999
      }
      chartData = await api.stats.chart(campId, metric.key, params) ?? {}
    } catch (e) {
      chartError = 'Не удалось загрузить данные графика'
      chartData = {}
    }
    chartLoading = false
  }

  function onTabChange(tab) {
    activeTab = tab
    if (tab === 'chart'   && !Object.keys(chartData).length) loadChart()
    // Screens tab now hosts the map — init on first open
    if (tab === 'screens' && !mapInited && !mapLoading) scheduleMapLoad()
    else if (tab === 'screens' && map) setTimeout(() => map?.invalidateSize(), 150)
  }

  function setGroupType(type) {
    if (type === chartGroupType) return
    chartGroupType = type
    if (type === 'BY_HOURS') {
      // Collapse to single day: use the to-date as the day
      chartFrom = chartTo
    } else {
      // Expand back to campaign range
      chartFrom = draft.startDate ?? _latestDay
    }
    chartData = {}
    loadChart()
  }

  async function scheduleMapLoad() {
    if (!campId || mapLoading) return
    // Reuse invStats already populated by loadKpi() — avoids a duplicate fetch.
    if (invStats.length === 0) {
      mapLoading = true; mapError = ''
      try {
        invStats = await api.stats.inventoryStats(campId) ?? []
      } catch { mapError = 'Не удалось загрузить данные карты'; invStats = [] }
      mapLoading = false
    }
    await tick()
    initMap()
  }

  // ── Chart SVG ─────────────────────────────────────────────────────────────
  const SVG_W = 760, SVG_H = 180
  const PAD = { t: 12, r: 12, b: 34, l: 52 }
  const CW = SVG_W - PAD.l - PAD.r
  const CH = SVG_H - PAD.t - PAD.b

  $: chartPoints = Object.values(chartData).sort((a, b) => a.date < b.date ? -1 : 1)
  // Each endpoint returns the metric value in the 'value' field
  $: chartVals   = chartPoints.map(p => Number(p.value ?? 0))
  $: chartMax    = Math.max(...chartVals, 1)

  function ptX(i, total) { return PAD.l + (i / Math.max(total - 1, 1)) * CW }
  function ptY(v)         { return PAD.t + (1 - v / chartMax) * CH }

  $: linePath = chartVals.length ? chartVals.map((v, i) =>
    `${i === 0 ? 'M' : 'L'}${ptX(i, chartVals.length).toFixed(1)},${ptY(v).toFixed(1)}`
  ).join(' ') : ''

  $: fillPath = (() => {
    if (!chartVals.length) return ''
    const pts = chartVals.map((v, i) => `${ptX(i, chartVals.length).toFixed(1)},${ptY(v).toFixed(1)}`)
    const bL  = PAD.l.toFixed(1)
    const bR  = (PAD.l + CW).toFixed(1)
    const bY  = (PAD.t + CH).toFixed(1)
    return `M${pts.join(' L')} L${bR},${bY} L${bL},${bY} Z`
  })()

  $: yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y:   (PAD.t + (1 - f) * CH).toFixed(1),
    val: f * chartMax,
  }))

  $: xStep  = chartPoints.length > 24 ? Math.ceil(chartPoints.length / 8) : chartPoints.length > 8 ? 3 : 1
  $: xTicks = chartPoints.reduce((acc, pt, i) => {
    if (i % xStep === 0 || i === chartPoints.length - 1)
      acc.push({ x: ptX(i, chartPoints.length).toFixed(1), label: fmtXLabel(pt) })
    return acc
  }, [])

  function fmtXLabel(pt) {
    if (!pt?.date) return ''
    if (chartGroupType === 'BY_DAYS') {
      return pt.date.slice(5, 10).replace('-', '.')
    }
    // BY_HOURS: convert UTC datetime string to local browser time
    try {
      const d = new Date(pt.date.includes('T') ? pt.date + 'Z' : pt.date)
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    } catch { return pt.date.slice(11, 16) }
  }

  function fmtYVal(v) {
    if (chartMetric === 'cost') return formatMoney(v).replace(' ₽', '')
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
    return fmt(v)
  }

  // ── Map ───────────────────────────────────────────────────────────────────
  function initMap() {
    if (map) { map.remove(); map = null; markerLayer = null; markerByInvId.clear() }
    if (!mapEl) return
    if (!invStats.filter(r => r.inventory?.location?.latitude).length) return

    map = L.map(mapEl, { center: [55.75, 37.62], zoom: 5, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    mapInited = true
    updateMapMarkers(scrnFilteredRows)
  }
</script>

<div class="step-content stats-root">
  <h1 class="step-title">Статистика</h1>

  <!-- ── KPI cards ─────────────────────────────────────────────────────────── -->
  {#if kpiLoading}
    <div class="kpi-row">
      {#each [0,1,2,3] as _}
        <div class="kpi-card kpi-skeleton"></div>
      {/each}
    </div>
  {:else if kpi}
    <div class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">Выходы</span>
        <span class="kpi-val">{fmt(kpi.showed)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">OTS</span>
        <span class="kpi-val">{fmt(kpi.ots)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">CPM, ₽</span>
        <span class="kpi-val">{fmt(kpi.cpm, 2)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Потрачено</span>
        <span class="kpi-val spend">{formatMoney(kpi.budget)}</span>
        {#if draft.budget > 0}
          {@const pct = Math.min(100, Math.round(kpi.budget / draft.budget * 100))}
          <div class="kpi-bar"><div class="kpi-bar-fill" style="width:{pct}%"></div></div>
          <span class="kpi-pct">{pct}% от бюджета</span>
        {/if}
      </div>
      {#if draft.budget > 0}
        <div class="kpi-card">
          <span class="kpi-label">Остаток</span>
          <span class="kpi-val">{formatMoney(Math.max(0, draft.budget - kpi.budget))}</span>
        </div>
      {/if}
    </div>
  {:else if !campId}
    <div class="empty-note">Сохраните кампанию, чтобы увидеть статистику.</div>
  {:else}
    <div class="empty-note">Данные появятся после первых показов.</div>
  {/if}

  <!-- ── Tabs ───────────────────────────────────────────────────────────────── -->
  {#if campId}
    <div class="tabs">
      <button class="tab" class:active={activeTab==='table'}   on:click={() => onTabChange('table')}>Показы</button>
      <button class="tab" class:active={activeTab==='screens'} on:click={() => onTabChange('screens')}>Экраны</button>
      <button class="tab" class:active={activeTab==='chart'}   on:click={() => onTabChange('chart')}>Графики</button>
    </div>

    <!-- ── TABLE TAB ─────────────────────────────────────────────────────────── -->
    {#if activeTab === 'table'}
      <!-- Status filter bar + count -->
      <div class="filter-bar">
        <div class="filter-group">
          <span class="filter-label">Статус</span>
          <div class="filter-pills">
            <button class="filter-pill" class:active={filterStatus === ''}        on:click={() => { filterStatus = '';        applyFilter() }}>Все</button>
            <button class="filter-pill" class:active={filterStatus === 'SUCCESS'} on:click={() => { filterStatus = 'SUCCESS'; applyFilter() }}>Показан</button>
            <button class="filter-pill" class:active={filterStatus === 'FAILED'}  on:click={() => { filterStatus = 'FAILED';  applyFilter() }}>Не показан</button>
          </div>
        </div>
        <div style="flex:1"></div>
        <span class="filter-count">
          {#if hasAnyFilter}
            {fmt(filteredRows.length)} из {fmt(srvTotal)}
            {#if impLoading}<span class="filter-loading">…</span>{/if}
          {:else}
            {fmt(srvTotal)} записей
          {/if}
        </span>
        {#if hasAnyFilter}
          <button class="filter-clear" on:click={() => {
            filterStatus=''; filterDateFrom=''; filterDateTo=''; filterLocal='';
            filterScreen=''; filterFormat=''; filterCreative=''; filterReason='';
            filterOtsMin=''; filterOtsMax=''; filterCostMin=''; filterCostMax='';
            applyFilter()
          }}>× Сбросить</button>
        {/if}
        <!-- Column chooser -->
        <div style="position:relative">
          <button class="col-picker-btn" class:active={colPickerOpen} title="Столбцы" on:click|stopPropagation={() => colPickerOpen = !colPickerOpen}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z"/>
            </svg>
          </button>
          {#if colPickerOpen}
            <div class="col-picker-drop" on:click|stopPropagation>
              <div class="col-picker-title">Столбцы</div>
              {#each COL_DEFS as col}
                <label class="col-picker-row">
                  <input type="checkbox" checked={colVis[col.key]} on:change={() => toggleColVis(col.key)} />
                  {col.label}
                </label>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="step-card tab-panel" style="padding:0;overflow:hidden">
        {#if impLoading && allRows.length === 0}
          <div class="panel-loading"><div class="spinner"></div> Загрузка…</div>
        {:else if impError}
          <div class="panel-error">{impError}</div>
        {:else if allRows.length === 0}
          <div class="panel-empty">Показы ещё не зафиксированы.</div>
        {:else}
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  {#if colVis.date}<!-- Дата/Время -->
                  <th style="position:relative">
                    <div class="th-inner">
                      <button class="th-sort-btn" on:click={() => toggleSort('date')}>
                        Дата/Время
                        {#if sortCol==='date'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                      <button class="th-filter-btn" class:active={filterDateFrom||filterDateTo}
                        on:click|stopPropagation={() => toggleFilter('date')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                    {#if openFilterCol==='date'}
                      <div class="th-filter-drop" on:click|stopPropagation>
                        <label class="fd-label">С <input class="fd-input" type="date" bind:value={filterDateFrom} on:input={applyColumnFilter}/></label>
                        <label class="fd-label">По <input class="fd-input" type="date" bind:value={filterDateTo} on:input={applyColumnFilter}/></label>
                        <button class="fd-clear" on:click={() => { filterDateFrom=''; filterDateTo=''; applyColumnFilter(); openFilterCol='' }}>Сброс</button>
                      </div>
                    {/if}
                  </th>{/if}
                  {#if colVis.local}<!-- Местное -->
                  <th style="position:relative">
                    <div class="th-inner">
                      <button class="th-sort-btn" on:click={() => toggleSort('local')}>
                        Местное
                        {#if sortCol==='local'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                      <button class="th-filter-btn" class:active={filterLocal}
                        on:click|stopPropagation={() => toggleFilter('local')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                    {#if openFilterCol==='local'}
                      <div class="th-filter-drop" on:click|stopPropagation>
                        <input class="fd-input" type="text" placeholder="чч:мм" bind:value={filterLocal} on:input={applyColumnFilter}/>
                        <button class="fd-clear" on:click={() => { filterLocal=''; applyColumnFilter(); openFilterCol='' }}>Сброс</button>
                      </div>
                    {/if}
                  </th>{/if}
                  {#if colVis.screen}<!-- Экран -->
                  <th style="position:relative">
                    <div class="th-inner">
                      <button class="th-sort-btn" on:click={() => toggleSort('screen')}>
                        Экран
                        {#if sortCol==='screen'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                      <button class="th-filter-btn" class:active={filterScreen}
                        on:click|stopPropagation={() => toggleFilter('screen')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                    {#if openFilterCol==='screen'}
                      <div class="th-filter-drop" on:click|stopPropagation>
                        <input class="fd-input" type="text" placeholder="Поиск…" bind:value={filterScreen} on:input={applyColumnFilter}/>
                        <button class="fd-clear" on:click={() => { filterScreen=''; applyColumnFilter(); openFilterCol='' }}>Сброс</button>
                      </div>
                    {/if}
                  </th>{/if}
                  {#if colVis.format}
                  <!-- Формат -->
                  <th style="position:relative">
                    <div class="th-inner">
                      <button class="th-sort-btn" on:click={() => toggleSort('format')}>
                        Формат
                        {#if sortCol==='format'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                      <button class="th-filter-btn" class:active={filterFormat}
                        on:click|stopPropagation={() => toggleFilter('format')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                    {#if openFilterCol==='format'}
                      <div class="th-filter-drop" on:click|stopPropagation>
                        <button class="fd-opt" class:sel={!filterFormat} on:click={() => { filterFormat=''; applyColumnFilter(); openFilterCol='' }}>Все</button>
                        {#each formats as f}
                          <button class="fd-opt" class:sel={filterFormat===f} on:click={() => { filterFormat=f; applyColumnFilter(); openFilterCol='' }}>{f}</button>
                        {/each}
                      </div>
                    {/if}
                  </th>
                  {/if}
                  {#if colVis.creative}
                  <!-- Креатив -->
                  <th style="position:relative">
                    <div class="th-inner">
                      <button class="th-sort-btn" on:click={() => toggleSort('creative')}>
                        Креатив
                        {#if sortCol==='creative'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                      <button class="th-filter-btn" class:active={filterCreative}
                        on:click|stopPropagation={() => toggleFilter('creative')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                    {#if openFilterCol==='creative'}
                      <div class="th-filter-drop" on:click|stopPropagation>
                        <input class="fd-input" type="text" placeholder="Поиск…" bind:value={filterCreative} on:input={applyColumnFilter}/>
                        <button class="fd-clear" on:click={() => { filterCreative=''; applyColumnFilter(); openFilterCol='' }}>Сброс</button>
                      </div>
                    {/if}
                  </th>
                  {/if}
                  {#if colVis.photo}
                  <!-- Фотоотчет -->
                  <th style="width:72px;text-align:center">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style="vertical-align:middle;color:var(--text-muted)" title="Фотоотчет">
                      <path fill-rule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
                    </svg>
                  </th>
                  {/if}
                  {#if colVis.status}
                  <!-- Статус -->
                  <th style="position:relative">
                    <div class="th-inner">
                      <button class="th-sort-btn" on:click={() => toggleSort('status')}>
                        Статус
                        {#if sortCol==='status'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                      <button class="th-filter-btn" class:active={filterStatus}
                        on:click|stopPropagation={() => toggleFilter('status')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                    {#if openFilterCol==='status'}
                      <div class="th-filter-drop" on:click|stopPropagation>
                        <button class="fd-opt" class:sel={!filterStatus} on:click={() => { filterStatus=''; applyColumnFilter(); applyFilter(); openFilterCol='' }}>Все</button>
                        <button class="fd-opt" class:sel={filterStatus==='SUCCESS'} on:click={() => { filterStatus='SUCCESS'; applyColumnFilter(); applyFilter(); openFilterCol='' }}>Показан</button>
                        <button class="fd-opt" class:sel={filterStatus==='FAILED'} on:click={() => { filterStatus='FAILED'; applyColumnFilter(); applyFilter(); openFilterCol='' }}>Не показан</button>
                      </div>
                    {/if}
                  </th>
                  {/if}
                  {#if colVis.reason}
                  <!-- Причина отказа -->
                  <th style="position:relative">
                    <div class="th-inner">
                      <button class="th-sort-btn" on:click={() => toggleSort('reason')}>
                        Причина отказа
                        {#if sortCol==='reason'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                      <button class="th-filter-btn" class:active={filterReason}
                        on:click|stopPropagation={() => toggleFilter('reason')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                    </div>
                    {#if openFilterCol==='reason'}
                      <div class="th-filter-drop" on:click|stopPropagation>
                        {#if reasons.length > 5}
                          <input class="fd-input fd-search" type="text" placeholder="Поиск…" bind:value={filterDropSearch} on:click|stopPropagation/>
                        {/if}
                        <button class="fd-opt" class:sel={!filterReason} on:click={() => { filterReason=''; applyColumnFilter(); openFilterCol='' }}>Все</button>
                        {#each reasons.filter(r => !filterDropSearch || r.toLowerCase().includes(filterDropSearch.toLowerCase())) as r}
                          <button class="fd-opt" class:sel={filterReason===r} on:click={() => { filterReason=r; applyColumnFilter(); openFilterCol='' }}>{r}</button>
                        {/each}
                      </div>
                    {/if}
                  </th>
                  {/if}
                  {#if colVis.ots}
                  <!-- OTS -->
                  <th class="num" style="position:relative">
                    <div class="th-inner th-inner-r">
                      <button class="th-filter-btn" class:active={filterOtsMin||filterOtsMax}
                        on:click|stopPropagation={() => toggleFilter('ots')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                      <button class="th-sort-btn" on:click={() => toggleSort('ots')}>
                        OTS
                        {#if sortCol==='ots'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                    </div>
                    {#if openFilterCol==='ots'}
                      <div class="th-filter-drop th-filter-drop-r" on:click|stopPropagation>
                        <label class="fd-label">От <input class="fd-input" type="number" min="0" bind:value={filterOtsMin} on:input={applyColumnFilter}/></label>
                        <label class="fd-label">До <input class="fd-input" type="number" min="0" bind:value={filterOtsMax} on:input={applyColumnFilter}/></label>
                        <button class="fd-clear" on:click={() => { filterOtsMin=''; filterOtsMax=''; applyColumnFilter(); openFilterCol='' }}>Сброс</button>
                      </div>
                    {/if}
                  </th>
                  {/if}
                  {#if colVis.cost}
                  <!-- Стоимость -->
                  <th class="num" style="position:relative">
                    <div class="th-inner th-inner-r">
                      <button class="th-filter-btn" class:active={filterCostMin||filterCostMax}
                        on:click|stopPropagation={() => toggleFilter('cost')}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/></svg>
                      </button>
                      <button class="th-sort-btn" on:click={() => toggleSort('cost')}>
                        Стоимость
                        {#if sortCol==='cost'}<span class="th-arr">{sortDir>0?'↑':'↓'}</span>{/if}
                      </button>
                    </div>
                    {#if openFilterCol==='cost'}
                      <div class="th-filter-drop th-filter-drop-r" on:click|stopPropagation>
                        <label class="fd-label">От <input class="fd-input" type="number" min="0" step="0.01" bind:value={filterCostMin} on:input={applyColumnFilter}/></label>
                        <label class="fd-label">До <input class="fd-input" type="number" min="0" step="0.01" bind:value={filterCostMax} on:input={applyColumnFilter}/></label>
                        <button class="fd-clear" on:click={() => { filterCostMin=''; filterCostMax=''; applyColumnFilter(); openFilterCol='' }}>Сброс</button>
                      </div>
                    {/if}
                  </th>
                  {/if}
                </tr>
              </thead>
              <tbody>
                {#if viewRows.length === 0}
                  <tr><td colspan={visibleColCount} class="panel-empty" style="text-align:center;padding:32px">
                    Нет записей с выбранными фильтрами.
                  </td></tr>
                {:else}
                  {#each viewRows as row (row.id)}
                    {@const photoUrl = getPhotoUrl(row)}
                    <tr class:row-failed={row.bidRequestState !== 'SUCCESS'}>
                      {#if colVis.date}<td class="mono">{fmtMs(row.showTime)}</td>{/if}
                      {#if colVis.local}<td class="mono">{fmtLocalTime(row.inventoryShowTime)}</td>{/if}
                      {#if colVis.screen}
                        <td>
                          <span class="inv-name">{row.inventory?.name ?? row.inventoryGid ?? '—'}</span>
                          <span class="inv-addr">{row.address}{row.city ? ', ' + row.city : ''}</span>
                        </td>
                      {/if}
                      {#if colVis.format}<td class="dim">{row.inventoryFormat ?? '—'}</td>{/if}
                      {#if colVis.creative}
                        <td class="dim" title={row.media?.name ?? ''}>
                          {#if row.media?.name}
                            {row.media.name.length > 28 ? row.media.name.slice(0, 26) + '…' : row.media.name}
                          {:else}—{/if}
                        </td>
                      {/if}
                      {#if colVis.photo}
                        <td class="photo-cell">
                          {#if photoUrl}
                            <button class="photo-thumb-btn" on:click|stopPropagation={() => lightboxUrl = photoUrl} title="Открыть фото">
                              <img src={photoUrl} alt="фотоотчет" class="photo-thumb" loading="lazy" />
                            </button>
                          {:else}
                            <span class="dim">—</span>
                          {/if}
                        </td>
                      {/if}
                      {#if colVis.status}
                        <td><span class="badge {impStatus(row).cls}">{impStatus(row).label}</span></td>
                      {/if}
                      {#if colVis.reason}
                        <td class="dim reason-cell">
                          {#if row.bidRequestState !== 'SUCCESS'}
                            <span title={row.failureReasonMessage ?? ''}>
                              {row.failureReasonCodeName ?? row.failureReasonType ?? '—'}
                            </span>
                          {:else}—{/if}
                        </td>
                      {/if}
                      {#if colVis.ots}<td class="num mono">{fmt(row.ots ?? row.opOts)}</td>{/if}
                      {#if colVis.cost}<td class="num mono">{row.chargedPrice != null ? formatMoney(row.chargedPrice) : '—'}</td>{/if}
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
          <!-- Pagination: client-side view pages + server-side page navigation -->
          <div class="pagination">
            <div class="pg-btns">
              <!-- Client-side view pagination (within loaded batch) -->
              <button class="pg-btn" disabled={viewPage === 0}
                on:click={() => viewPage--}>‹</button>
              <span class="pg-cur">{viewPage + 1} / {viewTotalPages}</span>
              <button class="pg-btn" disabled={viewPage >= viewTotalPages - 1}
                on:click={() => viewPage++}>›</button>
            </div>
            <!-- Server page navigation (load more from backend) -->
            {#if srvPages > 1}
              <div class="pg-srv">
                <span class="pg-info">Страница {srvPage + 1} / {srvPages}</span>
                <button class="pg-btn" disabled={srvPage === 0 || impLoading}
                  on:click={() => loadImpressions(srvPage - 1)}>← Пред. пачка</button>
                <button class="pg-btn" disabled={srvPage >= srvPages - 1 || impLoading}
                  on:click={() => loadImpressions(srvPage + 1)}>След. пачка →</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>

    <!-- ── CHART TAB ──────────────────────────────────────────────────────────── -->
    {:else if activeTab === 'chart'}
      <div class="step-card tab-panel">
        <!-- Controls row -->
        <div class="chart-controls">
          <!-- Metric pills -->
          <div class="metric-pills">
            {#each METRICS as m}
              <button
                class="metric-pill"
                class:active={chartMetric === m.key}
                style="--pill-color:{m.color}"
                on:click={() => { chartMetric = m.key; chartData = {}; loadChart() }}
              >{m.label}</button>
            {/each}
          </div>

          <div style="flex:1"></div>

          <!-- Date range (single picker for BY_HOURS, range for BY_DAYS) -->
          <div class="chart-dates">
            {#if chartGroupType === 'BY_HOURS'}
              <!-- BY_HOURS: single day selector -->
              <input class="date-inp" type="date" bind:value={chartTo} max={today}
                on:change={() => { chartFrom = chartTo; chartData = {}; loadChart() }} />
            {:else}
              <input class="date-inp" type="date" bind:value={chartFrom}
                on:change={() => { chartData = {}; loadChart() }} />
              <span class="date-sep">—</span>
              <input class="date-inp" type="date" bind:value={chartTo} max={today}
                on:change={() => { chartData = {}; loadChart() }} />
            {/if}
          </div>

          <!-- Group type toggle -->
          <div class="toggle-group">
            <button class="toggle-btn" class:active={chartGroupType==='BY_HOURS'} on:click={() => setGroupType('BY_HOURS')}>По часам</button>
            <button class="toggle-btn" class:active={chartGroupType==='BY_DAYS'}  on:click={() => setGroupType('BY_DAYS')}>По дням</button>
          </div>
        </div>

        <!-- Chart area -->
        {#if chartLoading}
          <div class="chart-loading"><div class="spinner"></div> Загрузка…</div>
        {:else if chartError}
          <div class="panel-error">{chartError}</div>
        {:else if chartPoints.length === 0}
          <div class="panel-empty">Нет данных за выбранный период.</div>
        {:else}
          <div class="chart-wrap">
            <svg viewBox="0 0 {SVG_W} {SVG_H}" class="chart-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stop-color={activeMetric.color} stop-opacity="0.18"/>
                  <stop offset="100%" stop-color={activeMetric.color} stop-opacity="0"/>
                </linearGradient>
              </defs>

              <!-- Grid lines -->
              {#each yTicks as t}
                <line x1={PAD.l} y1={t.y} x2={PAD.l + CW} y2={t.y}
                  stroke="#e5e7eb" stroke-width="1" stroke-dasharray="4,4"/>
                <text x={PAD.l - 6} y={t.y} text-anchor="end" dominant-baseline="middle"
                  font-size="9" fill="#9ca3af">{fmtYVal(t.val)}</text>
              {/each}

              <!-- X-axis labels -->
              {#each xTicks as t}
                <text x={t.x} y={SVG_H - 4} text-anchor="middle"
                  font-size="9" fill="#9ca3af">{t.label}</text>
              {/each}

              <!-- Fill + line -->
              <path d={fillPath} fill="url(#chartGrad)"/>
              <path d={linePath} fill="none" stroke={activeMetric.color} stroke-width="1.8"
                stroke-linejoin="round" stroke-linecap="round"/>

              <!-- Data dots (only if few points) -->
              {#if chartPoints.length <= 31}
                {#each chartVals as v, i}
                  <circle
                    cx={ptX(i, chartVals.length).toFixed(1)}
                    cy={ptY(v).toFixed(1)}
                    r="3"
                    fill={activeMetric.color}
                    stroke="#fff" stroke-width="1.5"
                  />
                {/each}
              {/if}
            </svg>
          </div>

          <!-- Chart legend / stats row -->
          <div class="chart-stats">
            <div class="cs-item">
              <span class="cs-label">Всего за период</span>
              <span class="cs-val" style="color:{activeMetric.color}">
                {#if chartMetric === 'cost'}
                  {formatMoney(chartVals.reduce((s, v) => s + v, 0))}
                {:else}
                  {fmt(chartVals.reduce((s, v) => s + v, 0))}
                {/if}
              </span>
            </div>
            <div class="cs-item">
              <span class="cs-label">Максимум</span>
              <span class="cs-val">
                {#if chartMetric === 'cost'}{formatMoney(chartMax)}{:else}{fmt(chartMax)}{/if}
              </span>
            </div>
            <div class="cs-item">
              <span class="cs-label">Точек данных</span>
              <span class="cs-val">{chartPoints.length}</span>
            </div>
          </div>
        {/if}
      </div>

    <!-- ── SCREENS + MAP TAB ──────────────────────────────────────────────────── -->
    {:else if activeTab === 'screens'}
      <!-- Filter bar -->
      <div class="scrn-filterbar">
        <div class="scrn-search-wrap">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="color:var(--text-muted);flex-shrink:0">
            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
          </svg>
          <input
            class="scrn-search-input"
            type="text"
            placeholder="Поиск по адресу, названию, GID…"
            bind:value={scrnSearch}
          />
          {#if scrnSearch}
            <button class="scrn-search-clear" on:click={() => scrnSearch = ''}>×</button>
          {/if}
        </div>
        <div class="scrn-act-pills">
          <button class="scrn-act-pill" class:active={scrnActivity===''} on:click={() => scrnActivity=''}>Все</button>
          <button class="scrn-act-pill" class:active={scrnActivity==='high'} on:click={() => scrnActivity=scrnActivity==='high'?'':'high'}>
            <span class="act-dot" style="background:#22C55E"></span>Высокая
          </button>
          <button class="scrn-act-pill" class:active={scrnActivity==='mid'} on:click={() => scrnActivity=scrnActivity==='mid'?'':'mid'}>
            <span class="act-dot" style="background:#EAB308"></span>Средняя
          </button>
          <button class="scrn-act-pill" class:active={scrnActivity==='low'} on:click={() => scrnActivity=scrnActivity==='low'?'':'low'}>
            <span class="act-dot" style="background:#F97316"></span>Низкая
          </button>
          <button class="scrn-act-pill" class:active={scrnActivity==='none'} on:click={() => scrnActivity=scrnActivity==='none'?'':'none'}>
            <span class="act-dot" style="background:#EF4444"></span>Без показов
          </button>
        </div>
        <span class="scrn-count">
          {#if scrnSearch || scrnActivity}
            {scrnFilteredRows.length} / {invStats.length}
          {:else}
            {invStats.length} экран{invStats.length===1?'':invStats.length<5?'а':'ов'}
          {/if}
        </span>
      </div>

      <div class="step-card tab-panel" style="padding:0;overflow:hidden">
        {#if mapLoading}
          <div class="panel-loading"><div class="spinner"></div> Загрузка…</div>
        {:else if mapError}
          <div class="panel-error">{mapError}</div>
        {:else if invStats.length === 0}
          <div class="panel-empty">Нет данных по экранам.</div>
        {:else}
          <div class="scrn-split">
            <!-- Table side -->
            <div class="scrn-table-side">
              <div class="tbl-wrap">
                <table class="tbl" style="table-layout:fixed">
                  <colgroup>
                    {#each scrnColW as w}
                      <col style="width:{w}px;min-width:40px">
                    {/each}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style="position:relative">
                        <button class="th-sort-btn" on:click={() => toggleScrnSort('name')}>
                          Экран{#if scrnSortCol==='name'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(0,e)}></div>
                      </th>
                      <th style="position:relative">
                        <button class="th-sort-btn" on:click={() => toggleScrnSort('gid')}>
                          GID{#if scrnSortCol==='gid'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(1,e)}></div>
                      </th>
                      <th style="position:relative">
                        <button class="th-sort-btn" on:click={() => toggleScrnSort('city')}>
                          Город{#if scrnSortCol==='city'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(2,e)}></div>
                      </th>
                      <th style="position:relative">
                        <button class="th-sort-btn" on:click={() => toggleScrnSort('owner')}>
                          Оператор{#if scrnSortCol==='owner'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(3,e)}></div>
                      </th>
                      <th style="position:relative">
                        <button class="th-sort-btn" on:click={() => toggleScrnSort('format')}>
                          Формат{#if scrnSortCol==='format'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(4,e)}></div>
                      </th>
                      <th class="num" style="position:relative">
                        <button class="th-sort-btn" style="justify-content:flex-end" on:click={() => toggleScrnSort('showed')}>
                          {#if scrnSortCol==='showed'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}Выходы
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(5,e)}></div>
                      </th>
                      <th class="num" style="position:relative">
                        <button class="th-sort-btn" style="justify-content:flex-end" on:click={() => toggleScrnSort('ots')}>
                          {#if scrnSortCol==='ots'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}OTS
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(6,e)}></div>
                      </th>
                      <th class="num" style="position:relative">
                        <button class="th-sort-btn" style="justify-content:flex-end" on:click={() => toggleScrnSort('budget')}>
                          {#if scrnSortCol==='budget'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}Бюджет
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(7,e)}></div>
                      </th>
                      <th class="num" style="position:relative">
                        <button class="th-sort-btn" style="justify-content:flex-end" on:click={() => toggleScrnSort('cpm')}>
                          {#if scrnSortCol==='cpm'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}CPM, ₽
                        </button>
                        <div class="rzh" on:mousedown={(e)=>scrnRzStart(8,e)}></div>
                      </th>
                      <th class="num" style="position:relative">
                        <button class="th-sort-btn" style="justify-content:flex-end" on:click={() => toggleScrnSort('shots')}>
                          {#if scrnSortCol==='shots'}<span class="th-arr">{scrnSortDir>0?'↑':'↓'}</span>{/if}Фото
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each scrnFilteredRows as row (row.inventory?.id)}
                      {@const s      = screenObjMap.get(row.inventory?.id)}
                      {@const showed = row.totalShowed ?? 0}
                      {@const ots    = row.totalOpOts ?? row.totalOts ?? row.totalEstimatedOts ?? 0}
                      {@const budget = row.totalShowedBudget ?? row.customerStats?.budgetShowed ?? 0}
                      {@const isHL   = highlightedInvId === row.inventory?.id}
                      <tr
                        class:scrn-zero={showed === 0}
                        class:scrn-hl={isHL}
                        style="cursor:pointer"
                        bind:this={scrnRowEls[row.inventory?.id]}
                        on:click={() => selectRowOnMap(row)}
                      >
                        <td>
                          <span class="inv-name">
                            <span class="act-dot-sm" style="background:{showedColor(showed)}"></span>
                            {row.inventory?.name ?? '—'}
                          </span>
                          {#if s?.address}<span class="inv-addr">{s.address}{s.city ? ', ' + s.city : ''}</span>{/if}
                        </td>
                        <td class="dim mono">{s?.gid ?? '—'}</td>
                        <td class="dim">{s?.city ?? '—'}</td>
                        <td class="dim">{s?.owner ?? (row.displayOwner?.name ?? '—')}</td>
                        <td class="dim">{s?.format ?? '—'}</td>
                        <td class="num mono">
                          {#if showed > 0}
                            <span class="scrn-plays">{fmt(showed)}</span>
                          {:else}
                            <span class="scrn-zero-lbl">Нет</span>
                          {/if}
                        </td>
                        <td class="num mono">{#if ots > 0}{fmt(ots)}{:else}<span class="dim">—</span>{/if}</td>
                        <td class="num mono">{#if budget > 0}{formatMoney(budget)}{:else}<span class="dim">—</span>{/if}</td>
                        <td class="num mono">{#if (row.cpm ?? 0) > 0}{fmt(row.cpm, 2)}{:else}<span class="dim">—</span>{/if}</td>
                        <td class="num mono">{#if (row.shotCount ?? 0) > 0}<span class="scrn-shots">📷 {row.shotCount}</span>{:else}<span class="dim">—</span>{/if}</td>
                      </tr>
                    {/each}
                    {#if scrnFilteredRows.length === 0}
                      <tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">Нет экранов, соответствующих фильтру</td></tr>
                    {/if}
                  </tbody>
                </table>
              </div>
              <div class="scrn-footer">
                {scrnFilteredRows.filter(r => (r.totalShowed ?? 0) > 0).length} с показами ·
                {fmt(invStats.filter(r => (r.totalShowed ?? 0) === 0).length)} без показов
              </div>
            </div>

            <!-- Map side -->
            <div class="scrn-map-side">
              <div bind:this={mapEl} class="scrn-map"></div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
  </div>
</div>

<!-- ── Photo lightbox ────────────────────────────────────────────────────── -->
{#if lightboxUrl}
  <div class="lightbox-overlay" on:click={() => lightboxUrl = null} role="dialog">
    <button class="lightbox-close" on:click={() => lightboxUrl = null}>×</button>
    <img src={lightboxUrl} alt="Фотоотчет" class="lightbox-img" on:click|stopPropagation />
  </div>
{/if}

<svelte:window on:click={() => { colPickerOpen = false }} />

<style>
  /* ── Full-width overrides (stats page breaks the 600px wizard constraint) ── */
  :global(.stats-root.step-content) { align-items: stretch !important; }
  :global(.stats-root .step-card)   { max-width: none !important; }
  :global(.stats-root .step-title)  { max-width: none !important; text-align: left !important; }
  :global(.stats-root .step-nav)    { max-width: none !important; }

  /* ── Filter bar ──────────────────────────────────────────────────────────── */
  .filter-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    padding: 10px 0 12px;
  }
  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .filter-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .filter-pills { display: flex; gap: 4px; }
  .filter-pill {
    padding: 4px 12px;
    border: 1.5px solid var(--border);
    border-radius: 20px;
    background: #fff;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    transition: all .12s;
    white-space: nowrap;
  }
  .filter-pill.active {
    border-color: var(--navy);
    background: var(--navy);
    color: #fff;
    font-weight: 600;
  }
  .filter-pill:hover:not(.active) { border-color: #9ca3af; color: var(--text); }
  .filter-count {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .filter-loading { opacity: .5; }
  .filter-clear {
    padding: 4px 10px;
    border: 1.5px solid #d1d5db;
    border-radius: 16px;
    background: #fff;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    transition: all .12s;
    white-space: nowrap;
  }
  .filter-clear:hover { border-color: #ef4444; color: #ef4444; }

  /* ── Column header sort + filter ────────────────────────────────────────── */
  .th-inner {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .th-inner-r { flex-direction: row-reverse; }

  .th-sort-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: inherit; font-size: 11px; font-weight: 600;
    color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em;
    display: flex; align-items: center; gap: 3px;
  }
  .th-sort-btn:hover { color: var(--navy); }
  .th-arr { font-size: 10px; }

  .th-filter-btn {
    background: none; border: none; padding: 2px 3px; cursor: pointer;
    color: #CBD5E1; border-radius: 3px; line-height: 1; flex-shrink: 0;
    transition: color .1s, background .1s;
  }
  .th-filter-btn:hover { color: var(--navy); background: #EFF6FF; }
  .th-filter-btn.active { color: var(--navy); }

  .th-filter-drop {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 300;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,.13);
    padding: 8px;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .th-filter-drop-r { left: auto; right: 0; }

  .fd-input {
    width: 100%; box-sizing: border-box;
    height: 28px; padding: 0 7px;
    border: 1.5px solid var(--border); border-radius: 5px;
    font-size: 12px; font-family: inherit; color: var(--text);
    background: #fff; outline: none;
  }
  .fd-input:focus { border-color: var(--navy); }
  .fd-search { margin-bottom: 2px; }

  .fd-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 11.5px; color: var(--text-muted); white-space: nowrap;
  }
  .fd-label .fd-input { flex: 1; }

  .fd-opt {
    display: block; width: 100%; text-align: left;
    padding: 5px 8px; border: none; border-radius: 5px;
    font-size: 12.5px; font-family: inherit; color: var(--text);
    background: none; cursor: pointer; white-space: nowrap;
  }
  .fd-opt:hover { background: var(--bg); }
  .fd-opt.sel { background: #EFF6FF; color: var(--navy); font-weight: 600; }

  .fd-clear {
    margin-top: 2px; padding: 4px 8px;
    border: 1px solid var(--border); border-radius: 5px;
    background: #fff; font-size: 11.5px; font-family: inherit;
    color: var(--text-muted); cursor: pointer; align-self: flex-start;
  }
  .fd-clear:hover { border-color: #ef4444; color: #ef4444; }

  /* ── KPI cards ────────────────────────────────────────────────────────────── */
  .kpi-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
  }
  .kpi-card {
    flex: 1;
    min-width: 130px;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .kpi-skeleton {
    height: 80px;
    background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }
  @keyframes shimmer { to { background-position: -200% 0 } }

  .kpi-label {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kpi-val {
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .kpi-val.spend { font-size: 18px; }
  .kpi-bar {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    margin-top: 6px;
    overflow: hidden;
  }
  .kpi-bar-fill {
    height: 100%;
    background: var(--navy);
    border-radius: 2px;
    transition: width 0.4s;
  }
  .kpi-pct { font-size: 11px; color: var(--text-muted); }

  .empty-note {
    padding: 20px;
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
  }

  /* ── Tabs ─────────────────────────────────────────────────────────────────── */
  .tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 12px;
    background: var(--bg-muted, #f3f4f6);
    border-radius: 10px;
    padding: 3px;
    width: fit-content;
  }
  .tab {
    padding: 6px 18px;
    border: none;
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    transition: background .15s, color .15s;
  }
  .tab.active {
    background: #fff;
    color: var(--navy);
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(0,0,0,.10);
  }
  .tab:hover:not(.active) { color: var(--text); }

  .tab-panel { min-height: 240px; }

  /* ── Loading / empty states ──────────────────────────────────────────────── */
  .panel-loading, .panel-empty, .panel-error {
    padding: 40px;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .panel-error { color: #ef4444; }

  /* ── Table ───────────────────────────────────────────────────────────────── */
  .tbl-wrap {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 520px;   /* fixed height so the table scrolls instead of the whole page */
  }

  /* Column resize handle */
  .rzh {
    position: absolute;
    right: -2px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 10;
    user-select: none;
  }
  .rzh::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 25%;
    bottom: 25%;
    width: 2px;
    border-radius: 1px;
    background: transparent;
    transition: background .15s;
  }
  .rzh:hover::after { background: rgba(17,40,83,.35); }
  .tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    min-width: max-content;
  }
  .tbl thead { position: sticky; top: 0; z-index: 2; }
  .tbl th {
    padding: 8px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--border);
    background: var(--bg-muted, #f9fafb);
    white-space: nowrap;
  }
  .tbl th.num { text-align: right; }
  .tbl td {
    padding: 9px 14px;
    border-bottom: 1px solid #f3f4f6;
    color: var(--text);
    vertical-align: top;
  }
  .tbl td.num { text-align: right; }
  .tbl td.mono { font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 12px; }
  .tbl td.dim  { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
  .tbl tr:last-child td { border-bottom: none; }
  .tbl tr:hover td { background: var(--bg-muted, #f9fafb); }

  .inv-name { display: block; font-weight: 500; font-size: 12px; }
  .inv-addr { display: block; font-size: 11px; color: var(--text-muted); }

  .reason-cell { font-size: 11.5px; max-width: 180px; }
  .reason-cell span { cursor: help; }
  .tbl tr.row-failed td { background: #fef9f9; }
  .tbl tr.row-failed:hover td { background: #fee2e2; }

  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-green  { background: #dcfce7; color: #166534; }
  .badge-red    { background: #fee2e2; color: #991b1b; }
  .badge-orange { background: #ffedd5; color: #9a3412; }
  .badge-gray   { background: #f3f4f6; color: #6b7280; }

  .reason {
    display: block;
    font-size: 10.5px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  /* Pagination */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-top: 1px solid var(--border);
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .pg-btns { display: flex; align-items: center; gap: 8px; }
  .pg-btn {
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #fff;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    color: var(--text);
    transition: background .1s;
  }
  .pg-btn:hover:not(:disabled) { background: var(--bg-muted); }
  .pg-btn:disabled { opacity: 0.4; cursor: default; }
  .pg-cur { font-size: 12px; color: var(--text); min-width: 50px; text-align: center; }
  .pg-srv {
    display: flex;
    align-items: center;
    gap: 8px;
    border-left: 1px solid var(--border);
    padding-left: 12px;
    margin-left: 4px;
  }

  /* ── Chart ───────────────────────────────────────────────────────────────── */
  .chart-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .metric-pills { display: flex; gap: 6px; }
  .metric-pill {
    padding: 5px 14px;
    border: 1.5px solid var(--border);
    border-radius: 20px;
    background: #fff;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    transition: all .15s;
  }
  .metric-pill.active {
    border-color: var(--pill-color);
    color: var(--pill-color);
    background: color-mix(in srgb, var(--pill-color) 8%, transparent);
    font-weight: 600;
  }
  .metric-pill:hover:not(.active) { border-color: #9ca3af; color: var(--text); }

  .chart-dates {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .date-inp {
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    padding: 0 8px;
    font-size: 12px;
    font-family: inherit;
    color: var(--text);
    outline: none;
  }
  .date-inp:focus { border-color: var(--navy); }
  .date-sep { color: var(--text-muted); font-size: 12px; }

  .toggle-group { display: flex; border: 1.5px solid var(--border); border-radius: 8px; overflow: hidden; }
  .toggle-btn {
    padding: 5px 14px;
    border: none;
    background: #fff;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    transition: background .1s, color .1s;
  }
  .toggle-btn + .toggle-btn { border-left: 1.5px solid var(--border); }
  .toggle-btn.active { background: var(--navy); color: #fff; font-weight: 600; }
  .toggle-btn:hover:not(.active) { background: var(--bg-muted); }

  .chart-loading {
    height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .chart-wrap {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
  .chart-svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .chart-stats {
    display: flex;
    gap: 24px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .cs-item { display: flex; flex-direction: column; gap: 2px; }
  .cs-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; }
  .cs-val   { font-size: 15px; font-weight: 700; color: var(--text); }

  /* ── Leaflet overrides ───────────────────────────────────────────────────── */
  :global(.leaflet-popup-content b) { font-size: 13px; }
  :global(.leaflet-popup-content)   { font-size: 12px; line-height: 1.7; }

  /* ── Screens+Map combined layout ─────────────────────────────────────────── */
  .scrn-filterbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 0 10px;
  }
  .scrn-search-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #fff;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 5px 10px;
    min-width: 220px;
    flex: 1;
    max-width: 320px;
  }
  .scrn-search-wrap:focus-within { border-color: var(--navy); }
  .scrn-search-input {
    border: none;
    outline: none;
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    flex: 1;
    background: transparent;
  }
  .scrn-search-clear {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: var(--text-muted);
    padding: 0;
    line-height: 1;
  }
  .scrn-act-pills { display: flex; gap: 4px; flex-wrap: wrap; }
  .scrn-act-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border: 1.5px solid var(--border);
    border-radius: 20px;
    background: #fff;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    transition: all .12s;
  }
  .scrn-act-pill.active {
    border-color: var(--navy);
    background: var(--navy);
    color: #fff;
  }
  .scrn-act-pill:hover:not(.active) { border-color: #9ca3af; color: var(--text); }
  .act-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .act-dot-sm {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-right: 4px;
    vertical-align: middle;
  }
  .scrn-count {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    margin-left: auto;
  }
  .scrn-split {
    display: flex;
    height: 560px;
    overflow: hidden;
  }
  .scrn-table-side {
    flex: 1 1 55%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    overflow: hidden;
  }
  .scrn-table-side .tbl-wrap {
    flex: 1;
    max-height: none;
    overflow-x: auto;
    overflow-y: auto;
  }
  .scrn-map-side {
    flex: 0 0 45%;
    position: relative;
  }
  .scrn-map {
    width: 100%;
    height: 100%;
  }
  .tbl tr.scrn-hl td { background: #eff6ff !important; }

  /* ── Screens tab ─────────────────────────────────────────────────────────── */
  .tbl tr.scrn-zero td { color: #9ca3af; }
  .tbl tr.scrn-zero:hover td { background: var(--bg-muted, #f9fafb); }

  .scrn-plays {
    font-weight: 700;
    color: #166534;
  }
  .scrn-zero-lbl {
    font-size: 11px;
    color: #9ca3af;
    font-weight: 400;
  }
  .scrn-shots {
    font-size: 12px;
    color: var(--text-muted);
  }
  .scrn-footer {
    padding: 9px 14px;
    font-size: 12px;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    background: var(--bg-muted, #f9fafb);
  }

  /* ── Column chooser ──────────────────────────────────────────────────────── */
  .col-picker-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    color: var(--text-muted);
    transition: all .12s;
  }
  .col-picker-btn:hover, .col-picker-btn.active { border-color: var(--navy); color: var(--navy); background: var(--navy-light, #eef2ff); }
  .col-picker-drop {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,.12);
    z-index: 300;
    min-width: 180px;
    padding: 6px 0 8px;
  }
  .col-picker-title {
    padding: 6px 14px 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-muted);
  }
  .col-picker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    user-select: none;
  }
  .col-picker-row:hover { background: var(--navy-light, #eef2ff); }
  .col-picker-row input { cursor: pointer; accent-color: var(--navy); }

  /* ── Photo thumbnail ─────────────────────────────────────────────────────── */
  .photo-cell { text-align: center; padding: 4px 8px !important; vertical-align: middle !important; }
  .photo-thumb-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: inline-block;
    border-radius: 4px;
    overflow: hidden;
    line-height: 0;
  }
  .photo-thumb-btn:hover { opacity: .85; }
  .photo-thumb {
    width: 52px;
    height: 36px;
    object-fit: cover;
    border-radius: 3px;
    display: block;
  }

  /* ── Photo lightbox ──────────────────────────────────────────────────────── */
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.8);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lightbox-img {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 6px;
    box-shadow: 0 8px 40px rgba(0,0,0,.5);
    object-fit: contain;
  }
  .lightbox-close {
    position: fixed;
    top: 20px;
    right: 24px;
    background: rgba(255,255,255,.15);
    border: none;
    color: #fff;
    font-size: 28px;
    line-height: 1;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lightbox-close:hover { background: rgba(255,255,255,.25); }
</style>
