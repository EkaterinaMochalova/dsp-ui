<script>
  import { createEventDispatcher, onMount } from 'svelte'
  const dispatch = createEventDispatcher()

  export let schedule = null   // bool[7][24] | null

  const DAYS  = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
  const HOURS = Array.from({ length: 24 }, (_, i) => i)

  // Hour label: "00–01", "01–02", etc.
  function hLabel(h) {
    const s = String(h).padStart(2, '0')
    const e = String((h + 1) % 24).padStart(2, '0')
    return [s, e]
  }

  function makeEmpty() {
    return Array.from({ length: 7 }, () => new Array(24).fill(false))
  }
  function initLocal() {
    if (schedule && schedule.length === 7) return schedule.map(r => [...r])
    // Default: everything selected
    return Array.from({ length: 7 }, () => new Array(24).fill(true))
  }
  let local = initLocal()

  // ── Derived state ────────────────────────────────────────────────────
  $: totalSlots    = 7 * 24
  $: selectedCount = local.reduce((a, row) => a + row.filter(Boolean).length, 0)
  $: allSelected   = selectedCount === totalSlots
  $: dayOn = local.map(row => row.some(Boolean))

  // ── Drag ──────────────────────────────────────────────────────────────
  let dragging = false
  let dragFill = true

  function cellDown(d, h, e) {
    e.preventDefault()
    dragging = true
    dragFill = !local[d][h]
    local[d][h] = dragFill
    local = local
  }
  function cellEnter(d, h) {
    if (!dragging) return
    local[d][h] = dragFill
    local = local
  }
  function stopDrag() { dragging = false }

  onMount(() => {
    window.addEventListener('mouseup', stopDrag)
    return () => window.removeEventListener('mouseup', stopDrag)
  })

  // ── Toolbar actions ──────────────────────────────────────────────────
  function toggleAll() {
    if (allSelected) local = makeEmpty()
    else local = Array.from({ length: 7 }, () => new Array(24).fill(true))
  }

  function toggleDay(d) {
    const allOn = local[d].every(Boolean)
    local[d] = new Array(24).fill(!allOn)
    local = local
  }

  function toggleHour(h) {
    const allOn = local.every(row => row[h])
    local = local.map(row => { const r = [...row]; r[h] = !allOn; return r })
  }

  // Toggle: if every cell in the preset is already on → clear them; otherwise fill them
  function applyHours(hours) {
    const set = new Set(hours)
    const allOn = local.every(row => hours.every(h => row[h]))
    local = local.map(row => row.map((v, h) => set.has(h) ? !allOn : v))
  }

  // True when every cell in this preset is on across all days
  function isPresetActive(hours) {
    return local.every(row => hours.every(h => row[h]))
  }

  function range(a, b) { // a inclusive, b exclusive
    const r = []
    for (let h = a; h < b; h++) r.push(h)
    return r
  }

  // Утро 6–11, День 11–17, Вечер 17–23, Ночь 23–6 (wraps), Прайм-тайм 7–11 + 17–21
  const PRESETS = [
    { label: 'Утро',       hours: range(6, 11) },
    { label: 'День',       hours: range(11, 17) },
    { label: 'Вечер',      hours: range(17, 23) },
    { label: 'Ночь',       hours: [...range(23, 24), ...range(0, 6)] },
    { label: 'Прайм-тайм', hours: [...range(7, 11), ...range(17, 21)] },
  ]

  // ── Save / Cancel ─────────────────────────────────────────────────────
  function save()   { dispatch('save',   local.map(r => [...r])) }
  function cancel() { dispatch('cancel') }
</script>

<svelte:window on:mouseup={stopDrag} />

<div class="backdrop" on:mousedown|self={cancel} role="dialog" aria-modal="true">
  <div class="modal" on:mousedown|stopPropagation>

    <!-- ── Header ── -->
    <div class="modal-head">
      <div class="modal-head-text">
        <h3 class="modal-title">График вещания</h3>
      </div>
      <button class="close-btn" on:click={cancel} title="Закрыть">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>

    <!-- ── Subtitle ── -->
    <p class="modal-sub">Вы можете выбрать график вещания для всех добавленных в кампанию экранов.</p>

    <!-- ── Content box (dashed border) ── -->
    <div class="content-box">

      <!-- Toolbar -->
      <div class="toolbar">
        <button class="tbr-btn tbr-toggle" on:click={toggleAll}>
          {allSelected ? 'Отменить все' : 'Выбрать все'}
        </button>
        <div class="tbr-sep"></div>
        {#each PRESETS as p}
          <button
            class="tbr-btn tbr-preset"
            class:tbr-preset-on={isPresetActive(p.hours)}
            on:click={() => applyHours(p.hours)}
          >{p.label}</button>
        {/each}
      </div>

      <!-- Grid -->
      <div class="grid-wrap" on:mouseleave={stopDrag}>

        <!-- Day rows -->
        {#each DAYS as day, d}
          <div class="sched-row">
            <div class="day-label" on:click={() => toggleDay(d)} title="Выбрать/снять {day}">
              {day}
            </div>
            <div class="cells-row">
              {#each HOURS as h}
                <button
                  class="sched-cell"
                  class:cell-on={local[d][h]}
                  on:mousedown={(e) => cellDown(d, h, e)}
                  on:mouseenter={() => cellEnter(d, h)}
                  tabindex="-1"
                >
                  {#if local[d][h]}
                    <svg class="check-icon" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}

        <!-- Hour labels row -->
        <div class="hour-row">
          <div class="day-spacer"></div>
          <div class="hours-labels">
            {#each HOURS as h}
              {@const [s, e] = hLabel(h)}
              <div class="hour-label" on:click={() => toggleHour(h)} title="Выбрать/снять {s}–{e}">
                <span>{s}</span>
                <span>{e}</span>
              </div>
            {/each}
          </div>
        </div>

      </div>

    </div><!-- /content-box -->

    <!-- ── Footer ── -->
    <div class="modal-footer">
      <button class="btn-cancel" on:click={cancel}>Отменить</button>
      <button class="btn-save"   on:click={save}>Сохранить</button>
    </div>

  </div>
</div>

<style>
  /* ── Backdrop ── */
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, .4);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  }

  /* ── Modal ── */
  .modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, .2);
    display: flex; flex-direction: column;
    width: min(1160px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow: hidden;
  }

  /* ── Header ── */
  .modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px 0;
    flex-shrink: 0;
  }
  .modal-title {
    margin: 0;
    font-size: 18px; font-weight: 700; color: var(--navy);
  }
  .close-btn {
    width: 30px; height: 30px;
    border: none; background: none; cursor: pointer;
    border-radius: 6px; color: var(--text-muted);
    display: flex; align-items: center; justify-content: center;
    transition: background .12s, color .12s;
    flex-shrink: 0;
  }
  .close-btn:hover { background: var(--bg); color: var(--text); }

  /* ── Subtitle ── */
  .modal-sub {
    margin: 6px 24px 14px;
    font-size: 12.5px; color: var(--text-muted); line-height: 1.45;
    flex-shrink: 0;
  }

  /* ── Content box (dashed) ── */
  .content-box {
    margin: 0 16px;
    border: 1.5px dashed #B0C4DE;
    border-radius: 10px;
    overflow: hidden;
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 10px 14px;
    border-bottom: 1.5px dashed #B0C4DE;
    flex-shrink: 0;
  }
  .tbr-sep {
    width: 1px; height: 20px;
    background: #CBD5E1; margin: 0 2px; flex-shrink: 0;
  }
  .tbr-btn {
    height: 30px; padding: 0 14px;
    border: 1px solid #CBD5E1; border-radius: 20px;
    background: white; font-size: 13px; font-family: inherit; font-weight: 500;
    color: #475569; cursor: pointer; white-space: nowrap;
    transition: all .13s;
  }
  .tbr-btn:hover { border-color: var(--navy); color: var(--navy); background: #EFF6FF; }
  .tbr-toggle {
    font-weight: 600; color: #1E40AF;
    border-color: #93C5FD; background: #EFF6FF;
  }
  .tbr-toggle:hover { background: #DBEAFE; border-color: #3B82F6; }

  .tbr-preset-on {
    border-color: #1E293B; color: #1E293B; font-weight: 600;
  }
  .tbr-preset-on:hover { border-color: #1E293B; background: #F1F5F9; }

  /* ── Grid ── */
  .grid-wrap {
    flex: 1; overflow: auto;
    padding: 10px 14px 8px;
    user-select: none; -webkit-user-select: none;
    display: flex; flex-direction: column; gap: 3px;
  }

  /* Day row */
  .sched-row {
    display: flex; align-items: stretch; gap: 0;
  }

  /* Day label */
  .day-label {
    flex-shrink: 0;
    width: 34px;
    display: flex; align-items: center; justify-content: flex-end;
    padding-right: 8px;
    font-size: 13px; font-weight: 600;
    color: #475569; white-space: nowrap;
    cursor: pointer;
    transition: color .12s;
  }
  .day-label:hover { color: var(--navy); }

  /* Cells row (24 cells) */
  .cells-row {
    flex: 1; display: flex; gap: 3px;
  }

  /* Each hour cell */
  .sched-cell {
    flex: 1; height: 36px;
    min-width: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid #CBD5E1;
    border-radius: 8px;
    background: #F1F5F9;
    cursor: crosshair;
    color: #94A3B8;
    padding: 0;
    transition: background .07s, border-color .07s;
  }
  .sched-cell:hover:not(.cell-on) {
    background: #DBEAFE; border-color: #93C5FD;
  }
  .cell-on {
    background: #BFDBFE; border-color: #60A5FA; color: #1D4ED8;
  }
  .cell-on:hover { background: #93C5FD; border-color: #3B82F6; }

  .check-icon {
    width: 12px; height: 10px;
    pointer-events: none; flex-shrink: 0;
  }

  /* Hour labels row */
  .hour-row {
    display: flex; align-items: flex-start;
  }
  .day-spacer { flex-shrink: 0; width: 34px; }
  .hours-labels {
    flex: 1; display: flex; gap: 3px;
  }
  .hour-label {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; align-items: center;
    font-size: 9px; color: #94A3B8;
    line-height: 1.3; padding-top: 4px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color .12s;
  }
  .hour-label:hover { color: var(--navy); }

  /* ── Footer ── */
  .modal-footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    padding: 14px 24px;
    flex-shrink: 0;
  }
  .btn-cancel {
    height: 36px; padding: 0 20px;
    border: 1.5px solid #CBD5E1; border-radius: 8px;
    background: white; font-size: 13px; font-family: inherit; font-weight: 500;
    color: #475569; cursor: pointer;
    transition: border-color .12s, color .12s;
  }
  .btn-cancel:hover { border-color: var(--navy); color: var(--navy); }
  .btn-save {
    height: 36px; padding: 0 26px;
    background: var(--navy); color: white;
    border: none; border-radius: 8px;
    font-size: 13px; font-family: inherit; font-weight: 600;
    cursor: pointer; transition: background .15s;
  }
  .btn-save:hover { background: #1e3a6e; }
</style>
