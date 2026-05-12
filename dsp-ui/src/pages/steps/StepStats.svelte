<script>
  import { onMount, createEventDispatcher } from 'svelte'
  import { api } from '../../lib/api.js'
  import { formatMoney } from '../../lib/utils.js'
  const dispatch = createEventDispatcher()

  export let draft

  let loading = true
  let error = ''

  // Campaign-level summary
  let summary = null   // { totalShowed, totalOts, totalBudgetShowed, cpm }

  // Per-inventory rows
  let inventoryRows = []

  onMount(async () => {
    const id = draft.id ?? draft.campaignId
    if (!id) { loading = false; return }
    try {
      const rows = await api.impressions.singleCampaignStats(id)
      if (!Array.isArray(rows)) { loading = false; return }

      // Separate summary vs per-inventory
      for (const r of rows) {
        if (!r.inventory) {
          // Campaign aggregate
          summary = {
            totalShowed:       r.totalCountShowed  ?? r.totalShowed  ?? 0,
            totalOts:          r.otsCountShowed    ?? r.totalOpOts   ?? 0,
            totalBudgetShowed: r.totalBudgetShowed ?? r.customerStats?.budgetShowed ?? 0,
            cpm:               r.cpm ?? 0,
          }
        } else {
          inventoryRows.push({
            id:      r.inventory.id,
            name:    r.inventory.name,
            showed:  r.totalShowed ?? 0,
            ots:     r.totalOts    ?? r.totalOpOts ?? 0,
            budget:  r.totalShowedBudget ?? r.customerStats?.budgetShowed ?? 0,
            cpm:     r.cpm ?? 0,
          })
        }
      }
      inventoryRows = inventoryRows // trigger reactivity

      // If no summary row from API, aggregate from per-inventory
      if (!summary && inventoryRows.length > 0) {
        summary = {
          totalShowed:       inventoryRows.reduce((s, r) => s + r.showed, 0),
          totalOts:          inventoryRows.reduce((s, r) => s + r.ots, 0),
          totalBudgetShowed: inventoryRows.reduce((s, r) => s + r.budget, 0),
          cpm: inventoryRows.length
            ? inventoryRows.reduce((s, r) => s + r.cpm, 0) / inventoryRows.length
            : 0,
        }
      }
    } catch (e) {
      error = 'Не удалось загрузить статистику'
      console.warn('Stats error', e)
    } finally {
      loading = false
    }
  })

  function fmt(n, dec = 0) {
    if (n == null || n === '') return '—'
    return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  }

  $: budgetPct = (summary && draft.budget > 0)
    ? Math.min(100, Math.round(summary.totalBudgetShowed / draft.budget * 100))
    : null
</script>

<div class="step-content">
  <h1 class="step-title">Статистика</h1>

  {#if loading}
    <div class="st-loading">
      <div class="spinner"></div>
      Загружаю статистику…
    </div>

  {:else if error}
    <div class="st-error">{error}</div>

  {:else if !summary}
    <div class="step-card">
      <p style="color:var(--text-muted);font-size:13px">Статистика пока недоступна — данные появятся после первых показов.</p>
    </div>

  {:else}
    <!-- ── Summary cards ───────────────────────────────────────────────── -->
    <div class="st-kpi-row">
      <div class="st-kpi">
        <span class="st-kpi-label">Выходы</span>
        <span class="st-kpi-val">{fmt(summary.totalShowed)}</span>
      </div>
      <div class="st-kpi">
        <span class="st-kpi-label">OTS</span>
        <span class="st-kpi-val">{fmt(summary.totalOts)}</span>
      </div>
      <div class="st-kpi">
        <span class="st-kpi-label">CPM, ₽</span>
        <span class="st-kpi-val">{fmt(summary.cpm, 2)}</span>
      </div>
      <div class="st-kpi">
        <span class="st-kpi-label">Потрачено</span>
        <span class="st-kpi-val">{formatMoney(summary.totalBudgetShowed)}</span>
        {#if budgetPct != null}
          <div class="st-kpi-bar-track">
            <div class="st-kpi-bar-fill" style="width:{budgetPct}%"></div>
          </div>
          <span class="st-kpi-pct">{budgetPct}% от бюджета</span>
        {/if}
      </div>
      {#if draft.budget > 0}
        <div class="st-kpi">
          <span class="st-kpi-label">Остаток бюджета</span>
          <span class="st-kpi-val">{formatMoney(Math.max(0, draft.budget - summary.totalBudgetShowed))}</span>
        </div>
      {/if}
    </div>

    <!-- ── Per-inventory breakdown ─────────────────────────────────────── -->
    {#if inventoryRows.length > 0}
      <div class="step-card" style="padding:0;overflow:hidden">
        <div style="padding:16px 20px 12px;font-size:14px;font-weight:600;color:var(--text)">
          По экранам
          <span style="font-weight:400;font-size:12px;color:var(--text-muted);margin-left:6px">{inventoryRows.length} экр.</span>
        </div>
        <div class="st-table-wrap">
          <table class="st-table">
            <thead>
              <tr>
                <th>Экран</th>
                <th class="num">Выходы</th>
                <th class="num">OTS</th>
                <th class="num">CPM, ₽</th>
                <th class="num">Потрачено</th>
              </tr>
            </thead>
            <tbody>
              {#each inventoryRows as r (r.id)}
                <tr>
                  <td>
                    <span class="st-inv-name">{r.name}</span>
                    <span class="st-inv-id">ID {r.id}</span>
                  </td>
                  <td class="num">{fmt(r.showed)}</td>
                  <td class="num">{fmt(r.ots)}</td>
                  <td class="num">{fmt(r.cpm, 2)}</td>
                  <td class="num">{formatMoney(r.budget)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}

  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
  </div>
</div>

<style>
  .st-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 32px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .st-error {
    padding: 20px;
    color: #ef4444;
    font-size: 13px;
  }

  /* KPI row */
  .st-kpi-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
  }
  .st-kpi {
    flex: 1;
    min-width: 140px;
    background: var(--card-bg, #fff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 12px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .st-kpi-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #9ca3af);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .st-kpi-val {
    font-size: 22px;
    font-weight: 700;
    color: var(--text, #111827);
    letter-spacing: -0.02em;
  }
  .st-kpi-bar-track {
    height: 4px;
    border-radius: 2px;
    background: var(--border, #e5e7eb);
    margin-top: 4px;
    overflow: hidden;
  }
  .st-kpi-bar-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--accent, #6366f1);
    transition: width 0.4s ease;
  }
  .st-kpi-pct {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    margin-top: 2px;
  }

  /* Table */
  .st-table-wrap {
    overflow-x: auto;
  }
  .st-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .st-table th {
    padding: 8px 20px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #9ca3af);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--border, #e5e7eb);
    background: var(--bg-muted, #f9fafb);
  }
  .st-table th.num { text-align: right; }
  .st-table td {
    padding: 10px 20px;
    border-bottom: 1px solid var(--border, #f3f4f6);
    color: var(--text, #111827);
    vertical-align: middle;
  }
  .st-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .st-table tr:last-child td { border-bottom: none; }
  .st-table tr:hover td { background: var(--bg-muted, #f9fafb); }

  .st-inv-name {
    display: block;
    font-weight: 500;
  }
  .st-inv-id {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
  }
</style>
