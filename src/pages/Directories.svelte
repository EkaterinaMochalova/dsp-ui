<script>
  import { onMount } from 'svelte'
  import { page } from '../lib/stores.js'
  import { api } from '../lib/api.js'

  // ── Routing ────────────────────────────────────────────────────────────────
  $: subView = $page.startsWith('directories/') ? $page.slice('directories/'.length) : ''

  function nav(sub = '') {
    window.location.hash = sub ? `#/directories/${sub}` : '#/directories'
  }

  // ── Section metadata ───────────────────────────────────────────────────────
  const SECTIONS = [
    {
      key: 'agencies', label: 'Рекламные агентства', color: '#3b82f6', bg: '#eff6ff',
      desc: 'Агентства, от лица которых размещаются кампании',
      createLabel: 'Создать агентство',
      icon: `<path d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z"/><path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15a24.98 24.98 0 01-8-1.308z"/>`,
    },
    {
      key: 'customers', label: 'Рекламодатели', color: '#10b981', bg: '#f0fdf4',
      desc: 'Клиенты и рекламодатели, привязанные к агентствам',
      createLabel: 'Создать рекламодателя',
      icon: `<path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clip-rule="evenodd"/>`,
    },
    {
      key: 'brands', label: 'Бренды', color: '#8b5cf6', bg: '#f5f3ff',
      desc: 'Торговые марки и бренды рекламодателей',
      createLabel: 'Создать бренд',
      icon: `<path fill-rule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>`,
    },
    {
      key: 'users', label: 'Пользователи', color: '#f59e0b', bg: '#fffbeb',
      desc: 'Пользователи платформы и их права доступа',
      createLabel: 'Добавить пользователя',
      icon: `<path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>`,
    },
    {
      key: 'ssp', label: 'SSP системы', color: '#ef4444', bg: '#fef2f2',
      desc: 'Подключённые SSP-платформы для закупки инвентаря',
      createLabel: 'Добавить SSP',
      icon: `<path d="M13 7H7v6h6V7z"/><path fill-rule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clip-rule="evenodd"/>`,
    },
  ]

  $: currentSection = SECTIONS.find(s => s.key === subView)

  // ── Data ───────────────────────────────────────────────────────────────────
  let rows    = []
  let counts  = {}
  let loading = false
  let error   = ''
  let searchText = ''

  // Dropdown options
  let agencyOptions  = []
  let customerOptions = []

  // ── Modal state ────────────────────────────────────────────────────────────
  let modalOpen    = false
  let modalMode    = 'create'
  let modalForm    = {}
  let modalError   = ''
  let modalSaving  = false
  let editingId    = null

  // ── Load on sub-view change ────────────────────────────────────────────────
  let prevSubView = null
  $: if (subView !== prevSubView) {
    prevSubView = subView
    if (!subView) loadCounts()
    else loadSection(subView)
  }

  onMount(() => {
    if (!subView) loadCounts()
    else loadSection(subView)
    // Preload agencies for dropdown
    api.agencies.list()
      .then(r => { agencyOptions = Array.isArray(r) ? r : (r?.content ?? []) })
      .catch(() => {})
  })

  // ── Count loading for landing ──────────────────────────────────────────────
  async function loadCounts() {
    const results = await Promise.allSettled([
      api.agencies.list(),
      api.customers.list({ page: 0, size: 1 }),
      api.brands.list({ page: 0, size: 1 }),
      api.users.list({ page: 0, size: 1 }),
      api.ssp.list({ page: 0, size: 1 }),
    ])
    function extract(r) {
      if (r.status !== 'fulfilled' || !r.value) return null
      const v = r.value
      if (Array.isArray(v)) return v.length
      return v.totalElements ?? v.content?.length ?? null
    }
    counts = {
      agencies:  extract(results[0]),
      customers: extract(results[1]),
      brands:    extract(results[2]),
      users:     extract(results[3]),
      ssp:       extract(results[4]),
    }
  }

  // ── Section data loading ───────────────────────────────────────────────────
  async function loadSection(view) {
    loading = true; error = ''; rows = []
    try {
      let data
      if      (view === 'agencies')  data = await api.agencies.list({ page: 0, size: -1 })
      else if (view === 'customers') data = await api.customers.list({ page: 0, size: -1 })
      else if (view === 'brands')    data = await api.brands.list()
      else if (view === 'users')     data = await api.users.list()
      else if (view === 'ssp')       data = await api.ssp.list()
      rows = Array.isArray(data) ? data : (data?.content ?? [])
    } catch {
      error = 'Не удалось загрузить данные'
    } finally {
      loading = false
    }
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  $: filtered = (() => {
    if (!searchText.trim()) return rows
    const q = searchText.trim().toLowerCase()
    return rows.filter(r =>
      Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes(q)) ||
      (r.agency?.name ?? '').toLowerCase().includes(q) ||
      (r.customer?.name ?? '').toLowerCase().includes(q)
    )
  })()

  // ── CRUD helpers ───────────────────────────────────────────────────────────
  function openCreate() {
    modalMode = 'create'; modalForm = {}; modalError = ''; editingId = null; modalOpen = true
  }
  function openEdit(row) {
    modalMode = 'edit'
    modalForm = {
      name:        row.name ?? '',
      description: row.description ?? '',
      agencyId:    row.agency?.id ?? row.agencyId ?? '',
      customerId:  row.customer?.id ?? row.customerId ?? '',
      email:       row.email ?? '',
      enabled:     row.enabled ?? true,
      // agency/customer shared
      monthlyBudget:        row.monthlyBudget ?? 0,
      // agency-specific (photoReportSettings)
      photoSaveAll:         row.photoReportSettings?.saveAll            ?? false,
      photoSaveMode:        row.photoReportSettings?.saveMode           ?? 'BY_CAMPAIGN',
      photoCountPerDisplay: row.photoReportSettings?.countPerDisplay    ?? 1,
      photoExplicitlySet:   row.photoReportSettings?.explicitlySetPhoto ?? false,
      // customer-specific
      additionalCharge:    row.additionalCharge ?? 0,
      keepBalance:         row.keepBalance      ?? false,
      accFullName:         row.accountDetails?.fullName           ?? '',
      accInn:              row.accountDetails?.inn                ?? '',
      accKpp:              row.accountDetails?.kpp                ?? '',
      accAddress:          row.accountDetails?.registeredAddress  ?? '',
    }
    modalError = ''; editingId = row.id; modalOpen = true
  }

  async function saveModal() {
    modalSaving = true; modalError = ''
    try {
      const d = modalForm
      if (subView === 'agencies') {
        const body = {
          name:         d.name,
          description:  d.description || '',
          monthlyBudget: Number(d.monthlyBudget) || 0,
          photoReportSettings: {
            saveAll:           d.photoSaveAll    || false,
            saveMode:          d.photoSaveMode   || 'BY_CAMPAIGN',
            countPerDisplay:   Number(d.photoCountPerDisplay) || 1,
            explicitlySetPhoto: d.photoExplicitlySet || false,
          },
        }
        modalMode === 'create' ? await api.agencies.create(body) : await api.agencies.update(editingId, body)
      } else if (subView === 'customers') {
        const body = {
          name:             d.name,
          agencyId:         d.agencyId || null,
          description:      d.description || '',
          monthlyBudget:    Number(d.monthlyBudget)   || 0,
          additionalCharge: Number(d.additionalCharge) || 0,
          keepBalance:      d.keepBalance || false,
          accountDetails: {
            fullName:           d.accFullName  || '',
            inn:                d.accInn       || '',
            kpp:                d.accKpp       || '',
            registeredAddress:  d.accAddress   || '',
          },
        }
        modalMode === 'create' ? await api.customers.create(body.agencyId, body) : await api.customers.update(editingId, body)
      } else if (subView === 'brands') {
        const body = { name: d.name, description: d.description }
        modalMode === 'create' ? await api.brands.create(body) : await api.brands.update(editingId, body)
      } else if (subView === 'users') {
        modalMode === 'create' ? await api.users.create(d) : await api.users.update(editingId, d)
      } else if (subView === 'ssp') {
        const body = { name: d.name, url: d.url }
        modalMode === 'create' ? await api.ssp.create(body) : await api.ssp.update(editingId, body)
      }
      modalOpen = false
      await loadSection(subView)
      loadCounts()
    } catch(e) {
      modalError = e?.data?.message ?? e?.message ?? 'Ошибка при сохранении'
    } finally {
      modalSaving = false
    }
  }

  async function deleteRow(row) {
    const label = row.name ?? row.shortName ?? row.email ?? `#${row.id}`
    if (!confirm(`Удалить «${label}»? Это действие необратимо.`)) return
    try {
      if      (subView === 'agencies')  await api.agencies.delete(row.id)
      else if (subView === 'customers') await api.customers.delete(row.id)
      else if (subView === 'brands')    await api.brands.delete(row.id)
      else if (subView === 'users')     await api.users.delete(row.id)
      else if (subView === 'ssp')       await api.ssp.delete(row.id)
      await loadSection(subView)
      loadCounts()
    } catch(e) {
      console.error('[deleteRow]', JSON.stringify(e))
      const msg = e?.data?.message ?? e?.data?.error ?? (typeof e?.data === 'string' ? e.data : null) ?? e?.message ?? JSON.stringify(e?.data ?? e)
      alert('Не удалось удалить: ' + msg)
    }
  }

  async function toggleUser(row) {
    try {
      await api.users.toggle(row.id)
      rows = rows.map(r => r.id === row.id ? { ...r, enabled: !r.enabled } : r)
    } catch(e) {
      alert('Не удалось изменить статус: ' + (e?.data?.message ?? 'Ошибка'))
    }
  }

  // ── Formatting ─────────────────────────────────────────────────────────────
  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  // Generic SSP columns derived from first row
  $: sspColumns = (() => {
    if (!rows.length) return []
    const skip = new Set(['id', 'createdAt', 'updatedAt', 'created', 'updated'])
    return Object.keys(rows[0]).filter(k => !skip.has(k)).slice(0, 5)
  })()
</script>

<!-- ──────────────────────────────────────────────────────────────────────── -->
<!--  LANDING                                                                  -->
<!-- ──────────────────────────────────────────────────────────────────────── -->
{#if !subView}
<div class="dir-home">
  <div class="dir-home-header">
    <div>
      <h1 class="dir-home-title">Справочники</h1>
      <p class="dir-home-sub">Управление агентствами, рекламодателями, брендами, пользователями и SSP</p>
    </div>
  </div>

  <div class="dir-grid">
    {#each SECTIONS as s}
      <button class="dir-card" on:click={() => nav(s.key)} style="--card-color:{s.color};--card-bg:{s.bg}">
        <div class="dir-card-top">
          <div class="dir-card-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              {@html s.icon}
            </svg>
          </div>
          <div class="dir-card-count">
            {counts[s.key] != null ? counts[s.key].toLocaleString('ru-RU') : '—'}
          </div>
        </div>
        <div class="dir-card-label">{s.label}</div>
        <div class="dir-card-desc">{s.desc}</div>
        <div class="dir-card-cta">
          Открыть
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
          </svg>
        </div>
      </button>
    {/each}
  </div>
</div>

<!-- ──────────────────────────────────────────────────────────────────────── -->
<!--  LIST PAGE                                                                -->
<!-- ──────────────────────────────────────────────────────────────────────── -->
{:else}
<div class="dir-list">

  <!-- Header -->
  <div class="dir-list-top">
    <button class="back-btn" on:click={() => nav()}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
      </svg>
      Справочники
    </button>
    <div class="dir-list-header">
      <div class="dir-list-heading">
        {#if currentSection}
          <div class="dir-list-icon" style="background:{currentSection.bg};color:{currentSection.color}">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              {@html currentSection.icon}
            </svg>
          </div>
        {/if}
        <h1 class="dir-list-title">{currentSection?.label ?? subView}</h1>
        {#if !loading}
          <span class="dir-list-count">{filtered.length}</span>
        {/if}
      </div>
      <button class="btn-create" on:click={openCreate}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        {currentSection?.createLabel ?? 'Создать'}
      </button>
    </div>
  </div>

  <!-- Search -->
  <div class="dir-search-bar">
    <svg class="dir-search-icon" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
    </svg>
    <input class="dir-search-input" type="text" placeholder="Поиск…" bind:value={searchText} />
    {#if searchText}
      <button class="dir-search-clear" on:click={() => searchText = ''}>✕</button>
    {/if}
  </div>

  <!-- Content -->
  {#if loading}
    <div class="dir-state">
      <div class="spinner"></div>
      <span>Загрузка…</span>
    </div>
  {:else if error}
    <div class="dir-state dir-state--error">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
      {error}
    </div>
  {:else if filtered.length === 0}
    <div class="dir-state">
      <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor" style="color:#d1d5db">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V7z" clip-rule="evenodd"/>
      </svg>
      <span style="color:var(--text-muted)">{searchText ? 'Ничего не найдено' : 'Нет записей'}</span>
    </div>

  <!-- ── Agencies table ── -->
  {:else if subView === 'agencies'}
    <div class="dir-table-wrap">
      <table class="dir-table">
        <thead>
          <tr>
            <th style="width:64px">ID</th>
            <th>Название</th>
            <th>Описание</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as r (r.id)}
            <tr class="dir-row">
              <td class="td-id">{r.id}</td>
              <td class="td-name">{r.name ?? '—'}</td>
              <td class="td-muted">{r.description ?? '—'}</td>
              <td class="td-actions">
                <button class="act-btn" title="Редактировать" on:click={() => openEdit(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                </button>
                <button class="act-btn act-btn--del" title="Удалить" on:click={() => deleteRow(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  <!-- ── Customers table ── -->
  {:else if subView === 'customers'}
    <div class="dir-table-wrap">
      <table class="dir-table">
        <thead>
          <tr>
            <th style="width:64px">ID</th>
            <th>Название</th>
            <th>ИНН</th>
            <th>Агентство</th>
            <th>Бюджет/мес</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as r (r.id)}
            <tr class="dir-row">
              <td class="td-id">{r.id}</td>
              <td class="td-name">
                <div>{r.name ?? '—'}</div>
                {#if r.accountDetails?.fullName}<div class="td-sub">{r.accountDetails.fullName}</div>{/if}
              </td>
              <td class="td-muted">{r.accountDetails?.inn || '—'}</td>
              <td class="td-muted">{r.agency?.name ?? '—'}</td>
              <td class="td-muted">{r.monthlyBudget ? r.monthlyBudget.toLocaleString('ru-RU') + ' ₽' : '—'}</td>
              <td class="td-actions">
                <button class="act-btn" title="Редактировать" on:click={() => openEdit(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                </button>
                <button class="act-btn act-btn--del" title="Удалить" on:click={() => deleteRow(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  <!-- ── Brands table ── -->
  {:else if subView === 'brands'}
    <div class="dir-table-wrap">
      <table class="dir-table">
        <thead>
          <tr>
            <th style="width:64px">ID</th>
            <th>Название</th>
            <th>Описание</th>
            <th>Рекламодатель</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as r (r.id)}
            <tr class="dir-row">
              <td class="td-id">{r.id}</td>
              <td class="td-name">{r.name ?? '—'}</td>
              <td class="td-muted">{r.description ?? '—'}</td>
              <td class="td-muted">{r.customer?.shortName ?? r.customer?.name ?? '—'}</td>
              <td class="td-actions">
                <button class="act-btn" title="Редактировать" on:click={() => openEdit(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                </button>
                <button class="act-btn act-btn--del" title="Удалить" on:click={() => deleteRow(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  <!-- ── Users table ── -->
  {:else if subView === 'users'}
    <div class="dir-table-wrap">
      <table class="dir-table">
        <thead>
          <tr>
            <th style="width:64px">ID</th>
            <th>Агентство</th>
            <th>Имя</th>
            <th>Email</th>
            <th>Создан</th>
            <th>Обновлён</th>
            <th style="width:80px">Активен</th>
            <th style="width:96px"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as r (r.id)}
            <tr class="dir-row">
              <td class="td-id">{r.id}</td>
              <td class="td-muted">{r.agency?.name ?? '—'}</td>
              <td class="td-name">{r.name ?? r.displayName ?? '—'}</td>
              <td style="font-size:12px">{r.email ?? '—'}</td>
              <td class="td-muted">{fmtDate(r.createdAt ?? r.created)}</td>
              <td class="td-muted">{fmtDate(r.updatedAt ?? r.updated)}</td>
              <td>
                <span class="active-badge" class:active-badge--yes={r.enabled !== false}>
                  {r.enabled !== false ? 'ДА' : 'НЕТ'}
                </span>
              </td>
              <td class="td-actions">
                <button class="act-btn" title="Редактировать" on:click={() => openEdit(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                </button>
                <button class="act-btn {r.enabled !== false ? 'act-btn--warn' : 'act-btn--ok'}"
                  title="{r.enabled !== false ? 'Деактивировать' : 'Активировать'}"
                  on:click={() => toggleUser(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
                </button>
                <button class="act-btn act-btn--del" title="Удалить" on:click={() => deleteRow(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  <!-- ── SSP table (generic — renders whatever fields the API returns) ── -->
  {:else if subView === 'ssp'}
    <div class="dir-table-wrap">
      <table class="dir-table">
        <thead>
          <tr>
            <th style="width:64px">ID</th>
            {#each sspColumns as col}
              <th>{col}</th>
            {/each}
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as r (r.id)}
            <tr class="dir-row">
              <td class="td-id">{r.id}</td>
              {#each sspColumns as col}
                <td style="font-size:12px">{r[col] ?? '—'}</td>
              {/each}
              <td class="td-actions">
                <button class="act-btn" title="Редактировать" on:click={() => openEdit(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                </button>
                <button class="act-btn act-btn--del" title="Удалить" on:click={() => deleteRow(r)}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- ── Modal ── -->
{#if modalOpen}
  <div class="modal-overlay" on:click|self={() => modalOpen = false}>
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">
          {modalMode === 'create' ? currentSection?.createLabel ?? 'Создать' : 'Редактировать'}
        </span>
        <button class="modal-close" on:click={() => modalOpen = false}>✕</button>
      </div>

      <div class="modal-body">
        <!-- Agencies form -->
        {#if subView === 'agencies'}
          <label class="field-label">Название <span class="req">*</span></label>
          <input class="field-input" type="text" bind:value={modalForm.name} placeholder="Введите название" />

          <label class="field-label" style="margin-top:12px">Описание</label>
          <textarea class="field-input" rows="2" bind:value={modalForm.description} placeholder="Необязательно"></textarea>

          <div class="field-section-title">Финансы</div>
          <label class="field-label">Месячный бюджет, ₽</label>
          <input class="field-input" type="number" min="0" bind:value={modalForm.monthlyBudget} placeholder="0" />

          <div class="field-section-title">Фоторепортаж</div>

          <label class="field-label">Режим сохранения</label>
          <select class="field-input" bind:value={modalForm.photoSaveMode}>
            <option value="BY_CAMPAIGN">По кампании</option>
            <option value="BY_ADVERTISER">По рекламодателю</option>
            <option value="ALL">Все</option>
          </select>

          <label class="field-label" style="margin-top:12px">Снимков на дисплей</label>
          <input class="field-input" type="number" min="1" bind:value={modalForm.photoCountPerDisplay} placeholder="1" />

          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            <label class="field-label" style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-size:13px;font-weight:500">
              <input type="checkbox" bind:checked={modalForm.photoSaveAll} />
              Сохранять все снимки
            </label>
            <label class="field-label" style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-size:13px;font-weight:500">
              <input type="checkbox" bind:checked={modalForm.photoExplicitlySet} />
              Явная настройка фото
            </label>
          </div>
        {/if}

        <!-- Name field (brands only) -->
        {#if subView === 'brands'}
          <label class="field-label">Название <span class="req">*</span></label>
          <input class="field-input" type="text" bind:value={modalForm.name} placeholder="Введите название" />
        {/if}

        <!-- Customers form -->
        {#if subView === 'customers'}
          <label class="field-label">Название <span class="req">*</span></label>
          <input class="field-input" type="text" bind:value={modalForm.name} placeholder="Название рекламодателя" />

          <label class="field-label" style="margin-top:12px">Агентство</label>
          <select class="field-input" bind:value={modalForm.agencyId}>
            <option value="">— не выбрано —</option>
            {#each agencyOptions as a}
              <option value={a.id}>{a.name}</option>
            {/each}
          </select>

          <div class="field-section-title">Юридические данные</div>

          <label class="field-label">Полное наименование</label>
          <input class="field-input" type="text" bind:value={modalForm.accFullName} placeholder="ООО «Пример»" />

          <div class="field-row-2">
            <div>
              <label class="field-label">ИНН</label>
              <input class="field-input" type="text" bind:value={modalForm.accInn} placeholder="7700000000" maxlength="12" />
            </div>
            <div>
              <label class="field-label">КПП</label>
              <input class="field-input" type="text" bind:value={modalForm.accKpp} placeholder="770001001" maxlength="9" />
            </div>
          </div>

          <label class="field-label" style="margin-top:12px">Юридический адрес</label>
          <input class="field-input" type="text" bind:value={modalForm.accAddress} placeholder="г. Москва, ул. Примерная, д. 1" />

          <div class="field-section-title">Финансы</div>

          <div class="field-row-2">
            <div>
              <label class="field-label">Месячный бюджет, ₽</label>
              <input class="field-input" type="number" min="0" bind:value={modalForm.monthlyBudget} placeholder="0" />
            </div>
            <div>
              <label class="field-label">Доп. надбавка, %</label>
              <input class="field-input" type="number" min="0" step="0.1" bind:value={modalForm.additionalCharge} placeholder="0" />
            </div>
          </div>

          <label class="field-label" style="margin-top:12px">
            <input type="checkbox" bind:checked={modalForm.keepBalance} style="margin-right:6px" />
            Сохранять баланс
          </label>
        {/if}

        <!-- Users form -->
        {#if subView === 'users'}
          <label class="field-label">Email <span class="req">*</span></label>
          <input class="field-input" type="email" bind:value={modalForm.email} placeholder="user@example.com" />
          <label class="field-label" style="margin-top:12px">Имя</label>
          <input class="field-input" type="text" bind:value={modalForm.name} placeholder="Имя пользователя" />
          <label class="field-label" style="margin-top:12px">Агентство</label>
          <select class="field-input" bind:value={modalForm.agencyId}>
            <option value="">— не выбрано —</option>
            {#each agencyOptions as a}
              <option value={a.id}>{a.name}</option>
            {/each}
          </select>
          {#if modalMode === 'create'}
            <label class="field-label" style="margin-top:12px">Пароль <span class="req">*</span></label>
            <input class="field-input" type="password" bind:value={modalForm.password} placeholder="••••••••" />
          {/if}
          <label class="field-label" style="margin-top:12px">
            <input type="checkbox" bind:checked={modalForm.enabled} style="margin-right:6px" />
            Активен
          </label>
        {/if}

        <!-- SSP form -->
        {#if subView === 'ssp'}
          <label class="field-label">Название <span class="req">*</span></label>
          <input class="field-input" type="text" bind:value={modalForm.name} placeholder="Название SSP" />
          <label class="field-label" style="margin-top:12px">URL</label>
          <input class="field-input" type="text" bind:value={modalForm.url} placeholder="https://…" />
        {/if}

        <!-- Description (brands only — agencies have their own section, customers have theirs) -->
        {#if subView === 'brands'}
          <label class="field-label" style="margin-top:12px">Описание</label>
          <textarea class="field-input" rows="3" bind:value={modalForm.description} placeholder="Необязательно"></textarea>
        {/if}
        <!-- Description for customers comes inside their section -->
        {#if subView === 'customers'}
          <label class="field-label" style="margin-top:12px">Описание</label>
          <textarea class="field-input" rows="2" bind:value={modalForm.description} placeholder="Необязательно"></textarea>
        {/if}

        {#if modalError}
          <div class="modal-error">{modalError}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" on:click={() => modalOpen = false}>Отмена</button>
        <button class="btn-save" on:click={saveModal} disabled={modalSaving}>
          {modalSaving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  </div>
{/if}
{/if}

<style>
  /* ── Landing ─────────────────────────────────────────────────────────────── */
  .dir-home {
    padding: 32px 36px 56px;
  }
  .dir-home-header {
    margin-bottom: 32px;
  }
  .dir-home-title {
    font-size: 24px;
    font-weight: 700;
    color: var(--text, #111827);
    margin: 0 0 6px;
  }
  .dir-home-sub {
    font-size: 13px;
    color: var(--text-muted, #6b7280);
    margin: 0;
  }
  .dir-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 16px;
  }
  .dir-card {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 14px;
    padding: 24px 22px 20px;
    cursor: pointer;
    text-align: left;
    transition: box-shadow 0.18s, border-color 0.18s, transform 0.12s;
    font-family: inherit;
    width: 100%;
    position: relative;
    overflow: hidden;
  }
  .dir-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--card-color, #3b82f6);
    opacity: 0;
    transition: opacity 0.18s;
  }
  .dir-card:hover {
    box-shadow: 0 6px 24px rgba(0,0,0,.1);
    border-color: #d1d5db;
    transform: translateY(-2px);
  }
  .dir-card:hover::before {
    opacity: 1;
  }
  .dir-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .dir-card-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--card-bg, #eff6ff);
    color: var(--card-color, #3b82f6);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .dir-card-count {
    font-size: 28px;
    font-weight: 700;
    color: var(--card-color, #3b82f6);
    line-height: 1;
    letter-spacing: -0.5px;
  }
  .dir-card-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text, #111827);
    margin-bottom: 6px;
    line-height: 1.3;
  }
  .dir-card-desc {
    font-size: 12px;
    color: var(--text-muted, #9ca3af);
    line-height: 1.45;
    flex: 1;
    margin-bottom: 16px;
  }
  .dir-card-cta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--card-color, #3b82f6);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .dir-card:hover .dir-card-cta {
    opacity: 1;
  }

  /* ── List page ───────────────────────────────────────────────────────────── */
  .dir-list {
    padding: 20px 28px 48px;
    max-width: 1200px;
  }
  .dir-list-top {
    margin-bottom: 20px;
  }
  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    cursor: pointer;
    font-family: inherit;
    padding: 0;
    margin-bottom: 10px;
    transition: color 0.15s;
  }
  .back-btn:hover { color: var(--text, #374151); }
  .dir-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .dir-list-heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dir-list-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .dir-list-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text, #111827);
    margin: 0;
  }
  .dir-list-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, #9ca3af);
    background: #f3f4f6;
    border-radius: 10px;
    padding: 2px 8px;
  }
  .btn-create {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--navy, #112853);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
    white-space: nowrap;
  }
  .btn-create:hover { opacity: 0.88; }

  /* ── Search ──────────────────────────────────────────────────────────────── */
  .dir-search-bar {
    position: relative;
    max-width: 360px;
    margin-bottom: 16px;
  }
  .dir-search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
    pointer-events: none;
  }
  .dir-search-input {
    width: 100%;
    height: 36px;
    padding: 0 32px 0 32px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    color: var(--text, #374151);
    outline: none;
    background: #fff;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .dir-search-input:focus { border-color: #3b82f6; }
  .dir-search-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    font-size: 11px;
    color: #9ca3af;
    cursor: pointer;
    padding: 2px 4px;
  }
  .dir-search-clear:hover { color: #374151; }

  /* ── State ───────────────────────────────────────────────────────────────── */
  .dir-state {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 48px 0;
    color: var(--text-muted, #9ca3af);
    font-size: 13px;
  }
  .dir-state--error { color: #ef4444; }
  .spinner {
    width: 18px; height: 18px;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Table ───────────────────────────────────────────────────────────────── */
  .dir-table-wrap {
    overflow-x: auto;
    background: #fff;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
  }
  .dir-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .dir-table thead th {
    background: #f9fafb;
    padding: 10px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #6b7280);
    border-bottom: 1px solid var(--border, #e5e7eb);
    white-space: nowrap;
  }
  .dir-row td {
    padding: 11px 14px;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }
  .dir-row:last-child td { border-bottom: none; }
  .dir-row:hover td { background: #fafafa; }
  .td-id {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #9ca3af);
  }
  .td-name {
    font-weight: 500;
    color: var(--text, #111827);
  }
  .td-muted {
    font-size: 12px;
    color: var(--text-muted, #6b7280);
  }
  .td-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
  }
  .act-btn {
    width: 28px; height: 28px;
    border-radius: 6px;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #9ca3af);
    transition: background 0.12s, color 0.12s;
  }
  .act-btn:hover         { background: #f3f4f6; color: var(--text, #374151); }
  .act-btn--del:hover    { background: #fef2f2; color: #ef4444; }
  .act-btn--warn:hover   { background: #fef9f0; color: #f59e0b; }
  .act-btn--ok:hover     { background: #f0fdf4; color: #16a34a; }

  .active-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    background: #fee2e2;
    color: #dc2626;
  }
  .active-badge--yes {
    background: #dcfce7;
    color: #16a34a;
  }

  /* ── Modal ───────────────────────────────────────────────────────────────── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal {
    background: #fff;
    border-radius: 12px;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }
  .modal-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text, #111827);
  }
  .modal-close {
    background: none;
    border: none;
    font-size: 14px;
    color: var(--text-muted, #9ca3af);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }
  .modal-close:hover { background: #f3f4f6; color: var(--text, #374151); }
  .modal-body {
    padding: 20px;
  }
  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #6b7280);
    margin-bottom: 5px;
  }
  .req { color: #ef4444; }
  .field-input {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 7px;
    font-size: 13px;
    font-family: inherit;
    color: var(--text, #374151);
    background: #fff;
    outline: none;
    box-sizing: border-box;
    resize: vertical;
    transition: border-color 0.15s;
  }
  .field-input:focus { border-color: #3b82f6; }
  select.field-input { cursor: pointer; }
  .field-section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #6b7280);
    margin: 18px 0 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }
  .field-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 12px;
  }
  .td-sub {
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
    margin-top: 2px;
  }
  .modal-error {
    margin-top: 12px;
    padding: 9px 12px;
    background: #fef2f2;
    border-radius: 7px;
    font-size: 12px;
    color: #dc2626;
  }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--border, #e5e7eb);
    background: #f9fafb;
  }
  .btn-cancel {
    background: none;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 7px;
    padding: 7px 16px;
    font-size: 13px;
    font-family: inherit;
    color: var(--text-muted, #6b7280);
    cursor: pointer;
    transition: background 0.12s;
  }
  .btn-cancel:hover { background: #f3f4f6; }
  .btn-save {
    background: var(--navy, #112853);
    border: none;
    border-radius: 7px;
    padding: 7px 20px;
    font-size: 13px;
    font-family: inherit;
    color: #fff;
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.12s;
  }
  .btn-save:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-save:hover:not(:disabled) { opacity: 0.88; }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 1200px) {
    .dir-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 800px) {
    .dir-grid { grid-template-columns: 1fr 1fr; }
    .dir-home { padding: 16px; }
    .dir-list { padding: 16px 16px 32px; }
  }
  @media (max-width: 520px) {
    .dir-grid { grid-template-columns: 1fr; }
  }
</style>
