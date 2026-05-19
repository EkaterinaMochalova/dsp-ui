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

  // Filters (client-side — API doesn't support bidRequestState/inventoryFormat params)
  let filterStatus = ''    // '' | 'SUCCESS' | 'FAILED'
  let filterFormat = ''    // '' | 'BILLBOARD' | etc.

  // Derived: filtered rows from current server batch
  $: filteredRows = allRows.filter(r => {
    if (filterStatus === 'SUCCESS' && r.bidRequestState !== 'SUCCESS')  return false
    if (filterStatus === 'FAILED'  && r.bidRequestState === 'SUCCESS')  return false
    if (filterFormat && r.inventoryFormat !== filterFormat) return false
    return true
  })
  $: viewRows      = filteredRows.slice(viewPage * VIEW_SIZE, (viewPage + 1) * VIEW_SIZE)
  $: viewTotalPages = Math.max(1, Math.ceil(filteredRows.length / VIEW_SIZE))

  // ── Chart tab ─────────────────────────────────────────────────────────────
  let chartGroupType = 'BY_HOURS'
  let chartMetric = 'value'       // 'value' | 'chargedValue' | 'otsDmp'
  let chartData = {}
  let chartLoading = false
  let chartError = ''
  const today = new Date().toISOString().slice(0, 10)
  let chartFrom = draft.startDate ?? today
  let chartTo   = (() => {
    if (!draft.endDate) return today
    return draft.endDate < today ? draft.endDate : today
  })()

  // ── Map tab ───────────────────────────────────────────────────────────────
  let mapEl = null
  let map = null
  let invStats = []
  let mapLoading = false
  let mapError = ''
  let mapInited = false

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
    // "2026-05-18T18:37:16.691" → "18:37:16"
    if (!isoStr) return '—'
    return isoStr.slice(11, 19)
  }

  function dateToMs(dateStr) {
    if (!dateStr) return null
    return new Date(dateStr + 'T00:00:00').getTime()
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
    if (!campId) { kpiLoading = false; return }
    loadKpi()
    loadImpressions(0)
  })

  onDestroy(() => {
    if (map) { map.remove(); map = null }
  })

  // ── KPI — aggregate from inventory-stats (reliable per-inventory breakdown) ─
  async function loadKpi() {
    kpiLoading = true
    try {
      const rows = await api.stats.inventoryStats(campId)
      if (!Array.isArray(rows) || !rows.length) { kpiLoading = false; return }
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

  function applyFilter() {
    viewPage = 0
    if (filterStatus || filterFormat) {
      // Need the full dataset for accurate client-side filtering
      loadAllForFilter()
    } else {
      // Back to "no filter" — reload normal first page
      loadImpressions(0)
    }
  }

  // Collect unique formats from loaded rows for the format filter pill list
  $: formats = [...new Set(allRows.map(r => r.inventoryFormat).filter(Boolean))]

  // ── Chart ─────────────────────────────────────────────────────────────────
  async function loadChart() {
    if (!campId) return
    chartLoading = true; chartError = ''
    try {
      const params = { chartGroupType, avgStats: true }
      const f = dateToMs(chartFrom)
      const t = dateToMs(chartTo)
      if (f) params.from = f
      if (t) params.to   = t + 86399999   // end of day
      chartData = await api.stats.chart(campId, params) ?? {}
    } catch { chartError = 'Не удалось загрузить данные графика'; chartData = {} }
    chartLoading = false
  }

  function onTabChange(tab) {
    activeTab = tab
    if (tab === 'chart' && !Object.keys(chartData).length) loadChart()
    if (tab === 'map'   && !mapInited) scheduleMapLoad()
  }

  async function scheduleMapLoad() {
    if (!campId || mapLoading) return
    mapLoading = true; mapError = ''
    try {
      invStats = await api.stats.inventoryStats(campId) ?? []
    } catch { mapError = 'Не удалось загрузить данные карты'; invStats = [] }
    mapLoading = false
    await tick()
    initMap()
  }

  // ── Chart SVG ─────────────────────────────────────────────────────────────
  const SVG_W = 760, SVG_H = 180
  const PAD = { t: 12, r: 12, b: 34, l: 52 }
  const CW = SVG_W - PAD.l - PAD.r
  const CH = SVG_H - PAD.t - PAD.b

  $: chartPoints = Object.values(chartData).sort((a, b) => a.date < b.date ? -1 : 1)
  $: chartVals   = chartPoints.map(p => Number(p[chartMetric] ?? 0))
  $: chartMax    = Math.max(...chartVals, 1)

  const METRICS = [
    { key: 'value',        label: 'Показы',     color: '#6366f1' },
    { key: 'chargedValue', label: 'Стоимость',  color: '#10b981' },
    { key: 'otsDmp',       label: 'OTS',        color: '#0ea5e9' },
  ]
  $: activeMetric = METRICS.find(m => m.key === chartMetric) ?? METRICS[0]

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
    return chartGroupType === 'BY_DAYS'
      ? pt.date.slice(5, 10).replace('-', '.')
      : pt.date.slice(11, 16)
  }

  function fmtYVal(v) {
    if (chartMetric === 'chargedValue') return formatMoney(v).replace(' ₽', '')
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
    return fmt(v)
  }

  // ── Map ───────────────────────────────────────────────────────────────────
  function initMap() {
    if (map) { map.remove(); map = null }
    if (!mapEl) return
    const valid = invStats.filter(r => r.inventory?.location?.latitude)
    if (!valid.length) return

    map = L.map(mapEl, { center: [55.75, 37.62], zoom: 5, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    const maxShowed = Math.max(...valid.map(r => r.totalShowed ?? 0), 1)
    const layer = L.layerGroup().addTo(map)

    for (const row of valid) {
      const loc = row.inventory.location
      const n   = row.totalShowed ?? 0
      const r   = n / maxShowed
      const color = n === 0 ? '#EF4444' : r >= 0.67 ? '#22C55E' : r >= 0.33 ? '#EAB308' : '#F97316'

      L.circleMarker([loc.latitude, loc.longitude], {
        radius: 8, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.9,
      })
        .bindPopup(
          `<b>${row.inventory.name ?? ''}</b><br>` +
          `Показы: ${fmt(n)}<br>` +
          `OTS: ${fmt(row.totalOpOts ?? row.totalOts ?? row.totalDmpOts)}<br>` +
          `CPM: ${fmt(row.cpm, 2)} ₽<br>` +
          `Стоимость: ${formatMoney(row.totalShowedBudget ?? row.showPrice ?? 0)}`
        )
        .addTo(layer)
    }

    if (valid.length) {
      map.fitBounds(
        L.latLngBounds(valid.map(r => [r.inventory.location.latitude, r.inventory.location.longitude])),
        { padding: [40, 40], maxZoom: 10 }
      )
    }
    mapInited = true
  }

  // Invalidate map size when map tab is re-shown
  $: if (activeTab === 'map' && map) {
    setTimeout(() => map?.invalidateSize(), 150)
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
      <button class="tab" class:active={activeTab==='table'} on:click={() => onTabChange('table')}>Показы</button>
      <button class="tab" class:active={activeTab==='chart'} on:click={() => onTabChange('chart')}>Графики</button>
      <button class="tab" class:active={activeTab==='map'}   on:click={() => onTabChange('map')}>Карта</button>
    </div>

    <!-- ── TABLE TAB ─────────────────────────────────────────────────────────── -->
    {#if activeTab === 'table'}
      <!-- Filter bar -->
      <div class="filter-bar">
        <div class="filter-group">
          <span class="filter-label">Статус</span>
          <div class="filter-pills">
            <button class="filter-pill" class:active={filterStatus === ''}        on:click={() => { filterStatus = '';         applyFilter() }}>Все</button>
            <button class="filter-pill" class:active={filterStatus === 'SUCCESS'} on:click={() => { filterStatus = 'SUCCESS';  applyFilter() }}>Показан</button>
            <button class="filter-pill" class:active={filterStatus === 'FAILED'}  on:click={() => { filterStatus = 'FAILED';   applyFilter() }}>Не показан</button>
          </div>
        </div>
        {#if formats.length > 1}
          <div class="filter-group">
            <span class="filter-label">Формат</span>
            <div class="filter-pills">
              <button class="filter-pill" class:active={filterFormat === ''} on:click={() => { filterFormat = ''; applyFilter() }}>Все</button>
              {#each formats as f}
                <button class="filter-pill" class:active={filterFormat === f} on:click={() => { filterFormat = f; applyFilter() }}>{f}</button>
              {/each}
            </div>
          </div>
        {/if}
        <div style="flex:1"></div>
        <span class="filter-count">
          {#if filterStatus || filterFormat}
            {fmt(filteredRows.length)} из {fmt(srvTotal)}
          {:else}
            {fmt(srvTotal)} записей
          {/if}
        </span>
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
                  <th>Дата/Время</th>
                  <th>Местное</th>
                  <th>Экран</th>
                  <th>Формат</th>
                  <th>Креатив</th>
                  <th>Статус</th>
                  <th>Причина отказа</th>
                  <th class="num">OTS</th>
                  <th class="num">Стоимость</th>
                </tr>
              </thead>
              <tbody>
                {#if viewRows.length === 0}
                  <tr><td colspan="9" class="panel-empty" style="text-align:center;padding:32px">
                    Нет записей с выбранными фильтрами.
                  </td></tr>
                {:else}
                  {#each viewRows as row (row.id)}
                    <tr class:row-failed={row.bidRequestState !== 'SUCCESS'}>
                      <td class="mono">{fmtMs(row.showTime)}</td>
                      <td class="mono">{fmtLocalTime(row.inventoryShowTime)}</td>
                      <td>
                        <span class="inv-name">{row.inventory?.name ?? row.inventoryGid ?? '—'}</span>
                        <span class="inv-addr">{row.address}{row.city ? ', ' + row.city : ''}</span>
                      </td>
                      <td class="dim">{row.inventoryFormat ?? '—'}</td>
                      <td class="dim" title={row.media?.name ?? ''}>
                        {#if row.media?.name}
                          {row.media.name.length > 28 ? row.media.name.slice(0, 26) + '…' : row.media.name}
                        {:else}—{/if}
                      </td>
                      <td>
                        <span class="badge {impStatus(row).cls}">{impStatus(row).label}</span>
                      </td>
                      <td class="dim reason-cell">
                        {#if row.bidRequestState !== 'SUCCESS'}
                          <span title={row.failureReasonMessage ?? ''}>
                            {row.failureReasonCodeName ?? row.failureReasonType ?? '—'}
                          </span>
                        {:else}—{/if}
                      </td>
                      <td class="num mono">{fmt(row.ots ?? row.opOts)}</td>
                      <td class="num mono">{row.chargedPrice != null ? formatMoney(row.chargedPrice) : '—'}</td>
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
                on:click={() => { chartMetric = m.key }}
              >{m.label}</button>
            {/each}
          </div>

          <div style="flex:1"></div>

          <!-- Date range -->
          <div class="chart-dates">
            <input class="date-inp" type="date" bind:value={chartFrom} on:change={loadChart} />
            <span class="date-sep">—</span>
            <input class="date-inp" type="date" bind:value={chartTo}   on:change={loadChart} max={today} />
          </div>

          <!-- Group type toggle -->
          <div class="toggle-group">
            <button class="toggle-btn" class:active={chartGroupType==='BY_HOURS'} on:click={() => { chartGroupType='BY_HOURS'; loadChart() }}>По часам</button>
            <button class="toggle-btn" class:active={chartGroupType==='BY_DAYS'}  on:click={() => { chartGroupType='BY_DAYS';  loadChart() }}>По дням</button>
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
                {#if chartMetric === 'chargedValue'}
                  {formatMoney(chartVals.reduce((s, v) => s + v, 0))}
                {:else}
                  {fmt(chartVals.reduce((s, v) => s + v, 0))}
                {/if}
              </span>
            </div>
            <div class="cs-item">
              <span class="cs-label">Максимум</span>
              <span class="cs-val">
                {#if chartMetric === 'chargedValue'}{formatMoney(chartMax)}{:else}{fmt(chartMax)}{/if}
              </span>
            </div>
            <div class="cs-item">
              <span class="cs-label">Точек данных</span>
              <span class="cs-val">{chartPoints.length}</span>
            </div>
          </div>
        {/if}
      </div>

    <!-- ── MAP TAB ─────────────────────────────────────────────────────────────── -->
    {:else if activeTab === 'map'}
      <div class="step-card tab-panel" style="padding:0;overflow:hidden">
        {#if mapLoading}
          <div class="panel-loading"><div class="spinner"></div> Загрузка карты…</div>
        {:else if mapError}
          <div class="panel-error">{mapError}</div>
        {:else}
          <div class="map-legend">
            <span class="leg-dot" style="background:#22C55E"></span> Высокая активность
            <span class="leg-dot" style="background:#EAB308;margin-left:12px"></span> Средняя
            <span class="leg-dot" style="background:#F97316;margin-left:12px"></span> Низкая
            <span class="leg-dot" style="background:#EF4444;margin-left:12px"></span> Нет показов
          </div>
          <div bind:this={mapEl} class="stats-map"></div>
          {#if invStats.length === 0 && !mapLoading}
            <div class="map-empty">Нет данных по экранам.</div>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}

  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
  </div>
</div>

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
  .tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
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

  /* ── Map ─────────────────────────────────────────────────────────────────── */
  .map-legend {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    font-size: 12px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    background: var(--bg-muted, #f9fafb);
    flex-wrap: wrap;
  }
  .leg-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .stats-map {
    height: 420px;
    width: 100%;
  }

  .map-empty {
    padding: 20px;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
  }

  /* ── Leaflet overrides ───────────────────────────────────────────────────── */
  :global(.leaflet-popup-content b) { font-size: 13px; }
  :global(.leaflet-popup-content)   { font-size: 12px; line-height: 1.7; }
</style>
