<script>
  import { onMount } from 'svelte'
  import { api } from '../lib/api.js'
  import { formatDate, formatMoney, STATE_LABEL, STATE_COLOR, TYPE_LABEL, FORMAT_LABEL } from '../lib/utils.js'
  import StatusBadge from '../components/StatusBadge.svelte'
  import Pagination from '../components/Pagination.svelte'

  // ── Resizable columns ─────────────────────────────────────────────────────
  // Статус | Кампания | Город | Формат | Начало | Конец | Бюджет | Бюджет/день | OTS | Выходы | Menu
  const _CW_KEY = 'dsp_camp_col_w'
  const _CW_DEF = [100, 220, 130, 120, 95, 95, 120, 105, 75, 85, 36]
  let colW = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(_CW_KEY))
      if (Array.isArray(s) && s.length === _CW_DEF.length) return s
    } catch {}
    return [..._CW_DEF]
  })()
  function rzStart(idx, e) {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = colW[idx]
    const onMove = ev => { colW = colW.map((v, i) => i === idx ? Math.max(40, w0 + ev.clientX - x0) : v) }
    const onUp   = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      try { localStorage.setItem(_CW_KEY, JSON.stringify(colW)) } catch {}
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Filters
  let filterType = ''
  let filterState = ''
  let filterSearch = ''
  let filterDateFrom = ''
  let filterDateTo = ''
  let filterBudgetMin = ''
  let filterBudgetMax = ''
  let filterCity = ''
  let filterFormat = ''
  let searchTimeout

  // Sort
  let sortBy = 'startDate'
  let sortDir = 'desc'

  // Tabs
  let activeTab = 'all'

  // Data
  let campaigns = []
  let totalElements = 0
  let totalPages = 0
  let currentPage = 0
  const PAGE_SIZE = 25

  let loading = true
  let error = ''
  let allStates = []
  let allTypes = []

  // Which groups are expanded (by index of first item)
  let expanded = {}

  // Group chips open state
  let openChip = null

  // Stats keyed by campaign ID: { totalShowed, totalOts, totalBudgetShowed, cpm }
  let statsMap = {}

  // Today's stats keyed by campaign ID: { spend, ots, showed }
  // Used as a real-time fallback when all-time statsMap hasn't populated yet
  // (all-time aggregate stats have a processing delay; today's data is real-time)
  let todayMap = {}   // still kept as shorthand for spend only (for backward compat)
  let todayStatsMap = {} // full today stats: { spend, ots, showed }

  // Cities keyed by campaign ID: string[]
  let citiesMap = {}
  // Formats keyed by campaign ID: string[]
  let formatsMap = {}

  onMount(async () => {
    try {
      ;[allStates, allTypes] = await Promise.all([
        api.filters.states(),
        api.filters.types(),
      ])
    } catch {}
    await load()
  })

  async function load(page = 0) {
    loading = true
    error = ''
    currentPage = page
    try {
      const params = {
        page,
        size: PAGE_SIZE,
        sort: sortBy + ',' + sortDir,
        ...(filterType      ? { type: filterType }            : {}),
        ...(filterState     ? { state: filterState }          : {}),
        ...(filterSearch    ? { name: filterSearch }           : {}),
        ...(filterDateFrom  ? { startDate: filterDateFrom }   : {}),
        ...(filterDateTo    ? { endDate: filterDateTo }       : {}),
        // Budget filter is applied client-side (backend ignores these params)
      }
      const data = await api.campaigns.list(params)
      let rows = data.content ?? []

      // Client-side sort fallback in case the API ignores the sort param
      if (rows.length > 0) {
        const dir = sortDir === 'asc' ? 1 : -1
        rows = [...rows].sort((a, b) => {
          const av = a[sortBy] ?? ''
          const bv = b[sortBy] ?? ''
          if (av < bv) return -1 * dir
          if (av > bv) return  1 * dir
          return 0
        })
      }
      campaigns = rows
      totalElements = data.totalElements ?? 0
      totalPages = data.totalPages ?? 0

      // Extract cities + formats inline from the list response.
      // The list API typically omits segments, so inlineCityMap will be empty
      // and loadCities will fetch individually.  If segments are present the
      // column populates immediately without extra requests.
      const inlineCityMap = {}
      const inlineFmtMap  = {}
      for (const camp of rows) {
        const invs = (camp.segments ?? []).flatMap(s => s.inventories ?? [])
        const cities = [...new Set(invs.map(i => i.city?.name).filter(Boolean))]
        const fmts   = [...new Set(invs.map(i => i.format).filter(Boolean))]
        if (cities.length > 0) inlineCityMap[camp.id] = cities
        if (fmts.length   > 0) inlineFmtMap[camp.id]  = fmts
      }
      citiesMap  = inlineCityMap
      formatsMap = inlineFmtMap

      if (campaigns.length > 0) {
        const ids = campaigns.map(c => c.id)
        loadStats(ids)
        loadTodayStats(ids)
        // Only fetch individually for campaigns that didn't get data inline
        const missing = ids.filter(id => !inlineCityMap[id])
        if (missing.length > 0) loadCities(missing)
      }
    } catch (e) {
      error = 'Не удалось загрузить кампании'
    } finally {
      loading = false
    }
  }

  async function loadStats(ids) {
    try {
      const rows = await api.impressions.campaignStats(ids)
      if (!Array.isArray(rows)) return

      // Build map: campaignId → aggregated totals
      // The endpoint returns per-inventory rows; aggregate per campaign.
      // Rows without an inventory field are campaign-level summaries — prefer those.
      const agg = {}
      for (const r of rows) {
        const cid = r.campaign?.id
        if (!cid) continue

        if (!r.inventory) {
          // Campaign-level summary row — use directly, highest priority
          agg[cid] = {
            totalShowed:       r.totalCountShowed  ?? r.totalShowed  ?? 0,
            totalOts:          r.otsCountShowed    ?? r.totalOpOts   ?? 0,
            totalBudgetShowed: r.totalBudgetShowed ?? r.customerStats?.budgetShowed ?? 0,
            cpm:               r.cpm ?? 0,
            _fromSummary:      true,
          }
        } else if (!agg[cid]?._fromSummary) {
          // Per-inventory row — accumulate
          if (!agg[cid]) agg[cid] = { totalShowed: 0, totalOts: 0, totalBudgetShowed: 0, cpm: 0, _count: 0 }
          agg[cid].totalShowed       += r.totalShowed       ?? r.totalCountShowed ?? 0
          agg[cid].totalOts          += r.totalOts          ?? r.totalOpOts       ?? 0
          agg[cid].totalBudgetShowed += r.totalShowedBudget ?? r.customerStats?.budgetShowed ?? 0
          agg[cid]._count            = (agg[cid]._count ?? 0) + 1
          // CPM: weighted average
          agg[cid].cpm = agg[cid]._count > 0
            ? (agg[cid].cpm * (agg[cid]._count - 1) + (r.cpm ?? 0)) / agg[cid]._count
            : (r.cpm ?? 0)
        }
      }
      statsMap = agg
    } catch {
      // Stats are non-critical — silently ignore errors
    }
  }

  async function loadTodayStats(ids) {
    try {
      const todayStr = new Date().toISOString().slice(0, 10)
      const startDate = new Date(todayStr + 'T00:00:00').getTime()
      const endDate   = new Date(todayStr + 'T23:59:59').getTime()
      const rows = await api.impressions.campaignStats(ids, 'CUSTOMER_CHARGE_EXCLUDED', { startDate, endDate })
      if (!Array.isArray(rows)) return
      const aggSpend = {}
      const aggFull  = {}
      for (const r of rows) {
        const cid = r.campaign?.id
        if (!cid) continue
        const spend  = r.totalBudgetShowed ?? r.customerStats?.budgetShowed ?? 0
        const ots    = r.otsCountShowed    ?? r.totalOpOts    ?? 0
        const showed = r.totalCountShowed  ?? r.totalShowed   ?? 0
        if (!r.inventory) {
          // Campaign-level summary row
          aggSpend[cid] = spend
          aggFull[cid]  = { spend, ots, showed }
        } else {
          // Per-inventory row — accumulate
          aggSpend[cid] = (aggSpend[cid] ?? 0) + spend
          if (!aggFull[cid]) aggFull[cid] = { spend: 0, ots: 0, showed: 0 }
          aggFull[cid].spend  += spend
          aggFull[cid].ots    += ots
          aggFull[cid].showed += showed
        }
      }
      todayMap      = aggSpend
      todayStatsMap = aggFull
    } catch {
      // non-critical — leave maps empty
    }
  }

  async function loadCities(ids) {
    try {
      // Fetch full campaign details for campaigns whose data wasn't in the list payload.
      // Populates both citiesMap and formatsMap from the same requests.
      const results = await Promise.all(ids.map(id => api.campaigns.get(id).catch(e => { console.warn('[loadCities] get', id, e); return null })))
      const cMap = { ...citiesMap }
      const fMap = { ...formatsMap }
      for (const camp of results) {
        if (!camp) continue
        const invs  = (camp.segments ?? []).flatMap(s => s.inventories ?? [])
        cMap[camp.id] = [...new Set(invs.map(i => i.city?.name).filter(Boolean))]
        fMap[camp.id] = [...new Set(invs.map(i => i.format).filter(Boolean))]
      }
      citiesMap  = cMap
      formatsMap = fMap
    } catch (e) {
      console.warn('[loadCities]', e)
    }
  }

  function setSort(field) {
    if (field === sortBy) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy = field
      sortDir = 'desc'
    }
    load(0)
  }

  function onSearchInput() {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => load(0), 400)
  }

  function onPageChange(e) { load(e.detail) }

  function clearFilter(key) {
    if (key === 'type')      { filterType = '' }
    if (key === 'state')     { filterState = '' }
    if (key === 'search')    { filterSearch = '' }
    if (key === 'date')      { filterDateFrom = ''; filterDateTo = '' }
    if (key === 'budget')    { filterBudgetMin = ''; filterBudgetMax = '' }
    // city/format are pure client-side — no API reload needed
    if (key === 'city')      { filterCity = '' }
    if (key === 'inv-format') { filterFormat = '' }
    openChip = null
    if (key !== 'city' && key !== 'inv-format') load(0)
  }

  function applyFilter(key, val) {
    if (key === 'type')  filterType = val
    if (key === 'state') filterState = val
    openChip = null
    load(0)
  }

  function applyDateFilter() {
    openChip = null
    load(0)
  }

  function applyBudgetFilter() {
    openChip = null
    load(0)
  }

  function toggleChip(name) {
    openChip = openChip === name ? null : name
  }

  function openCampaign(id) {
    window.location.hash = '#/campaigns/' + id
  }

  async function duplicateCampaign(id) {
    try {
      // Backend has no /copy endpoint — implement client-side:
      // 1. Fetch full campaign  2. Build create payload  3. POST new campaign
      const camp = await api.campaigns.get(id)

      // Strip dmpData:[] to avoid RTB bid failures (code 1000)
      let targetAudience = null
      if (camp.targetAudience) {
        const { dmpData, ...rest } = camp.targetAudience
        targetAudience = (dmpData?.length > 0) ? { ...rest, dmpData } : rest
      }

      // API requires "YYYY-MM-DDTHH:mm:ss" format
      const toApiDate = d => !d ? null : (d.includes('T') ? d : d + 'T00:00:00')

      const budgetBuyer = camp.budgetBuyer ?? camp.budget ?? 0
      const additionalCharge = camp.additionalCharge ?? 0
      const budget = Math.round(budgetBuyer * (1 + additionalCharge / 100) * 100) / 100

      const payload = {
        name:             'Копия: ' + (camp.name ?? ''),
        description:      camp.description ?? '',
        brandId:          camp.brand?.id      ?? camp.brandId      ?? null,
        customerId:       camp.customer?.id   ?? camp.customerId   ?? null,
        type:             camp.type,
        bidType:          camp.bidType,
        startDate:        toApiDate(camp.startDate),
        endDate:          toApiDate(camp.endDate),
        budget,
        budgetBuyer,
        dailyBudget:      camp.dailyBudget       ?? null,
        dailyBudgetBuyer: camp.dailyBudgetBuyer  ?? null,
        hourlyBudget:     camp.hourlyBudget      ?? null,
        hourlyBudgetBuyer:camp.hourlyBudgetBuyer ?? null,
        additionalCharge,
        maxImpressionsCount:       camp.maxImpressionsCount      ?? 0,
        maxDailyImpressionsCount:  camp.maxDailyImpressionsCount ?? 0,
        maxHourlyImpressionsCount: camp.maxHourlyImpressionsCount?? 0,
        ots:              camp.ots              ?? null,
        dailyOts:         camp.dailyOts         ?? null,
        hourlyOts:        camp.hourlyOts         ?? null,
        targetAudience,
        photoReportSettings: camp.photoReportSettings ?? null,
        strategy:            camp.strategy            ?? 'STANDARD',
        strategyLimitType:   camp.strategyLimitType   ?? null,
        // Copy segments using the exact shape CampaignCreate sends
        segments: (camp.segments ?? []).map(seg => ({
          displayOwnerId: seg.displayOwner?.id ?? seg.displayOwnerId ?? null,
          inventories: (seg.inventories ?? []).map(inv => ({
            id:           inv.id,
            timeSettings: inv.timeSettings ?? [],
            priority:     inv.priority     ?? 1,
            bid:          inv.bid          ?? 0,
          })),
          mediaSegments: [],
          photoReportSettings: camp.photoReportSettings ?? {
            saveAll: false, countPerDisplay: 5, saveMode: 'BY_CAMPAIGN', explicitlySetPhoto: false,
          },
        })),
      }

      const created = await api.campaigns.create(payload)
      if (created?.id) {
        window.location.hash = '#/campaigns/' + created.id
      } else {
        await load(currentPage)
      }
    } catch (e) {
      console.error('[duplicateCampaign] full error:', JSON.stringify(e?.data ?? e))
      const fields = e?.data?.errors?.field ?? e?.data?.fieldErrors ?? []
      const detail = fields.length
        ? fields.map(f => `${f.field ?? f.property}: ${f.message ?? f.defaultMessage}`).join('\n')
        : (e?.data?.message ?? e?.message ?? JSON.stringify(e?.data ?? e))
      alert('Ошибка при дублировании:\n' + detail)
    }
  }

  // citiesMap/formatsMap passed explicitly so Svelte tracks the dependency
  function formatCities(c, map) {
    const names = map[c.id] ?? []
    if (!names.length) return '—'
    if (names.length <= 2) return names.join(', ')
    return names.slice(0, 2).join(', ') + `, +${names.length - 2}`
  }

  function formatFormats(c, map) {
    const codes = map[c.id] ?? []
    if (!codes.length) return '—'
    const labels = [...new Set(codes.map(f => FORMAT_LABEL[f] ?? f))]
    if (labels.length <= 2) return labels.join(', ')
    return labels.slice(0, 2).join(', ') + `, +${labels.length - 2}`
  }

  // Client-side filters (budget, city, inventory format — backend ignores these params)
  $: visibleCampaigns = (() => {
    // reference maps so Svelte re-runs this when they update
    const _cmap = citiesMap
    const _fmap = formatsMap
    return campaigns.filter(c => {
      const b = c.budget ?? 0
      if (filterBudgetMin !== '' && filterBudgetMin != null && b < Number(filterBudgetMin)) return false
      if (filterBudgetMax !== '' && filterBudgetMax != null && b > Number(filterBudgetMax)) return false
      if (filterCity) {
        const cities = _cmap[c.id] ?? []
        if (!cities.some(city => city.toLowerCase().includes(filterCity.toLowerCase()))) return false
      }
      if (filterFormat) {
        const fmts = _fmap[c.id] ?? []
        if (!fmts.includes(filterFormat)) return false
      }
      return true
    })
  })()

  // Group campaigns by customer name for display
  $: groups = groupCampaigns(visibleCampaigns)

  function groupCampaigns(list) {
    const map = {}
    for (const c of list) {
      const key = c.customer?.name ?? 'Без клиента'
      if (!map[key]) map[key] = { name: key, brand: c.brand?.name, items: [] }
      map[key].items.push(c)
    }
    return Object.values(map)
  }

  function toggleGroup(key) {
    expanded = { ...expanded, [key]: !expanded[key] }
  }

  function isExpanded(key) {
    return expanded[key] !== false // expanded by default
  }

  const STATE_LABEL_MAP = {
    NEW: 'Новая', ON_MODERATION: 'На модерации', ACTIVE: 'Активна',
    STOPPED: 'Остановлена', COMPLETED: 'Завершена', BUDGET_EXHAUSTED: 'Бюджет исчерпан',
    CANCELLED: 'Отменена', REJECTED: 'Отклонена', BOOKED: 'Забронирована',
    RESERVED: 'Зарезервирована', ON_REVISION: 'На доработке',
    SENDING_ERROR: 'Ошибка', ACTIVATED: 'Активирована', DELETED: 'Удалена',
    OTS_EXHAUSTED: 'OTS исчерпан', WITHOUT_INVENTORY: 'Без инвентаря',
  }

  const TYPE_LABEL_MAP = { RTB: 'RTB', GUARANTEED: 'Гарантированный', FLEX_GUARANTEED: 'Flex', OPEN_RTB: 'Open RTB' }

  const STATE_GROUPS_FILTER = [
    { label: 'Активные',   values: ['ACTIVE','ACTIVATED','BOOKED','RESERVED'] },
    { label: 'В обработке', values: ['ON_MODERATION','ON_TARGETING_CREATION','ON_REVISION'] },
    { label: 'Новые',      values: ['NEW'] },
    { label: 'Завершённые', values: ['COMPLETED','BUDGET_EXHAUSTED','OTS_EXHAUSTED','WITHOUT_INVENTORY'] },
    { label: 'Остановлены', values: ['STOPPED','CANCELLED','REJECTED','DELETED'] },
    { label: 'Ошибки',    values: ['SENDING_ERROR','CONFIRMATION_ERROR','ACTIVATED_CANCELLATION_ERROR'] },
  ]

  $: hasDateFilter = !!(filterDateFrom || filterDateTo)
  $: hasBudgetFilter = !!(filterBudgetMin || filterBudgetMax)
  $: hasCityFilter = !!filterCity
  $: hasFormatFilter = !!filterFormat
  // Unique inventory format codes seen in current page's data
  $: availableFormats = [...new Set(Object.values(formatsMap).flat())].sort()

  // Reactive sort icons — $: guarantees re-evaluation whenever sortBy/sortDir change
  $: si = (() => {
    const icon = f => sortBy === f ? (sortDir === 'asc' ? 'up' : 'down') : 'both'
    return {
      name:             icon('name'),
      startDate:        icon('startDate'),
      endDate:          icon('endDate'),
      budget:           icon('budget'),
      otsCount:         icon('otsCount'),
      impressionsCount: icon('impressionsCount'),
    }
  })()

  // Row context menu
  let openRowMenu = null
  function toggleRowMenu(id, e) {
    e.stopPropagation()
    openRowMenu = openRowMenu === id ? null : id
  }
  function closeRowMenu() { openRowMenu = null }

  const STOPPABLE = ['ACTIVE','ACTIVATED','BOOKED','RESERVED']
  const STARTABLE = ['STOPPED','CANCELLED','NEW']
</script>

<!-- ── Toolbar ── -->
<div class="toolbar">
  <!-- Status chip -->
  <div style="position:relative">
    <button class="chip" class:active={!!filterState} on:click={() => toggleChip('state')}>
      Статус {filterState ? `· ${STATE_LABEL_MAP[filterState] ?? filterState}` : ''}
      <svg class="chip-arrow" viewBox="0 0 10 6" fill="none">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    {#if openChip === 'state'}
      <div class="dropdown" style="min-width:200px">
        <button class="dropdown-item" on:click={() => clearFilter('state')}>Все статусы</button>
        {#each STATE_GROUPS_FILTER as grp}
          <div class="dropdown-group">{grp.label}</div>
          {#each grp.values.filter(v => allStates.includes(v)) as v}
            <button class="dropdown-item" class:selected={filterState===v} on:click={() => applyFilter('state', v)}>
              {STATE_LABEL_MAP[v] ?? v}
            </button>
          {/each}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Search (Название) -->
  <div style="position:relative">
    <button class="chip" class:active={!!filterSearch} on:click={() => toggleChip('search')}>
      Название {filterSearch ? `· ${filterSearch}` : ''}
    </button>
    {#if openChip === 'search'}
      <div class="dropdown" style="min-width:220px;padding:10px">
        <input
          class="chip-input"
          type="text"
          placeholder="Поиск по названию…"
          bind:value={filterSearch}
          on:input={onSearchInput}
          autofocus
        />
      </div>
    {/if}
  </div>

  <!-- Type chip -->
  <div style="position:relative">
    <button class="chip" class:active={!!filterType} on:click={() => toggleChip('type')}>
      Тип кампании {filterType ? `· ${TYPE_LABEL_MAP[filterType] ?? filterType}` : ''}
      <svg class="chip-arrow" viewBox="0 0 10 6" fill="none">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    {#if openChip === 'type'}
      <div class="dropdown">
        <button class="dropdown-item" on:click={() => clearFilter('type')}>Все типы</button>
        {#each allTypes as t}
          <button class="dropdown-item" class:selected={filterType===t} on:click={() => applyFilter('type', t)}>
            {TYPE_LABEL_MAP[t] ?? t}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Dates chip -->
  <div style="position:relative">
    <button class="chip" class:active={hasDateFilter} on:click={() => toggleChip('date')}>
      <svg class="chip-calendar" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11 3a1 1 0 10-2 0v1H7V3a1 1 0 10-2 0v1H4a2 2 0 00-2 2v7a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-1V3zM4 7h8v5H4V7z"/>
      </svg>
      Даты {hasDateFilter ? '·' : ''}
      <svg class="chip-arrow" viewBox="0 0 10 6" fill="none">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    {#if openChip === 'date'}
      <div class="dropdown" style="min-width:240px;padding:12px">
        <div class="filter-row-label">Начало кампании</div>
        <div class="filter-row">
          <input class="chip-input" type="date" bind:value={filterDateFrom} style="flex:1" />
        </div>
        <div class="filter-row-label" style="margin-top:8px">Конец кампании</div>
        <div class="filter-row">
          <input class="chip-input" type="date" bind:value={filterDateTo} style="flex:1" />
        </div>
        <div class="filter-actions">
          <button class="filter-clear-btn" on:click={() => clearFilter('date')}>Сбросить</button>
          <button class="filter-apply-btn" on:click={applyDateFilter}>Применить</button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Budget chip -->
  <div style="position:relative">
    <button class="chip" class:active={hasBudgetFilter} on:click={() => toggleChip('budget')}>
      Бюджет {hasBudgetFilter ? '·' : ''}
      <svg class="chip-arrow" viewBox="0 0 10 6" fill="none">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    {#if openChip === 'budget'}
      <div class="dropdown" style="min-width:240px;padding:12px;left:auto;right:0">
        <div class="filter-row-label">Бюджет от (₽)</div>
        <div class="filter-row">
          <input class="chip-input" type="number" min="0" placeholder="0" bind:value={filterBudgetMin} style="flex:1" />
        </div>
        <div class="filter-row-label" style="margin-top:8px">Бюджет до (₽)</div>
        <div class="filter-row">
          <input class="chip-input" type="number" min="0" placeholder="∞" bind:value={filterBudgetMax} style="flex:1" />
        </div>
        <div class="filter-actions">
          <button class="filter-clear-btn" on:click={() => clearFilter('budget')}>Сбросить</button>
          <button class="filter-apply-btn" on:click={applyBudgetFilter}>Применить</button>
        </div>
      </div>
    {/if}
  </div>

  <!-- City filter chip -->
  <div style="position:relative">
    <button class="chip" class:active={hasCityFilter} on:click={() => toggleChip('city')}>
      Город {hasCityFilter ? `· ${filterCity}` : ''}
    </button>
    {#if openChip === 'city'}
      <div class="dropdown" style="min-width:220px;padding:10px">
        <input
          class="chip-input"
          type="text"
          placeholder="Поиск по городу…"
          bind:value={filterCity}
          autofocus
        />
        {#if filterCity}
          <div class="filter-actions">
            <button class="filter-clear-btn" on:click={() => clearFilter('city')}>Сбросить</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Inventory format filter chip -->
  <div style="position:relative">
    <button class="chip" class:active={hasFormatFilter} on:click={() => toggleChip('inv-format')}>
      Формат {hasFormatFilter ? `· ${FORMAT_LABEL[filterFormat] ?? filterFormat}` : ''}
      <svg class="chip-arrow" viewBox="0 0 10 6" fill="none">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    {#if openChip === 'inv-format'}
      <div class="dropdown" style="min-width:180px">
        <button class="dropdown-item" on:click={() => clearFilter('inv-format')}>Все форматы</button>
        {#if availableFormats.length === 0}
          <div class="dropdown-group">Загрузка…</div>
        {:else}
          {#each availableFormats as code}
            <button class="dropdown-item" class:selected={filterFormat === code}
              on:click={() => { filterFormat = code; openChip = null }}>
              {FORMAT_LABEL[code] ?? code}
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="toolbar-spacer"></div>

  <button class="btn-new-campaign" on:click={() => { window.location.hash = '#/campaigns/create' }}>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    Рекламная кампания
  </button>
</div>

<!-- ── Tabs ── -->
<div class="tabs-bar">
  <button class="tab" class:active={activeTab==='all'} on:click={() => activeTab='all'}>
    Все рекламные кампании
  </button>
  <button class="tab" class:active={activeTab==='groups'} on:click={() => activeTab='groups'}>
    Группы
  </button>
  <div class="tab-actions">
    <!-- Column settings icon -->
    <button style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:6px;display:flex">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
        <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z"/>
      </svg>
    </button>
  </div>
</div>

<!-- ── Table ── -->
<div class="page-body">
<div class="table-wrap">
  <table class="campaigns-table">
    <colgroup>
      {#each colW as w, i}
        <col style="width:{w}px;min-width:{i === colW.length-1 ? w : 40}px">
      {/each}
    </colgroup>
    <thead>
      <tr>
        <th style="position:relative">Статус<div class="rzh" on:mousedown={(e)=>rzStart(0,e)}></div></th>
        <th style="position:relative">
          <button class="sort-th" on:click={() => setSort('name')}>
            Кампания
            {#if si.name === 'up'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 10V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else if si.name === 'down'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 2v8M2 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else}
              <svg class="sort-icon sort-icon-muted" viewBox="0 0 10 14" fill="none"><path d="M5 1v4M3 3l2-2 2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13V9M3 11l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {/if}
          </button>
          <div class="rzh" on:mousedown={(e)=>rzStart(1,e)}></div>
        </th>
        <th style="position:relative;white-space:nowrap">Город<div class="rzh" on:mousedown={(e)=>rzStart(2,e)}></div></th>
        <th style="position:relative;white-space:nowrap">Формат<div class="rzh" on:mousedown={(e)=>rzStart(3,e)}></div></th>
        <th style="position:relative">
          <button class="sort-th" on:click={() => setSort('startDate')}>
            Начало
            {#if si.startDate === 'up'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 10V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else if si.startDate === 'down'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 2v8M2 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else}
              <svg class="sort-icon sort-icon-muted" viewBox="0 0 10 14" fill="none"><path d="M5 1v4M3 3l2-2 2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13V9M3 11l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {/if}
          </button>
          <div class="rzh" on:mousedown={(e)=>rzStart(4,e)}></div>
        </th>
        <th style="position:relative">
          <button class="sort-th" on:click={() => setSort('endDate')}>
            Конец
            {#if si.endDate === 'up'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 10V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else if si.endDate === 'down'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 2v8M2 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else}
              <svg class="sort-icon sort-icon-muted" viewBox="0 0 10 14" fill="none"><path d="M5 1v4M3 3l2-2 2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13V9M3 11l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {/if}
          </button>
          <div class="rzh" on:mousedown={(e)=>rzStart(5,e)}></div>
        </th>
        <th style="position:relative">
          <button class="sort-th" on:click={() => setSort('budget')}>
            Бюджет
            {#if si.budget === 'up'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 10V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else if si.budget === 'down'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 2v8M2 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else}
              <svg class="sort-icon sort-icon-muted" viewBox="0 0 10 14" fill="none"><path d="M5 1v4M3 3l2-2 2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13V9M3 11l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {/if}
          </button>
          <div class="rzh" on:mousedown={(e)=>rzStart(6,e)}></div>
        </th>
        <th style="position:relative"><span class="sort-th" style="cursor:default">Сегодня</span><div class="rzh" on:mousedown={(e)=>rzStart(7,e)}></div></th>
        <th style="position:relative">
          <button class="sort-th" on:click={() => setSort('otsCount')}>
            OTS
            {#if si.otsCount === 'up'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 10V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else if si.otsCount === 'down'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 2v8M2 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else}
              <svg class="sort-icon sort-icon-muted" viewBox="0 0 10 14" fill="none"><path d="M5 1v4M3 3l2-2 2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13V9M3 11l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {/if}
          </button>
          <div class="rzh" on:mousedown={(e)=>rzStart(8,e)}></div>
        </th>
        <th style="position:relative">
          <button class="sort-th" on:click={() => setSort('impressionsCount')}>
            Выходы
            {#if si.impressionsCount === 'up'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 10V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else if si.impressionsCount === 'down'}
              <svg class="sort-icon" viewBox="0 0 10 12" fill="none"><path d="M5 2v8M2 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else}
              <svg class="sort-icon sort-icon-muted" viewBox="0 0 10 14" fill="none"><path d="M5 1v4M3 3l2-2 2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13V9M3 11l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {/if}
          </button>
          <div class="rzh" on:mousedown={(e)=>rzStart(9,e)}></div>
        </th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#if loading}
        <tr><td colspan="11" class="state-cell">
          <div class="spinner"></div>
          Загружаю кампании…
        </td></tr>

      {:else if error}
        <tr><td colspan="11" class="state-cell" style="color:#EF4444">{error}</td></tr>

      {:else if campaigns.length === 0}
        <tr><td colspan="11" class="state-cell">Кампании не найдены</td></tr>

      {:else if activeTab === 'groups'}
        {#each groups as group (group.name)}
          <!-- Group header row -->
          <tr class="group-row">
            <td colspan="6">
              <div class="group-name" on:click={() => toggleGroup(group.name)}>
                <!-- Folder icon -->
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="color:var(--text-muted);flex-shrink:0">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                </svg>
                {group.name}
                <span class="group-count">· {group.items.length} кампаний</span>
                {#if group.brand}
                  <span class="group-count">· {group.brand}</span>
                {/if}
              </div>
            </td>
            <!-- Group totals -->
            <td class="budget-cell">
              <div class="budget-main">
                {formatMoney(group.items.reduce((s,c)=>s+(c.budget??0),0))}
              </div>
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td>
              <button class="group-expand" on:click={() => toggleGroup(group.name)}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
                     style="transform: rotate({isExpanded(group.name) ? 180 : 0}deg); transition: transform .2s">
                  <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              </button>
            </td>
          </tr>

          <!-- Campaign rows within group -->
          {#if isExpanded(group.name)}
            {#each group.items as c (c.id)}
              <tr class="campaign-row">
                <td>
                  <StatusBadge state={c.state} />
                </td>
                <td>
                  <button class="name-link" on:click={() => openCampaign(c.id)}>{c.name || '(без названия)'}</button>
                  <div class="cell-advertiser">{c.agency?.name ?? ''}</div>
                </td>
                <td style="color:var(--text-muted);font-size:12px">
                  {formatCities(c, citiesMap)}
                </td>
                <td style="color:var(--text-muted);font-size:12px">
                  {formatFormats(c, formatsMap)}
                </td>
                <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">
                  {formatDate(c.startDate)}
                </td>
                <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">
                  {formatDate(c.endDate)}
                </td>
                <td class="budget-cell">
                  {#if true}
                    {@const totalSpent = statsMap[c.id]?.totalBudgetShowed > 0 ? statsMap[c.id].totalBudgetShowed : (todayStatsMap[c.id]?.spend ?? 0)}
                    <div class="budget-main">{formatMoney(c.budget ?? 0)}</div>
                    {#if totalSpent > 0 && c.budget > 0}
                      {@const pct = Math.min(100, Math.round(totalSpent / c.budget * 100))}
                      <div class="budget-sub">
                        <span class="budget-pct">{pct}%</span>
                        <div class="budget-bar-track">
                          <div class="budget-bar-fill" style="width:{pct}%"></div>
                        </div>
                        <span style="font-size:11px;color:var(--text-muted)">{formatMoney(totalSpent)}</span>
                      </div>
                    {/if}
                  {/if}
                </td>
                <td class="budget-cell">
                  {#if todayMap[c.id] != null && todayMap[c.id] > 0}
                    <div class="budget-main">{formatMoney(todayMap[c.id])}</div>
                    {#if c.budget > 0}
                      {@const dayPct = Math.min(100, Math.round(todayMap[c.id] / (c.budget / Math.max(1, Math.round((new Date(c.endDate) - new Date(c.startDate)) / 86400000) + 1)) * 100))}
                      <div class="budget-sub">
                        <span class="budget-pct">{dayPct}%</span>
                        <div class="budget-bar-track">
                          <div class="budget-bar-fill" style="width:{dayPct}%"></div>
                        </div>
                      </div>
                    {/if}
                  {:else}
                    <div class="budget-main" style="color:var(--text-muted)">—</div>
                  {/if}
                </td>
                <td style="font-size:12px;color:var(--text-muted)">
                  {#if true}
                    {@const otsVal = statsMap[c.id]?.totalOts ?? todayStatsMap[c.id]?.ots ?? null}
                    {@const otsPlanned = c.otsCount ?? c.ots ?? null}
                    {#if otsVal != null && otsVal > 0}
                      {otsVal.toLocaleString('ru-RU')}
                    {:else if otsPlanned}
                      <span style="color:#d1d5db">{otsPlanned.toLocaleString('ru-RU')}</span>
                    {:else}
                      —
                    {/if}
                  {/if}
                </td>
                <td style="font-size:12px;color:var(--text-muted)">
                  {#if true}
                    {@const showedVal = statsMap[c.id]?.totalShowed ?? todayStatsMap[c.id]?.showed ?? null}
                    {@const cpmVal = statsMap[c.id]?.cpm ?? 0}
                    {#if showedVal != null && showedVal > 0}
                      <div>{showedVal.toLocaleString('ru-RU')}</div>
                      {#if cpmVal > 0}
                        <div style="font-size:11px;color:var(--text-muted)">CPM {cpmVal.toFixed(0)} ₽</div>
                      {/if}
                    {:else}
                      —
                    {/if}
                  {/if}
                </td>
                <td style="position:relative">
                  <button class="row-menu-btn" title="Действия" on:click={(e) => toggleRowMenu(c.id, e)}>⋮</button>
                  {#if openRowMenu === c.id}
                    <div class="row-menu-dropdown">
                      <button class="dropdown-item" on:click={() => { openCampaign(c.id); closeRowMenu() }}>
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
                        Открыть
                      </button>
                      {#if STOPPABLE.includes(c.state)}
                        <button class="dropdown-item dropdown-item--warn" on:click={closeRowMenu}>
                          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"/></svg>
                          Остановить
                        </button>
                      {:else if STARTABLE.includes(c.state)}
                        <button class="dropdown-item dropdown-item--green" on:click={closeRowMenu}>
                          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
                          Запустить
                        </button>
                      {/if}
                      <button class="dropdown-item" on:click={() => { duplicateCampaign(c.id); closeRowMenu() }}>
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"/><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"/></svg>
                        Дублировать
                      </button>
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        {/each}

      {:else}
        <!-- Flat "all" tab -->
        {#each visibleCampaigns as c (c.id)}
          <tr class="campaign-row">
            <td>
              <StatusBadge state={c.state} />
            </td>
            <td>
              <button class="name-link" on:click={() => openCampaign(c.id)}>{c.name || '(без названия)'}</button>
              <div class="cell-advertiser">{c.agency?.name ?? ''}</div>
            </td>
            <td style="color:var(--text-muted);font-size:12px">
              {formatCities(c, citiesMap)}
            </td>
            <td style="color:var(--text-muted);font-size:12px">
              {formatFormats(c, formatsMap)}
            </td>
            <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">
              {formatDate(c.startDate)}
            </td>
            <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">
              {formatDate(c.endDate)}
            </td>
            <td class="budget-cell">
              {#if true}
                {@const totalSpent = statsMap[c.id]?.totalBudgetShowed > 0 ? statsMap[c.id].totalBudgetShowed : (todayStatsMap[c.id]?.spend ?? 0)}
                <div class="budget-main">{formatMoney(c.budget ?? 0)}</div>
                {#if totalSpent > 0 && c.budget > 0}
                  {@const pct = Math.min(100, Math.round(totalSpent / c.budget * 100))}
                  <div class="budget-sub">
                    <span class="budget-pct">{pct}%</span>
                    <div class="budget-bar-track">
                      <div class="budget-bar-fill" style="width:{pct}%"></div>
                    </div>
                    <span style="font-size:11px;color:var(--text-muted)">{formatMoney(totalSpent)}</span>
                  </div>
                {/if}
              {/if}
            </td>
            <td class="budget-cell">
              {#if todayMap[c.id] != null && todayMap[c.id] > 0}
                <div class="budget-main">{formatMoney(todayMap[c.id])}</div>
                {#if c.budget > 0}
                  {@const dayPct = Math.min(100, Math.round(todayMap[c.id] / (c.budget / Math.max(1, Math.round((new Date(c.endDate) - new Date(c.startDate)) / 86400000) + 1)) * 100))}
                  <div class="budget-sub">
                    <span class="budget-pct">{dayPct}%</span>
                    <div class="budget-bar-track">
                      <div class="budget-bar-fill" style="width:{dayPct}%"></div>
                    </div>
                  </div>
                {/if}
              {:else}
                <div class="budget-main" style="color:var(--text-muted)">—</div>
              {/if}
            </td>
            <td style="font-size:12px;color:var(--text-muted)">
              {#if true}
                {@const otsVal = statsMap[c.id]?.totalOts ?? todayStatsMap[c.id]?.ots ?? null}
                {@const otsPlanned = c.otsCount ?? c.ots ?? null}
                {#if otsVal != null && otsVal > 0}
                  {otsVal.toLocaleString('ru-RU')}
                {:else if otsPlanned}
                  <span style="color:#d1d5db">{otsPlanned.toLocaleString('ru-RU')}</span>
                {:else}
                  —
                {/if}
              {/if}
            </td>
            <td style="font-size:12px;color:var(--text-muted)">
              {#if true}
                {@const showedVal = statsMap[c.id]?.totalShowed ?? todayStatsMap[c.id]?.showed ?? null}
                {@const cpmVal = statsMap[c.id]?.cpm ?? 0}
                {#if showedVal != null && showedVal > 0}
                  <div>{showedVal.toLocaleString('ru-RU')}</div>
                  {#if cpmVal > 0}
                    <div style="font-size:11px;color:var(--text-muted)">CPM {cpmVal.toFixed(0)} ₽</div>
                  {/if}
                {:else}
                  —
                {/if}
              {/if}
            </td>
            <td style="position:relative">
              <button class="row-menu-btn" title="Действия" on:click={(e) => toggleRowMenu(c.id, e)}>⋮</button>
              {#if openRowMenu === c.id}
                <div class="row-menu-dropdown">
                  <button class="dropdown-item" on:click={() => { openCampaign(c.id); closeRowMenu() }}>
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
                    Открыть
                  </button>
                  {#if STOPPABLE.includes(c.state)}
                    <button class="dropdown-item dropdown-item--warn" on:click={closeRowMenu}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"/></svg>
                      Остановить
                    </button>
                  {:else if STARTABLE.includes(c.state)}
                    <button class="dropdown-item dropdown-item--green" on:click={closeRowMenu}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
                      Запустить
                    </button>
                  {/if}
                  <button class="dropdown-item" on:click={() => { duplicateCampaign(c.id); closeRowMenu() }}>
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"/><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"/></svg>
                    Дублировать
                  </button>
                </div>
              {/if}
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>

<!-- Pagination -->
{#if totalPages > 1}
  <Pagination
    page={currentPage}
    {totalPages}
    {totalElements}
    size={PAGE_SIZE}
    on:change={onPageChange}
  />
{/if}
</div>

<!-- Close dropdowns on outside click -->
<svelte:window on:click|capture={(e) => {
  if (!e.target.closest('.chip') && !e.target.closest('.dropdown')) openChip = null
  if (!e.target.closest('.row-menu-btn') && !e.target.closest('.row-menu-dropdown')) openRowMenu = null
}} />

<style>
  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 4px 24px rgba(0,0,0,.15);
    z-index: 200;
    min-width: 160px;
    padding: 4px 0;
  }

  .dropdown-group {
    padding: 6px 12px 2px;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-muted);
  }

  .dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 7px 12px;
    font-size: 12.5px;
    color: var(--text);
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
  }
  .dropdown-item:hover { background: var(--navy-light); color: var(--navy); }
  .dropdown-item.selected { font-weight: 600; color: var(--navy); }

  .chip-input {
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    outline: none;
    box-sizing: border-box;
  }
  .chip-input:focus { border-color: var(--navy); }

  .filter-row-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }

  .filter-row {
    display: flex;
    gap: 6px;
  }

  .filter-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 10px;
  }

  .filter-clear-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 10px;
    font-size: 12px;
    font-family: inherit;
    color: var(--text-muted);
    cursor: pointer;
  }
  .filter-clear-btn:hover { border-color: var(--navy); color: var(--navy); }

  .filter-apply-btn {
    background: var(--navy, #112853);
    border: none;
    border-radius: 5px;
    padding: 5px 12px;
    font-size: 12px;
    font-family: inherit;
    color: white;
    cursor: pointer;
  }
  .filter-apply-btn:hover { opacity: .88; }

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

  /* Sort button in th */
  .sort-th {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .sort-th:hover { color: var(--navy, #112853); }

  .sort-icon {
    width: 10px;
    height: 12px;
    flex-shrink: 0;
    flex-grow: 0;
    vertical-align: middle;
    display: inline-block; /* keeps space stable */
  }
  .sort-icon-muted {
    opacity: 0.35;
  }

  /* Campaigns table — fixed layout prevents column-width shifts on sort */
  .campaigns-table {
    table-layout: fixed;
  }
  /* Name cell: don't wrap, truncate with ellipsis */
  .campaigns-table td:nth-child(2),
  .campaigns-table th:nth-child(2) {
    overflow: hidden;
  }
  .name-link {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .cell-advertiser {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Row context menu */
  .row-menu-dropdown {
    position: absolute;
    top: calc(100% - 2px);
    right: 0;
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius, 8px);
    box-shadow: 0 4px 20px rgba(0,0,0,.14);
    z-index: 300;
    min-width: 160px;
    padding: 4px 0;
  }
  .dropdown-item--warn { color: #ef4444 !important; }
  .dropdown-item--warn:hover { background: #fef2f2 !important; color: #ef4444 !important; }
  .dropdown-item--green { color: #16a34a !important; }
  .dropdown-item--green:hover { background: #f0fdf4 !important; color: #16a34a !important; }
  .dropdown-item svg { vertical-align: middle; margin-right: 6px; flex-shrink: 0; }

  /* Name link as button */
  .name-link {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--text, #111827);
    cursor: pointer;
    text-align: left;
    text-decoration: none;
    display: block;
  }
  .name-link:hover {
    color: var(--accent, #6366f1);
    text-decoration: underline;
  }
</style>
