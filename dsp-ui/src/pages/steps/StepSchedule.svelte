<script>
  import { createEventDispatcher } from 'svelte'
  import ScheduleModal from '../../components/ScheduleModal.svelte'
  const dispatch = createEventDispatcher()

  export let draft

  // ── Init ──────────────────────────────────────────────────────────────
  if (!draft.schedule)        draft.schedule        = null  // global bool[7][24]
  if (!draft.screenSchedules) draft.screenSchedules = {}    // { [id]: bool[7][24] }

  // ── Screens from cache ────────────────────────────────────────────────
  let screens = []
  $: {
    const cacheKey = (draft.cities ?? []).length > 0
      ? [...draft.cities].sort().join('|')
      : '__all__'
    const cached = window._dspScreensCache?.[cacheKey] ?? []
    screens = cached.filter(s => draft.screenIds.includes(s.id))
  }

  // ── Effective schedule per screen ─────────────────────────────────────
  function effectiveSchedule(id) {
    return draft.screenSchedules[id] ?? draft.schedule
  }

  // ── Modal state ───────────────────────────────────────────────────────
  let globalModalOpen = false
  let editingId       = null   // null = no per-screen modal open
  let applyModalOpen  = false  // bulk-apply modal for checked screens

  function openGlobal()  { globalModalOpen = true }
  function openScreen(id) { editingId = id }

  function onGlobalSave(e) {
    draft.schedule = e.detail
    globalModalOpen = false
  }
  function onScreenSave(e) {
    draft.screenSchedules = { ...draft.screenSchedules, [editingId]: e.detail }
    editingId = null
  }
  function clearScreenOverride(id) {
    const { [id]: _, ...rest } = draft.screenSchedules
    draft.screenSchedules = rest
  }

  // ── Schedule formatter ────────────────────────────────────────────────
  const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
  function pad(n) { return String(n).padStart(2, '0') }

  function getHourRanges(row) {
    const ranges = []
    let start = -1
    for (let h = 0; h <= 24; h++) {
      const on = h < 24 && row[h]
      if (on && start === -1) { start = h }
      else if (!on && start !== -1) { ranges.push(`${pad(start)}–${pad(h)}`); start = -1 }
    }
    return ranges
  }

  function formatSchedule(sched) {
    if (!sched) return 'Все часы'
    if (sched.every(r => r.every(Boolean)))  return 'Все часы'
    if (sched.every(r => r.every(v => !v)))  return '—'

    const dayRanges = sched.map(row => getHourRanges(row).join(', '))

    const parts = []
    let i = 0
    while (i < 7) {
      if (!dayRanges[i]) { i++; continue }
      let j = i + 1
      while (j < 7 && dayRanges[j] === dayRanges[i]) j++
      const dayStr = i === j - 1
        ? DAY_NAMES[i]
        : `${DAY_NAMES[i]}–${DAY_NAMES[j - 1]}`
      parts.push(`${dayStr} ${dayRanges[i]}`)
      i = j
    }
    return parts.join(' | ') || '—'
  }

  // ── Checkboxes ────────────────────────────────────────────────────────
  let checkedIds = new Set()
  $: allChecked  = screens.length > 0 && screens.every(s => checkedIds.has(s.id))
  $: someChecked = screens.some(s => checkedIds.has(s.id))

  function toggleCheck(id) {
    const s = new Set(checkedIds)
    s.has(id) ? s.delete(id) : s.add(id)
    checkedIds = s
  }
  function toggleAll() {
    if (allChecked) { checkedIds = new Set() }
    else { checkedIds = new Set(screens.map(s => s.id)) }
  }

  // Apply a schedule to checked screens (or all if none checked)
  function applyToChecked(sched) {
    const targets = someChecked
      ? screens.filter(s => checkedIds.has(s.id)).map(s => s.id)
      : screens.map(s => s.id)
    const overrides = { ...draft.screenSchedules }
    for (const id of targets) overrides[id] = sched.map(r => [...r])
    draft.screenSchedules = overrides
  }

  // Has per-screen override?
  function hasOverride(id) { return id in draft.screenSchedules }

  // ── Formatters ─────────────────────────────────────────────────────────
  function fmt(n, dec = 2) {
    if (n == null || isNaN(n)) return '—'
    return n.toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  }
</script>

<div class="sched-shell">

  <!-- ── Header ── -->
  <div class="sched-header">
    <p class="sched-desc">
      Настройте расписание показов для каждого экрана. По умолчанию используется общий график.
    </p>
    <div class="sched-top-row">
      <!-- Global schedule setter -->
      <button class="btn-global" on:click={openGlobal}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
        </svg>
        Общий график
        {#if draft.schedule}
          <span class="btn-global-val">· {formatSchedule(draft.schedule)}</span>
        {:else}
          <span class="btn-global-val">· Все часы</span>
        {/if}
      </button>

      <!-- Apply checked (shown when something is checked) -->
      {#if someChecked}
        <button class="btn-apply-checked" on:click={() => {
          // open a temporary modal to pick schedule for selected screens
          applyModalOpen = true
        }}>
          Применить к выбранным ({[...checkedIds].length})
        </button>
        <button class="btn-reset-checked" on:click={() => {
          for (const id of checkedIds) clearScreenOverride(id)
        }}>
          Сбросить выбранные
        </button>
      {/if}
    </div>
  </div>

  <!-- ── Table ── -->
  <div class="sched-table-wrap">
    {#if screens.length === 0}
      <div class="sched-empty">
        <span>Нет выбранных экранов</span>
        <button class="sched-back-link" on:click={() => dispatch('back')}>← Выбрать экраны</button>
      </div>
    {:else}
      <table class="sched-table">
        <thead>
          <tr>
            <th class="th-chk">
              <input type="checkbox" checked={allChecked} indeterminate={someChecked && !allChecked}
                on:change={toggleAll} />
            </th>
            <th class="th-thumb"></th>
            <th class="th-gid">GID</th>
            <th class="th-addr">Адрес</th>
            <th class="th-city">Город</th>
            <th class="th-fmt">Формат</th>
            <th class="th-sched">График показов</th>
            <th class="th-act"></th>
          </tr>
        </thead>
        <tbody>
          {#each screens as s (s.id)}
            {@const sched = effectiveSchedule(s.id)}
            {@const override = hasOverride(s.id)}
            {@const checked = checkedIds.has(s.id)}
            <tr class="sched-row"
              class:sched-row-override={override && !checked}
              class:sched-row-checked={checked}>

              <!-- Checkbox -->
              <td class="td-chk" on:click|stopPropagation>
                <input type="checkbox" {checked} on:change={() => toggleCheck(s.id)} />
              </td>

              <!-- Thumbnail -->
              <td class="td-thumb">
                {#if s.photo}
                  <img src={s.photo} alt="" class="thumb-img" loading="lazy" />
                {:else}
                  <div class="thumb-ph">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="color:var(--border)">
                      <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                {/if}
              </td>

              <!-- GID -->
              <td class="td-gid">{s.gid || s.id}</td>

              <!-- Address -->
              <td class="td-addr">{s.address || '—'}</td>

              <!-- City -->
              <td class="td-muted">{s.city || '—'}</td>

              <!-- Format -->
              <td class="td-muted">{s.format || '—'}</td>

              <!-- Schedule — click to edit -->
              <td class="td-sched" on:click={() => openScreen(s.id)}>
                <div class="sched-val" class:sched-val-override={override}>
                  {#if override}
                    <span class="override-dot" title="Индивидуальный график"></span>
                  {/if}
                  <span>{formatSchedule(sched)}</span>
                  <svg class="edit-icon" width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                  </svg>
                </div>
              </td>

              <!-- Clear override -->
              <td class="td-act" on:click|stopPropagation>
                {#if override}
                  <button class="btn-clear-override" title="Сбросить до общего графика"
                    on:click={() => clearScreenOverride(s.id)}>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                    </svg>
                  </button>
                {/if}
              </td>

            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- ── Nav ── -->
  <div class="sched-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <div class="sched-nav-right">
      <span class="sched-nav-count">
        {screens.length} экран{screens.length === 1 ? '' : screens.length < 5 ? 'а' : 'ов'}
      </span>
      <button class="btn-draft" on:click={() => dispatch('save')}>Сохранить черновик</button>
      <button class="btn-next" on:click={() => dispatch('next')}>Далее</button>
    </div>
  </div>
</div>

<!-- ── Modals ── -->
{#if globalModalOpen}
  <ScheduleModal
    schedule={draft.schedule}
    on:save={onGlobalSave}
    on:cancel={() => globalModalOpen = false}
  />
{/if}

{#if editingId !== null}
  <ScheduleModal
    schedule={effectiveSchedule(editingId)}
    on:save={onScreenSave}
    on:cancel={() => editingId = null}
  />
{/if}

{#if applyModalOpen}
  <ScheduleModal
    schedule={draft.schedule}
    on:save={(e) => { applyToChecked(e.detail); applyModalOpen = false }}
    on:cancel={() => applyModalOpen = false}
  />
{/if}

<style>
  .sched-shell {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; background: var(--bg);
  }

  /* ── Header ── */
  .sched-header {
    padding: 14px 24px 12px;
    background: white;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .sched-desc {
    font-size: 12.5px; color: var(--text-muted);
    margin: 0 0 10px; line-height: 1.5;
  }
  .sched-top-row { display: flex; align-items: center; gap: 10px; }

  .btn-global {
    display: flex; align-items: center; gap: 6px;
    height: 32px; padding: 0 14px;
    border: 1.5px solid var(--border); border-radius: 8px;
    background: white; font-size: 12.5px; font-family: inherit; font-weight: 500;
    color: var(--text); cursor: pointer;
    transition: border-color .12s, color .12s;
  }
  .btn-global:hover { border-color: var(--navy); color: var(--navy); }
  .btn-global-val {
    color: var(--text-muted); font-weight: 400;
    max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .btn-apply-checked {
    height: 32px; padding: 0 14px;
    background: var(--navy); color: white;
    border: none; border-radius: 8px;
    font-size: 12.5px; font-family: inherit; font-weight: 600;
    cursor: pointer; transition: background .15s;
  }
  .btn-apply-checked:hover { background: #1e3a6e; }

  .btn-reset-checked {
    height: 32px; padding: 0 14px;
    border: 1.5px solid #CBD5E1; border-radius: 8px;
    background: white; font-size: 12.5px; font-family: inherit; font-weight: 500;
    color: var(--text-muted); cursor: pointer;
    transition: border-color .12s, color .12s;
  }
  .btn-reset-checked:hover { border-color: #EF4444; color: #EF4444; }

  /* ── Table ── */
  .sched-table-wrap { flex: 1; overflow-y: auto; background: white; }

  .sched-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px; height: 100%;
    color: var(--text-muted); font-size: 14px;
  }
  .sched-back-link {
    background: none; border: none; color: var(--navy);
    font-size: 13px; cursor: pointer; font-family: inherit;
  }

  .sched-table {
    width: 100%; border-collapse: collapse; font-size: 12.5px;
  }
  .sched-table thead {
    position: sticky; top: 0; background: var(--bg); z-index: 2;
  }
  .sched-table thead th {
    padding: 7px 10px;
    text-align: left; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  /* Column widths */
  .th-chk  { width: 36px; }
  .th-thumb { width: 68px; }
  .th-gid   { width: 100px; }
  .th-addr  { min-width: 180px; }
  .th-city  { width: 110px; }
  .th-fmt   { width: 110px; }
  .th-sched { min-width: 240px; }
  .th-act   { width: 36px; }

  .sched-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  /* Row states */
  .sched-row { transition: background .1s; }
  .sched-row:hover td { background: var(--navy-light); }
  .sched-row-checked td { background: #EFF6FF; }
  .sched-row-checked:hover td { background: #DBEAFE; }
  .sched-row-override td { background: #F0FDF4; }
  .sched-row-override:hover td { background: #DCFCE7; }

  .td-chk { padding: 6px 10px; }

  /* Thumbnail */
  .td-thumb { padding: 6px 8px; }
  .thumb-img {
    width: 58px; height: 36px; object-fit: cover;
    border-radius: 4px; display: block;
  }
  .thumb-ph {
    width: 58px; height: 36px; border-radius: 4px;
    background: var(--bg); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
  }

  /* GID */
  .td-gid {
    font-family: monospace; font-size: 11px;
    font-weight: 600; color: var(--text-muted); white-space: nowrap;
  }

  /* Address */
  .td-addr {
    font-weight: 600; color: var(--text);
    max-width: 240px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }

  .td-muted { color: var(--text-muted); white-space: nowrap; }

  /* Schedule cell */
  .td-sched { cursor: pointer; }
  .sched-val {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12.5px; color: var(--text);
    border-radius: 6px; padding: 3px 6px; margin: -3px -6px;
    transition: background .12s;
  }
  .td-sched:hover .sched-val { background: #EFF6FF; }
  .sched-val-override { color: #16A34A; }

  .override-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #16A34A; flex-shrink: 0;
  }

  .edit-icon {
    color: var(--text-muted); flex-shrink: 0; opacity: 0;
    transition: opacity .12s;
  }
  .td-sched:hover .edit-icon { opacity: 1; }

  /* Clear override button */
  .td-act { padding: 4px 6px; }
  .btn-clear-override {
    width: 26px; height: 26px; border: none; background: none;
    cursor: pointer; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-muted); opacity: 0;
    transition: opacity .12s, background .12s;
  }
  .sched-row:hover .btn-clear-override { opacity: 1; }
  .btn-clear-override:hover { background: #FEE2E2; color: #EF4444; }

  /* ── Nav ── */
  .sched-nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 24px;
    border-top: 1px solid var(--border);
    background: white; flex-shrink: 0;
  }
  .sched-nav-right { display: flex; align-items: center; gap: 10px; }
  .sched-nav-count { font-size: 12px; color: var(--text-muted); }

  .btn-back {
    height: 34px; padding: 0 16px;
    border: 1.5px solid var(--border); border-radius: 7px;
    background: white; font-size: 13px; font-family: inherit;
    color: var(--text); cursor: pointer; font-weight: 500;
  }
  .btn-back:hover { border-color: var(--navy); color: var(--navy); }

  .btn-draft {
    height: 34px; padding: 0 16px;
    border: 1.5px solid var(--border); border-radius: 7px;
    background: white; font-size: 13px; font-family: inherit;
    color: var(--text); cursor: pointer; font-weight: 500;
  }
  .btn-draft:hover { border-color: var(--navy); color: var(--navy); }

  .btn-next {
    height: 34px; padding: 0 22px;
    background: var(--navy); color: white;
    border: none; border-radius: 7px;
    font-size: 13px; font-family: inherit; font-weight: 600;
    cursor: pointer; transition: background .15s;
  }
  .btn-next:hover { background: #1e3a6e; }
</style>
