<script>
  import { onMount } from 'svelte'
  import { api } from '../lib/api.js'
  import { formatMoney, formatDate, STATE_LABEL, STATE_COLOR, TYPE_LABEL, FORMAT_LABEL } from '../lib/utils.js'

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

  // Filter values
  let filterOpen    = true
  let searchText    = ''
  let dateFrom      = ''
  let dateTo        = ''
  let selectedStates = []
  let selectedTypes  = []
  let minBudget     = ''
  let maxBudget     = ''

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

  // Generic helper: aggregate invRows by a string dimension key
  function aggByDim(key) {
    const m = {}
    for (const r of invRows) {
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

  $: byVendor = aggByDim('owner').slice(0, 12)
  $: byFormat = aggByDim('format')
  $: byCity   = aggByDim('city').slice(0, 12)

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

    // ── Phase 1: campaign-level KPI stats + per-inventory dimension rows ────────
    // campaignStats returns two kinds of rows in the same array:
    //   • rows WITH  r.inventory  → per-screen stats (owner/format/city embedded)
    //   • rows WITHOUT r.inventory → campaign-level aggregates
    // We capture both in a single pass so no Phase 2 round-trip is needed.
    statsLoading = true
    const BATCH = 20
    const ids = allCampaigns.map(c => c.id)
    const pendingInvRows = []
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      try {
        const rows = await api.impressions.campaignStats(batch)
        if (!Array.isArray(rows)) continue
        const agg = {}
        for (const r of rows) {
          if (r.inventory) {
            // ── Per-inventory row ──────────────────────────────────────────
            const invId  = r.inventory?.id ?? null
            const owner  = r.displayOwnerDTO?.name
                        || r.displayOwner?.name
                        || r.inventory?.displayOwner?.name
                        || null
            const format = r.inventoryFormat
                        || r.inventory?.type
                        || null
            const city   = r.inventory?.city?.name
                        || r.city
                        || null
            const spent  = r.customerStats?.budgetShowed
                        ?? r.totalBudgetShowed
                        ?? r.totalShowedBudget
                        ?? 0
            const showed = r.totalCountShowed ?? r.totalShowed ?? 0
            const ots    = r.otsCountShowed   ?? r.totalOpOts  ?? r.totalOts ?? 0
            if (owner || format || city) {
              pendingInvRows.push({ invId, owner, format, city, spent, showed, ots })
            }
          } else {
            // ── Campaign-level aggregate row ───────────────────────────────
            const cid = r.campaign?.id
            if (!cid) continue
            agg[cid] = {
              totalShowed:       r.totalCountShowed  ?? r.totalShowed  ?? 0,
              totalOts:          r.otsCountShowed    ?? r.totalOpOts   ?? 0,
              totalBudgetShowed: r.totalBudgetShowed ?? r.customerStats?.budgetShowed ?? 0,
              cpm:               r.cpm ?? 0,
            }
          }
        }
        statsMap = { ...statsMap, ...agg }
        // Update dimension cards progressively as each batch arrives
        if (pendingInvRows.length) invRows = [...pendingInvRows]
      } catch {}
    }
    statsLoading = false
  })
</script>

<div class="an-page">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="an-header">
    <div>
      <h1 class="an-title">Аналитика</h1>
      <p class="an-sub">
        {#if loading}
          Загрузка…
        {:else}
          {totalCampaigns} кампаний
          {#if statsLoading}· <span class="sub-loading">Статистика загружается…</span>{/if}
        {/if}
      </p>
    </div>
    <div class="an-header-actions">
      <button class="btn-filter" on:click={() => filterOpen = !filterOpen}>
        {filterOpen ? 'Скрыть фильтры' : 'Фильтры'}
      </button>
      <a href="#/campaigns" class="btn-link">Все кампании →</a>
    </div>
  </div>

  {#if error}
    <div class="an-error">{error}</div>
  {:else if loading}
    <div class="an-spinner">
      <div class="spinner"></div>
      <span>Загрузка данных…</span>
    </div>
  {:else}

  <!-- ── Filter bar ─────────────────────────────────────────────────────── -->
  {#if filterOpen}
  <div class="filter-bar">
    <div class="filter-row">

      <!-- Search -->
      <div class="filter-group filter-group--wide">
        <label class="filter-label">Поиск</label>
        <input class="filter-input" type="text" placeholder="Название кампании…"
          bind:value={searchText} />
      </div>

      <!-- Date from -->
      <div class="filter-group">
        <label class="filter-label">Дата от</label>
        <input class="filter-input" type="date" bind:value={dateFrom} />
      </div>

      <!-- Date to -->
      <div class="filter-group">
        <label class="filter-label">Дата до</label>
        <input class="filter-input" type="date" bind:value={dateTo} />
      </div>

      <!-- Min budget -->
      <div class="filter-group">
        <label class="filter-label">Бюджет от, ₽</label>
        <input class="filter-input" type="number" placeholder="0" bind:value={minBudget} />
      </div>

      <!-- Max budget -->
      <div class="filter-group">
        <label class="filter-label">Бюджет до, ₽</label>
        <input class="filter-input" type="number" placeholder="∞" bind:value={maxBudget} />
      </div>
    </div>

    <div class="filter-row filter-row--dropdowns">

      <!-- Status multi-select -->
      <div class="filter-group filter-group--wide">
        <label class="filter-label">Статус</label>
        <div class="multi-check">
          {#each (stateOptions.length ? stateOptions : Object.keys(STATE_LABEL)) as s}
            <label class="mcheck-item">
              <input type="checkbox" checked={selectedStates.includes(s)}
                on:change={() => toggleState(s)} />
              <span class="mcheck-dot" style="background:{stateColor(s)}"></span>
              <span>{STATE_LABEL[s] ?? s}</span>
            </label>
          {/each}
        </div>
      </div>

      <!-- Type multi-select -->
      <div class="filter-group filter-group--wide">
        <label class="filter-label">Тип</label>
        <div class="multi-check">
          {#each (typeOptions.length ? typeOptions : Object.keys(TYPE_LABEL)) as t}
            <label class="mcheck-item">
              <input type="checkbox" checked={selectedTypes.includes(t)}
                on:change={() => toggleType(t)} />
              <span class="mcheck-dot" style="background:{TYPE_COLOR[t] ?? '#64748b'};border-radius:2px"></span>
              <span>{TYPE_LABEL[t] ?? t}</span>
            </label>
          {/each}
        </div>
      </div>

      <!-- Actions -->
      <div class="filter-actions">
        <span class="filter-chip">{totalCampaigns} кампаний</span>
        <button class="btn-reset" on:click={resetFilters}>Сбросить фильтры</button>
      </div>

    </div>
  </div>
  {/if}

  <!-- ── KPI cards ─────────────────────────────────────────────────────────── -->
  <div class="kpi-grid">

    <div class="kpi-card">
      <div class="kpi-label">Кампании</div>
      <div class="kpi-value">{totalCampaigns}</div>
      <div class="kpi-sub">{activeCnt} активных</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">Плановый бюджет</div>
      <div class="kpi-value kpi-money">{formatMoney(totalBudgetPlanned)}</div>
      <div class="kpi-sub">по выбранным</div>
    </div>

    <div class="kpi-card kpi-card--accent">
      <div class="kpi-label">Потрачено</div>
      <div class="kpi-value kpi-money">
        {#if statsLoading}<span class="kpi-loading">…</span>{:else}{formatMoney(totalBudgetSpent)}{/if}
      </div>
      <div class="kpi-sub">
        {#if !statsLoading && totalBudgetPlanned > 0}
          <span class="kpi-bar">
            <span class="kpi-bar-fill" style="width:{spendPct.toFixed(1)}%"></span>
          </span>
          {spendPct.toFixed(1)}% от плана
        {:else if !statsLoading}—{:else}загрузка…{/if}
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">Показы</div>
      <div class="kpi-value">
        {#if statsLoading}<span class="kpi-loading">…</span>{:else}{fmt(totalImpressions)}{/if}
      </div>
      <div class="kpi-sub">{#if !statsLoading}OTS: {fmt(totalOts)}{:else}загрузка…{/if}</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">Средний CPM</div>
      <div class="kpi-value kpi-money">
        {#if statsLoading}<span class="kpi-loading">…</span>{:else}{formatMoney(avgCpm)}{/if}
      </div>
      <div class="kpi-sub">взвешенный</div>
    </div>

  </div>

  <!-- ── Charts ─────────────────────────────────────────────────────────────── -->
  {#if byMonth.length > 0}
  <div class="two-col">

    <!-- Chart 1: Budget bars by month -->
    <div class="card">
      <div class="card-title">Бюджет по месяцам</div>
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
            <title>{mo.label} — Плановый: {formatMoney(mo.budget)}</title>
          </rect>

          <!-- Spent bar -->
          {#if !statsLoading}
          <rect
            x={x1} y={PAD.t + CHART_H - hSpent}
            width={bw} height={Math.max(1, hSpent)}
            fill="#3b82f6" rx="2"
          >
            <title>{mo.label} — Потрачено: {formatMoney(mo.spent)}</title>
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
        <span class="legend-swatch" style="background:#bfdbfe"></span> Плановый бюджет
        <span class="legend-swatch" style="background:#3b82f6;margin-left:12px"></span> Потрачено
      </div>
    </div>

    <!-- Chart 2: Impressions line -->
    <div class="card">
      <div class="card-title">Показы по месяцам</div>
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
        <span class="legend-swatch" style="background:#6366f1"></span> Показы
      </div>
    </div>

  </div>
  {/if}


  <!-- ── Breakdown by dimension ─────────────────────────────────────────── -->
  <div class="two-col">

    <!-- By type -->
    <div class="card">
      <div class="card-title">По типу</div>
      {#if byType.length === 0}
        <p class="empty-text">Нет данных</p>
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
      <div class="card-title">По статусу</div>
      {#if byStatus.length === 0}
        <p class="empty-text">Нет данных</p>
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

  <!-- ── Breakdown by vendor / format / city ───────────────────────────────── -->
  {#if !statsLoading || invRows.length > 0}
  <div class="three-col">

    <!-- By vendor -->
    <div class="card">
      <div class="card-title">По оператору</div>
      {#if statsLoading && byVendor.length === 0}
        <p class="empty-text">Статистика загружается…</p>
      {:else if byVendor.length === 0}
        <p class="empty-text">Нет данных</p>
      {:else}
        <div class="dim-list">
          {#each byVendor as v}
            <div class="dim-row">
              <div class="dim-label"><span class="dim-dot" style="background:#6366f1;border-radius:2px"></span><span title={v.label}>{v.label}</span></div>
              <div class="dim-bar-wrap"><div class="dim-bar-fill" style="width:{(v.spent/vendorMaxSpent*100).toFixed(1)}%;background:#6366f1"></div></div>
              <div class="dim-stats">
                <span class="dim-count">{v.screens} экр.</span>
                <span class="dim-spent">{formatMoney(v.spent)}</span>
                <span class="dim-budget dim-muted">{fmt(v.showed)} пок.</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- By format -->
    <div class="card">
      <div class="card-title">По формату</div>
      {#if statsLoading && byFormat.length === 0}
        <p class="empty-text">Статистика загружается…</p>
      {:else if byFormat.length === 0}
        <p class="empty-text">Нет данных</p>
      {:else}
        <div class="dim-list">
          {#each byFormat as f}
            {@const color = FORMAT_COLOR[f.label] ?? '#64748b'}
            <div class="dim-row">
              <div class="dim-label"><span class="dim-dot" style="background:{color};border-radius:2px"></span><span>{FORMAT_LABEL[f.label] ?? f.label}</span></div>
              <div class="dim-bar-wrap"><div class="dim-bar-fill" style="width:{(f.spent/formatMaxSpent*100).toFixed(1)}%;background:{color}"></div></div>
              <div class="dim-stats">
                <span class="dim-count">{f.screens} экр.</span>
                <span class="dim-spent">{formatMoney(f.spent)}</span>
                <span class="dim-budget dim-muted">{fmt(f.showed)} пок.</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- By city -->
    <div class="card">
      <div class="card-title">По городу</div>
      {#if statsLoading && byCity.length === 0}
        <p class="empty-text">Статистика загружается…</p>
      {:else if byCity.length === 0}
        <p class="empty-text">Нет данных</p>
      {:else}
        <div class="dim-list">
          {#each byCity as c}
            <div class="dim-row">
              <div class="dim-label"><span class="dim-dot" style="background:#0ea5e9;border-radius:2px"></span><span title={c.label}>{c.label}</span></div>
              <div class="dim-bar-wrap"><div class="dim-bar-fill" style="width:{(c.spent/cityMaxSpent*100).toFixed(1)}%;background:#0ea5e9"></div></div>
              <div class="dim-stats">
                <span class="dim-count">{c.screens} экр.</span>
                <span class="dim-spent">{formatMoney(c.spent)}</span>
                <span class="dim-budget dim-muted">{fmt(c.showed)} пок.</span>
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
