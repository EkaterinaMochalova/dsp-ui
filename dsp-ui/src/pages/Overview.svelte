<script>
  import { onMount } from 'svelte'
  import { api } from '../lib/api.js'
  import { formatMoney, STATE_LABEL, STATE_COLOR, TYPE_LABEL } from '../lib/utils.js'
  import { t as tr } from '../lib/i18n.js'

  let loading    = true
  let error      = ''
  let statsLoading = false

  let allCampaigns = []
  let statsMap     = {}   // campaignId → { totalShowed, totalOts, totalBudgetShowed }

  // ── Derived totals ────────────────────────────────────────────────────────
  $: total          = allCampaigns.length
  $: activeCnt      = allCampaigns.filter(c => ['ACTIVE','ACTIVATED'].includes(c.state)).length
  $: runningCnt     = allCampaigns.filter(c => ['ACTIVE','ACTIVATED','PAUSED','STOPPED'].includes(c.state)).length
  $: totalPlanned   = allCampaigns.reduce((s, c) => s + (c.budget ?? 0), 0)
  $: totalSpent     = Object.values(statsMap).reduce((s, v) => s + (v.totalBudgetShowed ?? 0), 0)
  $: totalShowed    = Object.values(statsMap).reduce((s, v) => s + (v.totalShowed ?? 0), 0)
  $: totalOts       = Object.values(statsMap).reduce((s, v) => s + (v.totalOts ?? 0), 0)
  $: spentPct       = totalPlanned > 0 ? Math.min(100, (totalSpent / totalPlanned) * 100) : 0

  // ── By status ─────────────────────────────────────────────────────────────
  $: byStatus = (() => {
    const m = {}
    for (const c of allCampaigns) {
      m[c.state] = (m[c.state] ?? 0) + 1
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([state, count]) => ({
        state, count,
        label: STATE_LABEL[state] ?? state,
        color: COLOR_MAP[STATE_COLOR[state] ?? 'gray'],
      }))
  })()

  // ── By type ───────────────────────────────────────────────────────────────
  $: byType = (() => {
    const m = {}
    const budget = {}
    for (const c of allCampaigns) {
      const t = c.type ?? 'UNKNOWN'
      m[t] = (m[t] ?? 0) + 1
      budget[t] = (budget[t] ?? 0) + (c.budget ?? 0)
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type, count,
        label: TYPE_LABEL[type] ?? type,
        budget: budget[type] ?? 0,
        color: TYPE_COLOR[type] ?? '#64748b',
      }))
  })()

  // ── By month (last 12) ────────────────────────────────────────────────────
  $: byMonth = (() => {
    const m = {}
    for (const c of allCampaigns) {
      const d = c.startDate ? new Date(c.startDate) : null
      if (!d || isNaN(d)) continue
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      if (!m[key]) m[key] = {
        key,
        label: d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
        count: 0,
        budget: 0,
        spent: 0,
      }
      m[key].count++
      m[key].budget += c.budget ?? 0
    }
    const sorted = Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
    // attach spent from statsMap
    for (const c of allCampaigns) {
      if (!c.startDate) continue
      const d = new Date(c.startDate)
      if (isNaN(d)) continue
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const mo = sorted.find(x => x.key === key)
      if (mo) mo.spent += statsMap[c.id]?.totalBudgetShowed ?? 0
    }
    return sorted
  })()

  $: monthMaxBudget = Math.max(1, ...byMonth.map(m => m.budget))

  // ── Top campaigns by spend ────────────────────────────────────────────────
  $: topBySpent = allCampaigns
    .map(c => ({ ...c, spent: statsMap[c.id]?.totalBudgetShowed ?? 0, showed: statsMap[c.id]?.totalShowed ?? 0 }))
    .filter(c => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8)

  $: topMaxSpent = Math.max(1, ...topBySpent.map(c => c.spent))

  // ── Helpers ───────────────────────────────────────────────────────────────
  const COLOR_MAP = {
    green: '#16a34a', blue: '#3b82f6', yellow: '#f59e0b',
    orange: '#f97316', red: '#ef4444', gray: '#9ca3af', purple: '#8b5cf6',
  }
  const TYPE_COLOR = {
    RTB: '#3b82f6', GUARANTEED: '#10b981', FLEX_GUARANTEED: '#8b5cf6', OPEN_RTB: '#f59e0b',
  }

  function fmt(n, decimals = 0) {
    if (n == null || n === 0) return '0'
    if (n >= 1_000_000) return (n/1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + 'M'
    if (n >= 1_000)     return (n/1_000).toLocaleString('ru-RU', { maximumFractionDigits: decimals > 0 ? decimals : 1 }) + 'K'
    return n.toLocaleString('ru-RU', { maximumFractionDigits: decimals })
  }

  function stateColor(state) {
    return COLOR_MAP[STATE_COLOR[state] ?? 'gray'] ?? '#9ca3af'
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  onMount(async () => {
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

    // Batch-load stats in chunks of 20
    if (allCampaigns.length === 0) return
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
            // Campaign-level summary — use directly
            agg[cid] = {
              totalShowed:       r.totalCountShowed  ?? r.totalShowed  ?? 0,
              totalOts:          r.otsCountShowed    ?? r.totalOpOts   ?? 0,
              totalBudgetShowed: r.totalBudgetShowed ?? r.customerStats?.budgetShowed ?? 0,
            }
          } else if (!agg[cid]) {
            agg[cid] = {
              totalShowed:       r.totalShowed       ?? r.totalCountShowed ?? 0,
              totalOts:          r.totalOpOts        ?? r.totalOts ?? 0,
              totalBudgetShowed: r.totalShowedBudget ?? r.customerStats?.budgetShowed ?? 0,
            }
          } else {
            agg[cid].totalShowed       += r.totalShowed       ?? r.totalCountShowed ?? 0
            agg[cid].totalOts          += r.totalOpOts        ?? r.totalOts ?? 0
            agg[cid].totalBudgetShowed += r.totalShowedBudget ?? r.customerStats?.budgetShowed ?? 0
          }
        }
        statsMap = { ...statsMap, ...agg }
      } catch {}
    }
    statsLoading = false
  })
</script>

<div class="ov-page">

  <!-- Header -->
  <div class="ov-header">
    <div>
      <h1 class="ov-title">{$tr('ov_title')}</h1>
      <p class="ov-sub">{#if loading}{$tr('loading')}{:else}{total} {$tr('an_campaigns')} · {#if statsLoading}<span class="ov-sub-loading">{$tr('ov_stats_loading')}</span>{:else}{$tr('ov_stats_ready')}{/if}{/if}</p>
    </div>
    <a href="#/campaigns" class="ov-all-link">{$tr('an_all_campaigns')}</a>
  </div>

  {#if error}
    <div class="ov-error">{error}</div>
  {:else if loading}
    <div class="ov-spinner">
      <div class="spinner"></div>
      <span>{$tr('loading')}</span>
    </div>
  {:else}

  <!-- KPI cards -->
  <div class="ov-kpis">
    <div class="kpi-card">
      <div class="kpi-label">{$tr('ov_total')}</div>
      <div class="kpi-value">{total}</div>
      <div class="kpi-sub">{activeCnt} {$tr('an_kpi_active')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">{$tr('ov_running')}</div>
      <div class="kpi-value">{runningCnt}</div>
      <div class="kpi-sub">{$tr('ov_running_sub')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">{$tr('an_kpi_planned')}</div>
      <div class="kpi-value kpi-money">{formatMoney(totalPlanned)}</div>
      <div class="kpi-sub">{$tr('ov_planned_sub')}</div>
    </div>
    <div class="kpi-card kpi-card--accent">
      <div class="kpi-label">{$tr('an_kpi_spent')}</div>
      <div class="kpi-value kpi-money">{#if statsLoading}<span class="kpi-loading">…</span>{:else}{formatMoney(totalSpent)}{/if}</div>
      <div class="kpi-sub">
        {#if !statsLoading && totalPlanned > 0}
          <span class="kpi-pct-bar">
            <span class="kpi-pct-fill" style="width:{spentPct.toFixed(1)}%"></span>
          </span>
          {spentPct.toFixed(1)}% {$tr('an_kpi_from_plan')}
        {:else if !statsLoading}—{:else}{$tr('loading')}{/if}
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">{$tr('ov_impressions_fact')}</div>
      <div class="kpi-value">{#if statsLoading}<span class="kpi-loading">…</span>{:else}{fmt(totalShowed)}{/if}</div>
      <div class="kpi-sub">{#if !statsLoading}OTS {fmt(totalOts)}{:else}{$tr('loading')}{/if}</div>
    </div>
  </div>

  <!-- Row 2: Status + Type -->
  <div class="ov-row2">

    <!-- By status -->
    <div class="ov-card">
      <div class="ov-card-title">{$tr('an_by_status')}</div>
      <div class="bar-list">
        {#each byStatus as s}
          <div class="bar-row">
            <div class="bar-label">
              <span class="bar-dot" style="background:{s.color}"></span>
              {s.label}
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:{(s.count/total*100).toFixed(1)}%;background:{s.color}"></div>
            </div>
            <div class="bar-count">{s.count}</div>
          </div>
        {/each}
      </div>
    </div>

    <!-- By type -->
    <div class="ov-card">
      <div class="ov-card-title">{$tr('an_by_type')}</div>
      <div class="type-grid">
        {#each byType as t}
          <div class="type-item">
            <div class="type-header">
              <span class="type-dot" style="background:{t.color}"></span>
              <span class="type-label">{t.label}</span>
              <span class="type-count">{t.count}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:{(t.count/total*100).toFixed(1)}%;background:{t.color}"></div>
            </div>
            <div class="type-budget">{formatMoney(t.budget)}</div>
          </div>
        {/each}
      </div>
    </div>

  </div>

  <!-- Row 3: Monthly timeline -->
  {#if byMonth.length > 1}
  <div class="ov-card ov-card--full">
    <div class="ov-card-title">{$tr('ov_by_month')}</div>
    <div class="month-chart">
      {#each byMonth as mo}
        <div class="month-col">
          <div class="month-bars">
            <div class="month-bar month-bar--plan"
              style="height:{(mo.budget/monthMaxBudget*100).toFixed(1)}%"
              title="{$tr('an_chart_planned')}: {formatMoney(mo.budget)}">
            </div>
            {#if !statsLoading && mo.spent > 0}
            <div class="month-bar month-bar--spent"
              style="height:{(mo.spent/monthMaxBudget*100).toFixed(1)}%"
              title="{$tr('an_chart_spent')}: {formatMoney(mo.spent)}">
            </div>
            {/if}
          </div>
          <div class="month-label">{mo.label}</div>
          <div class="month-count">{mo.count}</div>
        </div>
      {/each}
    </div>
    <div class="month-legend">
      <span class="legend-dot" style="background:#bfdbfe"></span> {$tr('an_chart_planned')}
      <span class="legend-dot" style="background:#3b82f6;margin-left:12px"></span> {$tr('an_chart_spent')}
    </div>
  </div>
  {/if}

  <!-- Row 4: Top campaigns by spend -->
  {#if !statsLoading && topBySpent.length > 0}
  <div class="ov-card ov-card--full">
    <div class="ov-card-title">{$tr('ov_top_title')}</div>
    <div class="top-list">
      {#each topBySpent as c, i}
        <div class="top-row">
          <div class="top-rank">#{i+1}</div>
          <div class="top-name">
            <a href="#/campaigns/{c.id}" class="top-name-link">{c.name}</a>
            <div class="top-meta">
              <span class="top-badge" style="color:{stateColor(c.state)}">{STATE_LABEL[c.state] ?? c.state}</span>
              <span class="top-type">{TYPE_LABEL[c.type] ?? c.type}</span>
            </div>
          </div>
          <div class="top-bar-wrap">
            <div class="top-bar-fill" style="width:{(c.spent/topMaxSpent*100).toFixed(1)}%"></div>
          </div>
          <div class="top-spent">{formatMoney(c.spent)}</div>
          <div class="top-shows">{fmt(c.showed)} {$tr('ov_shows')}</div>
        </div>
      {/each}
    </div>
  </div>
  {/if}

  {/if}
</div>

<style>
  .ov-page {
    padding: 28px 32px 48px;
    min-height: 100%;
    box-sizing: border-box;
  }

  /* Header */
  .ov-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .ov-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--text, #111827);
    margin: 0 0 4px;
  }
  .ov-sub {
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    margin: 0;
  }
  .ov-sub-loading { color: #f59e0b; }
  .ov-all-link {
    font-size: 13px;
    color: #3b82f6;
    text-decoration: none;
    padding: 6px 12px;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    transition: background 0.15s;
  }
  .ov-all-link:hover { background: #eff6ff; }
  .ov-error {
    padding: 20px;
    color: #dc2626;
    background: #fef2f2;
    border-radius: 8px;
    font-size: 13px;
  }
  .ov-spinner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 48px 0;
    color: var(--text-muted, #6b7280);
    font-size: 13px;
  }
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* KPI cards */
  .ov-kpis {
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
  .kpi-money { font-size: 18px; }
  .kpi-loading { color: #9ca3af; font-size: 20px; }
  .kpi-sub {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .kpi-pct-bar {
    display: inline-block;
    width: 48px;
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .kpi-pct-fill {
    display: block;
    height: 100%;
    background: #3b82f6;
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  /* Cards */
  .ov-row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
  }
  .ov-card {
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    padding: 18px 20px;
  }
  .ov-card--full { margin-bottom: 14px; }
  .ov-card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text, #374151);
    margin-bottom: 16px;
  }

  /* Bar list */
  .bar-list { display: flex; flex-direction: column; gap: 10px; }
  .bar-row {
    display: grid;
    grid-template-columns: 160px 1fr 32px;
    align-items: center;
    gap: 8px;
  }
  .bar-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text, #374151);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .bar-track {
    height: 6px;
    background: #f3f4f6;
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
    min-width: 2px;
  }
  .bar-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, #6b7280);
    text-align: right;
  }

  /* Type grid */
  .type-grid { display: flex; flex-direction: column; gap: 14px; }
  .type-item {}
  .type-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
  }
  .type-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
  .type-label { font-size: 12px; color: var(--text, #374151); flex: 1; font-weight: 500; }
  .type-count { font-size: 12px; font-weight: 700; color: var(--text, #374151); }
  .type-budget { font-size: 11px; color: var(--text-muted, #9ca3af); margin-top: 3px; }

  /* Monthly chart */
  .month-chart {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 120px;
    padding-bottom: 28px;
    position: relative;
  }
  .month-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    position: relative;
  }
  .month-bars {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    position: relative;
  }
  .month-bar {
    border-radius: 3px 3px 0 0;
    min-height: 2px;
    transition: height 0.4s ease;
  }
  .month-bar--plan  { width: 45%; background: #bfdbfe; }
  .month-bar--spent { width: 45%; background: #3b82f6; }
  .month-label {
    position: absolute;
    bottom: 0;
    font-size: 10px;
    color: var(--text-muted, #9ca3af);
    white-space: nowrap;
    transform: rotate(-30deg) translateX(-4px);
    transform-origin: center top;
  }
  .month-count {
    display: none; /* shown as tooltip via title */
  }
  .month-legend {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    margin-top: 8px;
  }
  .legend-dot {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 2px;
  }

  /* Top campaigns */
  .top-list { display: flex; flex-direction: column; gap: 10px; }
  .top-row {
    display: grid;
    grid-template-columns: 28px 220px 1fr 160px 100px;
    align-items: center;
    gap: 10px;
  }
  .top-rank {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted, #9ca3af);
    text-align: center;
  }
  .top-name { min-width: 0; }
  .top-name-link {
    font-size: 13px;
    font-weight: 500;
    color: var(--text, #111827);
    text-decoration: none;
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .top-name-link:hover { color: #3b82f6; text-decoration: underline; }
  .top-meta { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .top-badge { font-size: 11px; font-weight: 600; }
  .top-type { font-size: 11px; color: var(--text-muted, #9ca3af); }
  .top-bar-wrap {
    height: 6px;
    background: #f3f4f6;
    border-radius: 3px;
    overflow: hidden;
  }
  .top-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #bfdbfe, #3b82f6);
    border-radius: 3px;
    transition: width 0.5s ease;
  }
  .top-spent {
    font-size: 13px;
    font-weight: 600;
    color: var(--text, #111827);
    text-align: right;
    white-space: nowrap;
  }
  .top-shows {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    text-align: right;
    white-space: nowrap;
  }

  @media (max-width: 1024px) {
    .ov-kpis { grid-template-columns: repeat(3, 1fr); }
    .ov-row2 { grid-template-columns: 1fr; }
    .top-row { grid-template-columns: 28px 1fr 100px; }
    .top-bar-wrap, .top-shows { display: none; }
  }
</style>
