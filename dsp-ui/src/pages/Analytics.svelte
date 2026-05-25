<script>
  import { onMount } from 'svelte'
  import { api } from '../lib/api.js'
  import { formatMoney, formatDate, STATE_LABEL, STATE_COLOR, TYPE_LABEL, FORMAT_LABEL } from '../lib/utils.js'
  import { t as tr } from '../lib/i18n.js'

  // ── State ─────────────────────────────────────────────────────────────────
  let loading       = true
  let statsLoading  = false
  let error         = ''

  let allCampaigns  = []   // full unfiltered list with stats merged in
  let statsMap      = {}   // campaignId → { totalShowed, totalOts, totalBudgetShowed, cpm }
  // Per-inventory stat rows enriched from the screens cache — used for vendor/format/city breakdowns
  let invRows       = []   // { invId, owner, format, city, spent, showed, ots }

  // Filter options
  let stateOptions  = []
  let typeOptions   = []

  // Filter values — campaign-level (top filter bar)
  let filterOpen    = true
  let searchText    = ''
  let dateFrom      = ''
  let dateTo        = ''
  let selectedStates = []
  let selectedTypes  = []
  let minBudget     = ''
  let maxBudget     = ''

  // Dropdown open state
  let statusDropdownOpen = false
  let typeDropdownOpen   = false

  // Filter values — breakdown section (vendor / format / city drill-down)
  let dimFilterVendors = []   // selected vendor names
  let dimFilterFormats = []   // selected format keys
  let dimFilterCity    = ''   // city text search

  // ── Constants ─────────────────────────────────────────────────────────────
  const COLOR_MAP = {
    green: '#16a34a', blue: '#3b82f6', yellow: '#f59e0b',
    orange: '#f97316', red: '#ef4444', gray: '#9ca3af', purple: '#8b5cf6',
  }
  const TYPE_COLOR = {
    RTB: '#3b82f6', GUARANTEED: '#10b981', FLEX_GUARANTEED: '#8b5cf6', OPEN_RTB: '#f59e0b',
  }
  const FORMAT_COLOR = {
    BILLBOARD: '#3b82f6', LED: '#10b981', INDOOR: '#8b5cf6',
    CITYFORMAT: '#f59e0b', SUPERSITE: '#ef4444', DIGITAL: '#06b6d4',
    PVZ_SCREEN: '#f97316', VIDEO: '#ec4899',
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmt(n) {
    if (!n) return '0'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
    return n.toLocaleString('ru-RU')
  }

  function stateColor(state) {
    return COLOR_MAP[STATE_COLOR[state] ?? 'gray'] ?? '#9ca3af'
  }

  function toggleState(s) {
    selectedStates = selectedStates.includes(s)
      ? selectedStates.filter(x => x !== s)
      : [...selectedStates, s]
  }

  function toggleType(t) {
    selectedTypes = selectedTypes.includes(t)
      ? selectedTypes.filter(x => x !== t)
      : [...selectedTypes, t]
  }

  function resetFilters() {
    searchText     = ''
    dateFrom       = ''
    dateTo         = ''
    selectedStates = []
    selectedTypes  = []
    minBudget      = ''
    maxBudget      = ''
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  $: filteredCampaigns = (() => {
    let list = allCampaigns.map(c => ({
      ...c,
      _stats: statsMap[c.id] ?? {},
    }))

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      list = list.filter(c => (c.name ?? '').toLowerCase().includes(q))
    }
    if (dateFrom) {
      list = list.filter(c => c.startDate && c.startDate >= dateFrom)
    }
    if (dateTo) {
      list = list.filter(c => c.endDate && c.endDate <= dateTo)
    }
    if (selectedStates.length) {
      list = list.filter(c => selectedStates.includes(c.state))
    }
    if (selectedTypes.length) {
      list = list.filter(c => selectedTypes.includes(c.type))
    }
    if (minBudget !== '' && !isNaN(Number(minBudget))) {
      list = list.filter(c => (c.budget ?? 0) >= Number(minBudget))
    }
    if (maxBudget !== '' && !isNaN(Number(maxBudget))) {
      list = list.filter(c => (c.budget ?? 0) <= Number(maxBudget))
    }

    return list
  })()

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  $: totalCampaigns     = filteredCampaigns.length
  $: activeCnt          = filteredCampaigns.filter(c => ['ACTIVE', 'ACTIVATED'].includes(c.state)).length
  $: totalBudgetPlanned = filteredCampaigns.reduce((s, c) => s + (c.budget ?? 0), 0)
  $: totalBudgetSpent   = filteredCampaigns.reduce((s, c) => s + (c._stats.totalBudgetShowed ?? 0), 0)
  $: totalImpressions   = filteredCampaigns.reduce((s, c) => s + (c._stats.totalShowed ?? 0), 0)
  $: totalOts           = filteredCampaigns.reduce((s, c) => s + (c._stats.totalOts ?? 0), 0)
  $: avgCpm = (() => {
    const withSpend = filteredCampaigns.filter(c => (c._stats.totalBudgetShowed ?? 0) > 0)
    if (!withSpend.length) return 0
    const totalSpendW = withSpend.reduce((s, c) => s + (c._stats.totalBudgetShowed ?? 0), 0)
    const weightedCpm = withSpend.reduce((s, c) => {
      const w = c._stats.totalBudgetShowed ?? 0
      return s + (c._stats.cpm ?? 0) * w
    }, 0)
    return totalSpendW > 0 ? weightedCpm / totalSpendW : 0
  })()
  $: spendPct = totalBudgetPlanned > 0
    ? Math.min(100, (totalBudgetSpent / totalBudgetPlanned) * 100)
    : 0

  // ── Chart data ────────────────────────────────────────────────────────────
  $: byMonth = (() => {
    const m = {}
    for (const c of filteredCampaigns) {
      const d = c.startDate ? new Date(c.startDate) : null
      if (!d || isNaN(d)) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!m[key]) m[key] = {
        key,
        label: d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
        budget: 0,
        spent: 0,
        impressions: 0,
      }
      m[key].budget      += c.budget ?? 0
      m[key].spent       += c._stats.totalBudgetShowed ?? 0
      m[key].impressions += c._stats.totalShowed ?? 0
    }
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
  })()

  // SVG chart dimensions
  const PAD = { t: 16, r: 8, b: 44, l: 68 }
  const SVG_W = 600
  const SVG_H = 220
  const CHART_W = SVG_W - PAD.l - PAD.r
  const CHART_H = SVG_H - PAD.t - PAD.b
  const GRIDLINES = 4

  $: budgetMax  = Math.max(1, ...byMonth.map(m => m.budget))
  $: impressMax = Math.max(1, ...byMonth.map(m => m.impressions))

  function chartBarX(i, total, barIdx, numBars) {
    if (total === 0) return 0
    const slotW = CHART_W / total
    const gap = slotW * 0.15
    const bw = (slotW - gap * (numBars + 1)) / numBars
    return PAD.l + i * slotW + gap * (barIdx + 1) + barIdx * bw
  }

  function barWidth(total, numBars) {
    if (total === 0) return 0
    const slotW = CHART_W / total
    const gap = slotW * 0.15
    return Math.max(2, (slotW - gap * (numBars + 1)) / numBars)
  }

  function gridY(v, maxVal) {
    return PAD.t + CHART_H - (v / maxVal) * CHART_H
  }

  // Impressions polyline
  $: impressPoints = byMonth.length
    ? byMonth.map((m, i) => {
        const x = PAD.l + (byMonth.length === 1 ? CHART_W / 2 : (i / (byMonth.length - 1)) * CHART_W)
        const y = PAD.t + CHART_H - (m.impressions / impressMax) * CHART_H
        return `${x},${y}`
      }).join(' ')
    : ''

  $: impressAreaPoints = (() => {
    if (!byMonth.length) return ''
    const pts = byMonth.map((m, i) => {
      const x = PAD.l + (byMonth.length === 1 ? CHART_W / 2 : (i / (byMonth.length - 1)) * CHART_W)
      const y = PAD.t + CHART_H - (m.impressions / impressMax) * CHART_H
      return `${x},${y}`
    })
    const first = pts[0].split(',')
    const last  = pts[pts.length - 1].split(',')
    const bottom = PAD.t + CHART_H
    return `${PAD.l},${bottom} ${pts.join(' ')} ${last[0]},${bottom}`
  })()

  // ── Breakdown by type ─────────────────────────────────────────────────────
  $: byType = (() => {
    const m = {}
    for (const c of filteredCampaigns) {
      const t = c.type ?? 'UNKNOWN'
      if (!m[t]) m[t] = { count: 0, budget: 0, spent: 0 }
      m[t].count++
      m[t].budget += c.budget ?? 0
      m[t].spent  += c._stats.totalBudgetShowed ?? 0
    }
    return Object.entries(m)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([type, v]) => ({
        type,
        label: TYPE_LABEL[type] ?? type,
        color: TYPE_COLOR[type] ?? '#64748b',
        ...v,
      }))
  })()
  $: typeMaxCount = Math.max(1, ...byType.map(t => t.count))

  // ── Breakdown by status ───────────────────────────────────────────────────
  $: byStatus = (() => {
    const m = {}
    for (const c of filteredCampaigns) {
      m[c.state] = (m[c.state] ?? 0) + 1
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([state, count]) => ({
        state,
        count,
        label: STATE_LABEL[state] ?? state,
        color: COLOR_MAP[STATE_COLOR[state] ?? 'gray'] ?? '#9ca3af',
      }))
  })()
  $: statusMaxCount = Math.max(1, ...byStatus.map(s => s.count))

  // States/types that actually appear in loaded campaigns (with counts)
  $: usedStates = (() => {
    const m = {}
    for (const c of allCampaigns) {
      if (c.state) m[c.state] = (m[c.state] ?? 0) + 1
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([state, count]) => ({ state, count }))
  })()
  $: usedTypes = (() => {
    const m = {}
    for (const c of allCampaigns) {
      if (c.type) m[c.type] = (m[c.type] ?? 0) + 1
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }))
  })()

  // Generic helper: aggregate rows by a string dimension key.
  // rows must be passed explicitly so Svelte tracks it as a reactive dependency
  // (accessing it inside a called function is NOT tracked by the compiler).
  function aggByDim(key, rows) {
    const m = {}
    for (const r of rows) {
      const k = r[key]
      if (!k) continue
      if (!m[k]) m[k] = { spent: 0, showed: 0, ots: 0, screens: new Set() }
      m[k].spent   += r.spent
      m[k].showed  += r.showed
      m[k].ots     += r.ots
      if (r.invId) m[k].screens.add(r.invId)
    }
    return Object.entries(m)
      .map(([label, v]) => ({ label, spent: v.spent, showed: v.showed, ots: v.ots, screens: v.screens.size }))
      .sort((a, b) => b.spent - a.spent)
  }

  // Filter invRows: campaign-level filters + breakdown drill-down filters
  $: _filteredIds    = new Set(filteredCampaigns.map(c => c.id))
  $: filteredInvRows = (() => {
    const _vendors = dimFilterVendors
    const _formats = dimFilterFormats
    const _city    = dimFilterCity.trim().toLowerCase()
    return invRows.filter(r => {
      if (!_filteredIds.has(r.campaignId)) return false
      if (_vendors.length && !_vendors.includes(r.owner))  return false
      if (_formats.length && !_formats.includes(r.format)) return false
      if (_city && !(r.city ?? '').toLowerCase().includes(_city)) return false
      return true
    })
  })()

  // Available options derived from the full (campaign-filtered) set
  $: _campaignInvRows = invRows.filter(r => _filteredIds.has(r.campaignId))
  $: availableVendors = [...new Set(_campaignInvRows.map(r => r.owner).filter(Boolean))].sort()
  $: availableFormats = [...new Set(_campaignInvRows.map(r => r.format).filter(Boolean))].sort()

  function toggleDimVendor(v) {
    dimFilterVendors = dimFilterVendors.includes(v)
      ? dimFilterVendors.filter(x => x !== v)
      : [...dimFilterVendors, v]
  }
  function toggleDimFormat(f) {
    dimFilterFormats = dimFilterFormats.includes(f)
      ? dimFilterFormats.filter(x => x !== f)
      : [...dimFilterFormats, f]
  }
  function clearDimFilters() {
    dimFilterVendors = []
    dimFilterFormats = []
    dimFilterCity    = ''
  }
  $: dimFiltersActive = dimFilterVendors.length > 0 || dimFilterFormats.length > 0 || dimFilterCity.trim() !== ''

  $: byVendor = aggByDim('owner',  filteredInvRows).slice(0, 12)
  $: byFormat = aggByDim('format', filteredInvRows)
  $: byCity   = aggByDim('city',   filteredInvRows).slice(0, 12)

  $: vendorMaxSpent = Math.max(1, ...byVendor.map(v => v.spent))
  $: formatMaxSpent = Math.max(1, ...byFormat.map(f => f.spent))
  $: cityMaxSpent   = Math.max(1, ...byCity.map(c => c.spent))

  // ── Data loading ──────────────────────────────────────────────────────────
  onMount(async () => {
    // Load filter options in parallel
    api.filters.states().then(r => { stateOptions = Array.isArray(r) ? r : [] }).catch(() => {})
    api.filters.types().then(r => { typeOptions = Array.isArray(r) ? r : [] }).catch(() => {})

    // Load all campaigns
    try {
      const PAGE = 100
      const first = await api.campaigns.list({ page: 0, size: PAGE, sort: 'startDate,desc' })
      const totalPages = first.totalPages ?? 1
      allCampaigns = [...(first.content ?? [])]
      for (let p = 1; p < totalPages; p++) {
        try {
          const r = await api.campaigns.list({ page: p, size: PAGE, sort: 'startDate,desc' })
          allCampaigns = [...allCampaigns, ...(r.content ?? [])]
        } catch {}
      }
    } catch {
      error = 'Не удалось загрузить кампании'
    } finally {
      loading = false
    }

    if (!allCampaigns.length) return

    // ── Phase 1: campaign-level KPI stats ────────────────────────────────────
    statsLoading = true
    const BATCH = 20
    const ids = allCampaigns.map(c => c.id)
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      try {
        const rows = await api.impressions.campaignStats(batch)
        if (!Array.isArray(rows)) continue
        const agg = {}
        for (const r of rows) {
          const cid = r.campaign?.id
          if (!cid) continue
          if (!r.inventory) {
            // Campaign-level aggregate row
            agg[cid] = {
              totalShowed:       r.totalCountShowed  ?? r.totalShowed  ?? 0,
              totalOts:          r.otsCountShowed    ?? r.totalOpOts   ?? 0,
              totalBudgetShowed: r.totalBudgetShowed ?? r.customerStats?.budgetShowed ?? 0,
              cpm:               r.cpm ?? 0,
            }
          }
        }
        statsMap = { ...statsMap, ...agg }
      } catch {}
    }
    statsLoading = false

    // ── Phase 2: per-inventory breakdown for dimension cards ─────────────────
    const spendIds = allCampaigns
      .filter(c => (statsMap[c.id]?.totalBudgetShowed ?? 0) > 0)
      .map(c => c.id)

    if (!spendIds.length) return

    // Build screenMap fetching ALL inventories (no enabled=true filter).
    // api.inventories.list() hardcodes enabled=true and would miss disabled
    // screens that belong to completed campaigns. listRaw bypasses that.
    const screenMap = new Map()
    try {
      const PAGE = 500
      let page = 0
      while (true) {
        const r = await api.inventories.listRaw(`page=${page}&size=${PAGE}`)
        for (const inv of r.content ?? []) {
          const itc = inv.inventoryTypeAndCity ?? {}
          screenMap.set(inv.id, {
            owner:  inv.displayOwner?.name || null,
            format: inv.type || itc.type   || null,
            city:   inv.city?.name || itc.cityName || null,
          })
        }
        if (r.last || page >= (r.totalPages ?? 1) - 1) break
        page++
      }
    } catch (e) {
      console.warn('[Analytics] screenMap build failed:', e)
    }

    // Fetch impression-inventory-stats per campaign and join with screenMap
    const BATCH_INV = 5
    const newInvRows = []
    for (let i = 0; i < spendIds.length; i += BATCH_INV) {
      const batchIds = spendIds.slice(i, i + BATCH_INV)
      const results = await Promise.all(
        batchIds.map(id => api.stats.inventoryStats(id).catch(() => []))
      )
      results.forEach((rows, idx) => {
        if (!Array.isArray(rows) || !rows.length) return
        const campaignId = batchIds[idx]
        for (const r of rows) {
          const invId  = r.inventory?.id ?? null
          // impression-inventory-stats only embeds id/name/location on inventory;
          // type, city, displayOwner come from the screenMap join.
          const screen = invId ? screenMap.get(invId) : null
          const owner  = screen?.owner  || null
          const format = screen?.format || null
          const city   = screen?.city   || null
          const spent  = r.customerStats?.budgetShowed ?? r.totalBudgetShowed ?? r.totalShowedBudget ?? 0
          const showed = r.totalCountShowed ?? r.totalShowed ?? 0
          const ots    = r.totalOpOts ?? r.totalOts ?? 0
          if (owner || format || city) {
            // campaignId tag lets us filter breakdown by whichever campaigns
            // are currently visible through the filter bar
            newInvRows.push({ invId, campaignId, owner, format, city, spent, showed, ots })
          }
        }
      })
      invRows = [...newInvRows]
    }
  })
</script>

<div class="an-page">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="an-header">
    <div>
      <h1 class="an-title">{$tr('an_title')}</h1>
      <p class="an-sub">
        {#if loading}
          {$tr('loading')}
        {:else}
          {totalCampaigns} {$tr('an_campaigns')}
          {#if statsLoading}· <span class="sub-loading">{$tr('an_loading')}</span>{/if}
        {/if}
      </p>
    </div>
    <div class="an-header-actions">
      <button class="btn-filter" on:click={() => filterOpen = !filterOpen}>
        {filterOpen ? $tr('an_hide_filter') : $tr('an_filter')}
      </button>
      <a href="#/campaigns" class="btn-link">{$tr('an_all_campaigns')}</a>
    </div>
  </div>

  {#if error}
    <div class="an-error">{error}</div>
  {:else if loading}
    <div class="an-spinner">
      <div class="spinner"></div>
      <span>{$tr('loading')}</span>
    </div>
  {:else}

  <!-- ── Filter bar ─────────────────────────────────────────────────────── -->
  {#if filterOpen}
  <div class="filter-bar">
    <div class="filter-row">

      <!-- Search -->
      <div class="filter-group filter-group--wide">
        <label class="filter-label">{$tr('an_filter')}</label>
        <input class="filter-input" type="text" placeholder={$tr('an_search')}
          bind:value={searchText} />
      </div>

      <!-- Date from -->
      <div class="filter-group">
        <label class="filter-label">{$tr('an_date_from')}</label>
        <input class="filter-input" type="date" bind:value={dateFrom} />
      </div>

      <!-- Date to -->
      <div class="filter-group">
        <label class="filter-label">{$tr('an_date_to')}</label>
        <input class="filter-input" type="date" bind:value={dateTo} />
      </div>

      <!-- Min budget -->
      <div class="filter-group">
        <label class="filter-label">{$tr('an_budget_from')}</label>
        <input class="filter-input" type="number" placeholder="0" bind:value={minBudget} />
      </div>

      <!-- Max budget -->
      <div class="filter-group">
        <label class="filter-label">{$tr('an_budget_to')}</label>
        <input class="filter-input" type="number" placeholder="∞" bind:value={maxBudget} />
      </div>
    </div>

    <div class="filter-row filter-row--dropdowns">

      <!-- Status dropdown -->
      <div class="filter-group">
        <label class="filter-label">{$tr('an_status')}</label>
        <div class="fdd-wrap" on:mouseleave={() => statusDropdownOpen = false}>
          <button class="fdd-btn" on:click={() => statusDropdownOpen = !statusDropdownOpen}>
            {#if selectedStates.length === 0}
              {$tr('an_all_statuses')}
            {:else}
              {selectedStates.length} {$tr('an_selected')}
            {/if}
            <span class="fdd-arrow">{statusDropdownOpen ? '▲' : '▼'}</span>
          </button>
          {#if statusDropdownOpen}
          <div class="fdd-panel">
            {#each usedStates as { state, count }}
              <label class="fdd-item {selectedStates.includes(state) ? 'fdd-item--checked' : ''}">
                <input type="checkbox" checked={selectedStates.includes(state)}
                  on:change={() => toggleState(state)} />
                <span class="fdd-dot" style="background:{stateColor(state)}"></span>
                <span class="fdd-name">{STATE_LABEL[state] ?? state}</span>
                <span class="fdd-count">{count}</span>
              </label>
            {/each}
          </div>
          {/if}
        </div>
      </div>

      <!-- Type dropdown -->
      <div class="filter-group">
        <label class="filter-label">{$tr('an_type')}</label>
        <div class="fdd-wrap" on:mouseleave={() => typeDropdownOpen = false}>
          <button class="fdd-btn" on:click={() => typeDropdownOpen = !typeDropdownOpen}>
            {#if selectedTypes.length === 0}
              {$tr('an_all_types')}
            {:else}
              {selectedTypes.length} {$tr('an_selected')}
            {/if}
            <span class="fdd-arrow">{typeDropdownOpen ? '▲' : '▼'}</span>
          </button>
          {#if typeDropdownOpen}
          <div class="fdd-panel">
            {#each usedTypes as { type, count }}
              <label class="fdd-item {selectedTypes.includes(type) ? 'fdd-item--checked' : ''}">
                <input type="checkbox" checked={selectedTypes.includes(type)}
                  on:change={() => toggleType(type)} />
                <span class="fdd-dot" style="background:{TYPE_COLOR[type] ?? '#64748b'};border-radius:2px"></span>
                <span class="fdd-name">{TYPE_LABEL[type] ?? type}</span>
                <span class="fdd-count">{count}</span>
              </label>
            {/each}
          </div>
          {/if}
        </div>
      </div>

      <!-- Actions -->
      <div class="filter-actions">
        <span class="filter-chip">{totalCampaigns} {$tr('an_campaigns')}</span>
        <button class="btn-reset" on:click={resetFilters}>{$tr('an_reset')}</button>
      </div>

    </div>
  </div>
  {/if}

  <!-- ── KPI cards ─────────────────────────────────────────────────────────── -->
  <div class="kpi-grid">

    <div class="kpi-card">
      <div class="kpi-label">{$tr('an_kpi_campaigns')}</div>
      <div class="kpi-value">{totalCampaigns}</div>
      <div class="kpi-sub">{activeCnt} {$tr('an_kpi_active')}</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">{$tr('an_kpi_planned')}</div>
      <div class="kpi-value kpi-money">{formatMoney(totalBudgetPlanned)}</div>
      <div class="kpi-sub">{$tr('an_kpi_by_selected')}</div>
    </div>

    <div class="kpi-card kpi-card--accent">
      <div class="kpi-label">{$tr('an_kpi_spent')}</div>
      <div class="kpi-value kpi-money">
        {#if statsLoading}<span class="kpi-loading">…</span>{:else}{formatMoney(totalBudgetSpent)}{/if}
      </div>
      <div class="kpi-sub">
        {#if !statsLoading && totalBudgetPlanned > 0}
          <span class="kpi-bar">
            <span class="kpi-bar-fill" style="width:{spendPct.toFixed(1)}%"></span>
          </span>
          {spendPct.toFixed(1)}% {$tr('an_kpi_from_plan')}
        {:else if !statsLoading}—{:else}загрузка…{/if}
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">{$tr('an_kpi_impressions')}</div>
      <div class="kpi-value">
        {#if statsLoading}<span class="kpi-loading">…</span>{:else}{fmt(totalImpressions)}{/if}
      </div>
      <div class="kpi-sub">{#if !statsLoading}OTS: {fmt(totalOts)}{:else}загрузка…{/if}</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">{$tr('an_kpi_avg_cpm')}</div>
      <div class="kpi-value kpi-money">
        {#if statsLoading}<span class="kpi-loading">…</span>{:else}{formatMoney(avgCpm)}{/if}
      </div>
      <div class="kpi-sub">{$tr('an_kpi_weighted')}</div>
    </div>

  </div>

  <!-- ── Charts ─────────────────────────────────────────────────────────────── -->
  {#if byMonth.length > 0}
  <div class="two-col">

    <!-- Chart 1: Budget bars by month -->
    <div class="card">
      <div class="card-title">{$tr('an_chart_budget')}</div>
      <svg viewBox="0 0 {SVG_W} {SVG_H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
        <!-- Gridlines -->
        {#each Array(GRIDLINES + 1) as _, gi}
          {@const gy = PAD.t + (gi / GRIDLINES) * CHART_H}
          {@const gv = budgetMax * (1 - gi / GRIDLINES)}
          <line x1={PAD.l} y1={gy} x2={PAD.l + CHART_W} y2={gy}
            stroke="#f3f4f6" stroke-width="1" />
          <text x={PAD.l - 6} y={gy + 4} text-anchor="end"
            font-size="10" fill="#9ca3af">{fmt(gv)}</text>
        {/each}

        <!-- Bars per month -->
        {#each byMonth as mo, i}
          {@const bw = barWidth(byMonth.length, 2)}
          {@const x0 = chartBarX(i, byMonth.length, 0, 2)}
          {@const x1 = chartBarX(i, byMonth.length, 1, 2)}
          {@const hPlan  = (mo.budget / budgetMax) * CHART_H}
          {@const hSpent = (mo.spent  / budgetMax) * CHART_H}

          <!-- Planned bar -->
          <rect
            x={x0} y={PAD.t + CHART_H - hPlan}
            width={bw} height={Math.max(1, hPlan)}
            fill="#bfdbfe" rx="2"
          >
            <title>{mo.label} — {$tr('an_chart_planned')}: {formatMoney(mo.budget)}</title>
          </rect>

          <!-- Spent bar -->
          {#if !statsLoading}
          <rect
            x={x1} y={PAD.t + CHART_H - hSpent}
            width={bw} height={Math.max(1, hSpent)}
            fill="#3b82f6" rx="2"
          >
            <title>{mo.label} — {$tr('an_chart_spent')}: {formatMoney(mo.spent)}</title>
          </rect>
          {/if}

          <!-- Month label -->
          {@const labelX = PAD.l + (byMonth.length === 1 ? CHART_W / 2 : (i / Math.max(1, byMonth.length - 1)) * CHART_W)}
          <text
            x={labelX}
            y={PAD.t + CHART_H + 14}
            text-anchor="middle"
            font-size="10"
            fill="#9ca3af"
            transform="rotate(-25,{labelX},{PAD.t + CHART_H + 14})"
          >{mo.label}</text>
        {/each}

        <!-- Axes -->
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + CHART_H}
          stroke="#e5e7eb" stroke-width="1" />
        <line x1={PAD.l} y1={PAD.t + CHART_H} x2={PAD.l + CHART_W} y2={PAD.t + CHART_H}
          stroke="#e5e7eb" stroke-width="1" />
      </svg>

      <div class="chart-legend">
        <span class="legend-swatch" style="background:#bfdbfe"></span> {$tr('an_chart_planned')}
        <span class="legend-swatch" style="background:#3b82f6;margin-left:12px"></span> {$tr('an_chart_spent')}
      </div>
    </div>

    <!-- Chart 2: Impressions line -->
    <div class="card">
      <div class="card-title">{$tr('an_chart_impr')}</div>
      <svg viewBox="0 0 {SVG_W} {SVG_H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
        <!-- Gridlines -->
        {#each Array(GRIDLINES + 1) as _, gi}
          {@const gy = PAD.t + (gi / GRIDLINES) * CHART_H}
          {@const gv = impressMax * (1 - gi / GRIDLINES)}
          <line x1={PAD.l} y1={gy} x2={PAD.l + CHART_W} y2={gy}
            stroke="#f3f4f6" stroke-width="1" />
          <text x={PAD.l - 6} y={gy + 4} text-anchor="end"
            font-size="10" fill="#9ca3af">{fmt(gv)}</text>
        {/each}

        {#if !statsLoading && byMonth.length > 1}
          <!-- Area fill -->
          <polygon points={impressAreaPoints} fill="#e0e7ff" opacity="0.6" />
          <!-- Line -->
          <polyline points={impressPoints} fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round" />
          <!-- Dots -->
          {#each byMonth as mo, i}
            {@const px = PAD.l + (i / (byMonth.length - 1)) * CHART_W}
            {@const py = PAD.t + CHART_H - (mo.impressions / impressMax) * CHART_H}
            <circle cx={px} cy={py} r="3.5" fill="#6366f1">
              <title>{mo.label}: {fmt(mo.impressions)} показов</title>
            </circle>
          {/each}
        {:else if !statsLoading && byMonth.length === 1}
          {@const px = PAD.l + CHART_W / 2}
          {@const py = PAD.t + CHART_H - (byMonth[0].impressions / impressMax) * CHART_H}
          <circle cx={px} cy={py} r="5" fill="#6366f1">
            <title>{byMonth[0].label}: {fmt(byMonth[0].impressions)} показов</title>
          </circle>
        {:else if statsLoading}
          <text x={SVG_W / 2} y={SVG_H / 2} text-anchor="middle" font-size="12" fill="#9ca3af">
            загрузка…
          </text>
        {/if}

        <!-- Month labels -->
        {#each byMonth as mo, i}
          {@const labelX = PAD.l + (byMonth.length === 1 ? CHART_W / 2 : (i / Math.max(1, byMonth.length - 1)) * CHART_W)}
          <text
            x={labelX}
            y={PAD.t + CHART_H + 14}
            text-anchor="middle"
            font-size="10"
            fill="#9ca3af"
            transform="rotate(-25,{labelX},{PAD.t + CHART_H + 14})"
          >{mo.label}</text>
        {/each}

        <!-- Axes -->
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + CHART_H}
          stroke="#e5e7eb" stroke-width="1" />
        <line x1={PAD.l} y1={PAD.t + CHART_H} x2={PAD.l + CHART_W} y2={PAD.t + CHART_H}
          stroke="#e5e7eb" stroke-width="1" />
      </svg>

      <div class="chart-legend">
        <span class="legend-swatch" style="background:#6366f1"></span> {$tr('an_chart_shows')}
      </div>
    </div>

  </div>
  {/if}


  <!-- ── Breakdown by dimension ─────────────────────────────────────────── -->
  <div class="two-col">

    <!-- By type -->
    <div class="card">
      <div class="card-title">{$tr('an_by_type')}</div>
      {#if byType.length === 0}
        <p class="empty-text">{$tr('an_no_data')}</p>
      {:else}
        <div class="dim-list">
          {#each byType as t}
            <div class="dim-row">
              <div class="dim-label">
                <span class="dim-dot" style="background:{t.color};border-radius:2px"></span>
                <span>{t.label}</span>
              </div>
              <div class="dim-bar-wrap">
                <div class="dim-bar-fill" style="width:{(t.count / typeMaxCount * 100).toFixed(1)}%;background:{t.color}"></div>
              </div>
              <div class="dim-stats">
                <span class="dim-count">{t.count}</span>
                <span class="dim-budget">{formatMoney(t.budget)}</span>
                {#if !statsLoading}<span class="dim-spent">{formatMoney(t.spent)}</span>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- By status -->
    <div class="card">
      <div class="card-title">{$tr('an_by_status')}</div>
      {#if byStatus.length === 0}
        <p class="empty-text">{$tr('an_no_data')}</p>
      {:else}
        <div class="dim-list">
          {#each byStatus as s}
            <div class="dim-row">
              <div class="dim-label">
                <span class="dim-dot" style="background:{s.color}"></span>
                <span>{s.label}</span>
              </div>
              <div class="dim-bar-wrap">
                <div class="dim-bar-fill" style="width:{(s.count / statusMaxCount * 100).toFixed(1)}%;background:{s.color}"></div>
              </div>
              <div class="dim-stats">
                <span class="dim-count">{s.count}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div>

  <!-- ── Breakdown filters ─────────────────────────────────────────────────── -->
  {#if invRows.length > 0}
  <div class="dim-filter-bar">

    <!-- Vendor chips -->
    {#if availableVendors.length}
    <div class="dim-filter-group">
      <span class="dim-filter-label">{$tr('an_operator')}</span>
      <div class="dim-chips">
        {#each availableVendors as v}
          <button
            class="dim-chip {dimFilterVendors.includes(v) ? 'dim-chip--active' : ''}"
            on:click={() => toggleDimVendor(v)}
          >{v}</button>
        {/each}
      </div>
    </div>
    {/if}

    <!-- Format chips -->
    {#if availableFormats.length}
    <div class="dim-filter-group">
      <span class="dim-filter-label">{$tr('an_format')}</span>
      <div class="dim-chips">
        {#each availableFormats as f}
          {@const color = FORMAT_COLOR[f] ?? '#64748b'}
          <button
            class="dim-chip {dimFilterFormats.includes(f) ? 'dim-chip--active' : ''}"
            style={dimFilterFormats.includes(f) ? `background:${color};border-color:${color};color:#fff` : `border-color:${color};color:${color}`}
            on:click={() => toggleDimFormat(f)}
          >{FORMAT_LABEL[f] ?? f}</button>
        {/each}
      </div>
    </div>
    {/if}

    <!-- City search -->
    <div class="dim-filter-group dim-filter-group--city">
      <span class="dim-filter-label">{$tr('cl_city')}</span>
      <input
        class="dim-city-input"
        type="text"
        placeholder={$tr('an_city_search')}
        bind:value={dimFilterCity}
      />
    </div>

    {#if dimFiltersActive}
      <button class="dim-clear-btn" on:click={clearDimFilters}>{$tr('an_dim_reset')}</button>
    {/if}
  </div>
  {/if}

  <!-- ── Breakdown by vendor / format / city ───────────────────────────────── -->
  {#if !statsLoading || invRows.length > 0}
  <div class="three-col">

    <!-- By vendor -->
    <div class="card">
      <div class="card-title">{$tr('an_by_vendor')}</div>
      {#if statsLoading && byVendor.length === 0}
        <p class="empty-text">{$tr('an_loading')}</p>
      {:else if byVendor.length === 0}
        <p class="empty-text">{$tr('an_no_data')}</p>
      {:else}
        <div class="dim-list">
          {#each byVendor as v}
            <div class="dim-row">
              <div class="dim-label"><span class="dim-dot" style="background:#6366f1;border-radius:2px"></span><span title={v.label}>{v.label}</span></div>
              <div class="dim-bar-wrap"><div class="dim-bar-fill" style="width:{(v.spent/vendorMaxSpent*100).toFixed(1)}%;background:#6366f1"></div></div>
              <div class="dim-stats">
                <span class="dim-count">{v.screens} {$tr('an_dim_screens')}</span>
                <span class="dim-spent">{formatMoney(v.spent)}</span>
                <span class="dim-budget dim-muted">{fmt(v.showed)} {$tr('an_dim_shows')}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- By format -->
    <div class="card">
      <div class="card-title">{$tr('an_by_format')}</div>
      {#if statsLoading && byFormat.length === 0}
        <p class="empty-text">{$tr('an_loading')}</p>
      {:else if byFormat.length === 0}
        <p class="empty-text">{$tr('an_no_data')}</p>
      {:else}
        <div class="dim-list">
          {#each byFormat as f}
            {@const color = FORMAT_COLOR[f.label] ?? '#64748b'}
            <div class="dim-row">
              <div class="dim-label"><span class="dim-dot" style="background:{color};border-radius:2px"></span><span>{FORMAT_LABEL[f.label] ?? f.label}</span></div>
              <div class="dim-bar-wrap"><div class="dim-bar-fill" style="width:{(f.spent/formatMaxSpent*100).toFixed(1)}%;background:{color}"></div></div>
              <div class="dim-stats">
                <span class="dim-count">{f.screens} {$tr('an_dim_screens')}</span>
                <span class="dim-spent">{formatMoney(f.spent)}</span>
                <span class="dim-budget dim-muted">{fmt(f.showed)} {$tr('an_dim_shows')}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- By city -->
    <div class="card">
      <div class="card-title">{$tr('an_by_city')}</div>
      {#if statsLoading && byCity.length === 0}
        <p class="empty-text">{$tr('an_loading')}</p>
      {:else if byCity.length === 0}
        <p class="empty-text">{$tr('an_no_data')}</p>
      {:else}
        <div class="dim-list">
          {#each byCity as c}
            <div class="dim-row">
              <div class="dim-label"><span class="dim-dot" style="background:#0ea5e9;border-radius:2px"></span><span title={c.label}>{c.label}</span></div>
              <div class="dim-bar-wrap"><div class="dim-bar-fill" style="width:{(c.spent/cityMaxSpent*100).toFixed(1)}%;background:#0ea5e9"></div></div>
              <div class="dim-stats">
                <span class="dim-count">{c.screens} {$tr('an_dim_screens')}</span>
                <span class="dim-spent">{formatMoney(c.spent)}</span>
                <span class="dim-budget dim-muted">{fmt(c.showed)} {$tr('an_dim_shows')}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div>
  {/if}

  {/if}
</div>

<style>
  .an-page {
    padding: 28px 32px 48px;
    min-height: 100%;
    box-sizing: border-box;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .an-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .an-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--text, #111827);
    margin: 0 0 4px;
  }
  .an-sub {
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    margin: 0;
  }
  .sub-loading { color: #f59e0b; }
  .an-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .btn-filter {
    font-size: 13px;
    color: var(--text, #374151);
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-filter:hover { background: #f9fafb; }
  .btn-link {
    font-size: 13px;
    color: #3b82f6;
    text-decoration: none;
    padding: 6px 12px;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    transition: background 0.15s;
  }
  .btn-link:hover { background: #eff6ff; }
  .an-error {
    padding: 20px;
    color: #dc2626;
    background: #fef2f2;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  .an-spinner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 60px 0;
    color: var(--text-muted, #6b7280);
    font-size: 13px;
  }
  .spinner {
    width: 22px; height: 22px;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Filter bar ─────────────────────────────────────────────────────────── */
  .filter-bar {
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .filter-row {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
  }
  .filter-row--dropdowns {
    align-items: flex-start;
  }
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 120px;
  }
  .filter-group--wide { min-width: 200px; }
  .filter-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .filter-input {
    font-size: 13px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    padding: 5px 8px;
    color: var(--text, #374151);
    background: #fff;
    outline: none;
    transition: border-color 0.15s;
  }
  .filter-input:focus { border-color: #3b82f6; }

  .multi-check {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-width: 480px;
  }
  .mcheck-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--text, #374151);
    cursor: pointer;
    white-space: nowrap;
  }
  .mcheck-item input { margin: 0; cursor: pointer; }
  .mcheck-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .filter-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: auto;
    padding-top: 18px;
  }
  .filter-chip {
    font-size: 12px;
    font-weight: 600;
    color: #3b82f6;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 20px;
    padding: 3px 10px;
  }
  .btn-reset {
    font-size: 12px;
    color: #6b7280;
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .btn-reset:hover { background: #f9fafb; color: #374151; }

  /* ── KPI cards ──────────────────────────────────────────────────────────── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 14px;
    margin-bottom: 20px;
  }
  .kpi-card {
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    padding: 16px 18px;
  }
  .kpi-card--accent {
    background: linear-gradient(135deg, #eff6ff 0%, #fff 100%);
    border-color: #bfdbfe;
  }
  .kpi-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }
  .kpi-value {
    font-size: 26px;
    font-weight: 700;
    color: var(--text, #111827);
    line-height: 1;
    margin-bottom: 6px;
  }
  .kpi-money { font-size: 18px; font-weight: 600; }
  .kpi-loading { color: #9ca3af; font-size: 22px; }
  .kpi-sub {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .kpi-bar {
    display: inline-block;
    width: 48px;
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .kpi-bar-fill {
    display: block;
    height: 100%;
    background: #3b82f6;
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  /* ── Cards ──────────────────────────────────────────────────────────────── */
  .card {
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    padding: 18px 20px;
  }
  .card--full {
    margin-bottom: 20px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text, #374151);
    margin-bottom: 16px;
  }

  /* ── Two-column layout ──────────────────────────────────────────────────── */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 20px;
  }
  .three-col {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;
    margin-bottom: 20px;
  }

  /* ── Charts ─────────────────────────────────────────────────────────────── */
  .chart-svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .chart-legend {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    margin-top: 8px;
  }
  .legend-swatch {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* ── Dimension breakdown ────────────────────────────────────────────────── */
  .dim-list { display: flex; flex-direction: column; gap: 12px; }
  .dim-row {
    display: grid;
    grid-template-columns: 160px 1fr auto;
    align-items: center;
    gap: 10px;
  }
  .dim-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text, #374151);
    overflow: hidden;
  }
  .dim-dot {
    width: 9px; height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dim-bar-wrap {
    height: 6px;
    background: #f3f4f6;
    border-radius: 3px;
    overflow: hidden;
  }
  .dim-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
    min-width: 2px;
  }
  .dim-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    min-width: 110px;
  }
  .dim-count {
    font-size: 12px;
    font-weight: 700;
    color: var(--text, #374151);
  }
  .dim-budget {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    white-space: nowrap;
  }
  .dim-spent {
    font-size: 11px;
    color: #3b82f6;
    white-space: nowrap;
  }
  .dim-muted {
    color: var(--text-muted, #9ca3af) !important;
  }
  .empty-text {
    font-size: 13px;
    color: var(--text-muted, #9ca3af);
    margin: 0;
  }

  /* ── Filter dropdowns ──────────────────────────────────────────────────── */
  .fdd-wrap {
    position: relative;
  }
  .fdd-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text, #374151);
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    padding: 5px 10px;
    cursor: pointer;
    min-width: 140px;
    justify-content: space-between;
    transition: border-color 0.15s;
  }
  .fdd-btn:hover { border-color: #9ca3af; }
  .fdd-arrow { font-size: 9px; color: #9ca3af; }
  .fdd-panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 100;
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.10);
    min-width: 200px;
    padding: 6px 0;
    max-height: 260px;
    overflow-y: auto;
  }
  .fdd-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text, #374151);
    transition: background 0.1s;
  }
  .fdd-item:hover { background: #f9fafb; }
  .fdd-item--checked { background: #eff6ff; }
  .fdd-item input { margin: 0; cursor: pointer; flex-shrink: 0; }
  .fdd-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .fdd-name { flex: 1; }
  .fdd-count {
    font-size: 11px;
    font-weight: 600;
    color: #9ca3af;
    background: #f3f4f6;
    border-radius: 10px;
    padding: 1px 6px;
    min-width: 20px;
    text-align: center;
  }
  .fdd-item--checked .fdd-count { background: #dbeafe; color: #3b82f6; }

  /* ── Breakdown filter bar ───────────────────────────────────────────────── */
  .dim-filter-bar {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 14px;
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 14px;
  }
  .dim-filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .dim-filter-group--city {
    flex-wrap: nowrap;
  }
  .dim-filter-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .dim-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .dim-chip {
    font-size: 12px;
    padding: 3px 10px;
    border: 1.5px solid #d1d5db;
    border-radius: 20px;
    background: #fff;
    color: #374151;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .dim-chip:hover { background: #f3f4f6; }
  .dim-chip--active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: #fff;
  }
  .dim-chip--active:hover { background: #2563eb; }
  .dim-city-input {
    font-size: 12px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    padding: 4px 8px;
    width: 160px;
    outline: none;
    transition: border-color 0.15s;
  }
  .dim-city-input:focus { border-color: #3b82f6; }
  .dim-clear-btn {
    font-size: 12px;
    color: #6b7280;
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    align-self: center;
    transition: background 0.15s;
  }
  .dim-clear-btn:hover { background: #f9fafb; }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 900px) {
    .kpi-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    .two-col, .three-col {
      grid-template-columns: 1fr;
    }
    .dim-row {
      grid-template-columns: 130px 1fr auto;
    }
  }
  @media (max-width: 600px) {
    .an-page {
      padding: 16px 16px 32px;
    }
    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
