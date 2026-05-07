<script>
  import { createEventDispatcher, onMount } from 'svelte'
  const dispatch = createEventDispatcher()

  export let schedule = null   // bool[7][24] | null

  const DAYS  = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
  const HOURS = Array.from({ length: 24 }, (_, i) => i)

  function makeEmpty() {
    return Array.from({ length: 7 }, () => new Array(24).fill(false))
  }
  function initLocal() {
    if (schedule && schedule.length === 7) return schedule.map(r => [...r])
    return makeEmpty()
  }
  let local = initLocal()

  // ── Drag ──────────────────────────────────────────────────────────────
  let dragging = false
  let dragFill  = true  // true = fill, false = erase

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

  // ── Toolbar actions ───────────────────────────────────────────────────
  function selectAll() { local = Array.from({ length: 7 }, () => new Array(24).fill(true)) }
  function clearAll()  { local = makeEmpty() }

  function toggleDay(d) {
    const allOn = local[d].every(v => v)
    local[d] = new Array(24).fill(!allOn)
    local = local
  }
  $: dayOn = local.map(row => row.some(v => v))

  // Presets: fill hours h0..h1-1 across all days (additive)
  function applyRange(h0, h1) {
    local = local.map(row => row.map((v, h) => (h >= h0 && h < h1) ? true : v))
  }

  // ── Footer ────────────────────────────────────────────────────────────
  function save()   { dispatch('save',   local.map(r => [...r])) }
  function cancel() { dispatch('cancel') }

  // ── Summary: count selected slots ─────────────────────────────────────
  $: selectedCount = local.reduce((acc, row) => acc + row.filter(Boolean).length, 0)
</script>

<svelte:window on:mouseup={stopDrag} />

<!-- Backdrop -->
<div class="sched-backdrop" on:mousedown|self={cancel} role="dialog" aria-modal="true">
  <div class="sched-modal" on:mousedown|stopPropagation>

    <!-- ── Header ── -->
    <div class="sched-head">
      <div>
        <h3 class="sched-title">График вещания</h3>
        <p class="sched-sub">Вы можете выбрать график вещания для всех добавленных к кампании экранов</p>
      </div>
      <button class="sched-close" on:click={cancel} title="Закрыть">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>

    <!-- ── Toolbar ── -->
    <div class="sched-toolbar">
      <!-- Global -->
      <button class="tbr-btn tbr-all" on:click={selectAll}>Отметить всё</button>
      <button class="tbr-btn tbr-clear" on:click={clearAll}>Сбросить</button>

      <div class="tbr-sep"></div>

      <!-- Days -->
      {#each DAYS as day, d}
        <button
          class="tbr-btn tbr-day"
          class:tbr-day-on={dayOn[d]}
          on:click={() => toggleDay(d)}
        >{day}</button>
      {/each}

      <div class="tbr-sep"></div>

      <!-- Time presets -->
      <button class="tbr-btn tbr-preset" on:click={() => applyRange(8, 13)}>
        Прайм <span class="preset-time">8–13</span>
      </button>
      <button class="tbr-btn tbr-preset" on:click={() => applyRange(13, 16)}>
        День <span class="preset-time">13–16</span>
      </button>
      <button class="tbr-btn tbr-preset" on:click={() => applyRange(16, 24)}>
        Вечер <span class="preset-time">16–24</span>
      </button>
    </div>

    <!-- ── Grid ── -->
    <div class="sched-grid-wrap">
      <table class="sched-table">
        <tbody>
          {#each DAYS as day, d}
            <tr class="sched-row">
              <td class="sched-day-label">{day}</td>
              {#each HOURS as h}
                <td
                  class="sched-cell"
                  class:sched-on={local[d][h]}
                  on:mousedown={(e) => cellDown(d, h, e)}
                  on:mouseenter={() => cellEnter(d, h)}
                ></td>
              {/each}
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr class="sched-row-hours">
            <td></td>
            {#each HOURS as h}
              <td class="sched-h-label">{h}</td>
            {/each}
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- ── Footer ── -->
    <div class="sched-footer">
      <span class="sched-count">
        {#if selectedCount > 0}
          Выбрано слотов: <strong>{selectedCount}</strong> из 168
        {:else}
          Не выбрано ни одного слота
        {/if}
      </span>
      <div class="sched-footer-btns">
        <button class="btn-cancel" on:click={cancel}>Отменить</button>
        <button class="btn-save"   on:click={save}>Сохранить</button>
      </div>
    </div>
  </div>
</div>

<style>
  /* ── Backdrop ── */
  .sched-backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, .45);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  /* ── Modal container ── */
  .sched-modal {
    background: white;
    border-radius: 14px;
    box-shadow: 0 16px 56px rgba(0, 0, 0, .22);
    display: flex; flex-direction: column;
    width: min(860px, calc(100vw - 40px));
    max-height: calc(100vh - 60px);
    overflow: hidden;
  }

  /* ── Header ── */
  .sched-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 20px 24px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .sched-title {
    margin: 0 0 4px;
    font-size: 15px; font-weight: 700; color: var(--navy);
  }
  .sched-sub {
    margin: 0;
    font-size: 12px; color: var(--text-muted); line-height: 1.45;
  }
  .sched-close {
    flex-shrink: 0; margin-left: 16px; margin-top: 2px;
    width: 28px; height: 28px;
    border: none; background: none; cursor: pointer;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-muted);
    transition: background .12s, color .12s;
  }
  .sched-close:hover { background: var(--bg); color: var(--text); }

  /* ── Toolbar ── */
  .sched-toolbar {
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
    padding: 10px 24px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .tbr-sep {
    width: 1px; height: 20px;
    background: var(--border); margin: 0 4px; flex-shrink: 0;
  }

  .tbr-btn {
    height: 28px; padding: 0 10px;
    border: 1.5px solid var(--border); border-radius: 6px;
    background: white; font-size: 12px; font-family: inherit; font-weight: 500;
    color: var(--text); cursor: pointer; white-space: nowrap;
    display: flex; align-items: center; gap: 4px;
    transition: border-color .12s, background .12s, color .12s;
  }
  .tbr-btn:hover { border-color: var(--navy); color: var(--navy); }

  .tbr-all   { background: var(--navy); color: white; border-color: var(--navy); }
  .tbr-all:hover { background: #1e3a6e; border-color: #1e3a6e; color: white; }

  .tbr-clear { color: var(--text-muted); }
  .tbr-clear:hover { color: #EF4444; border-color: #EF4444; }

  .tbr-day   { min-width: 34px; justify-content: center; }
  .tbr-day-on {
    background: #EFF6FF; border-color: #2563EB; color: #2563EB; font-weight: 700;
  }

  .tbr-preset { padding: 0 10px; }
  .preset-time { font-size: 10.5px; color: var(--text-muted); font-weight: 400; }
  .tbr-preset:hover .preset-time { color: var(--navy); }

  /* ── Grid ── */
  .sched-grid-wrap {
    flex: 1; overflow: auto;
    padding: 16px 24px 12px;
    user-select: none;
    -webkit-user-select: none;
  }
  .sched-table {
    border-collapse: separate;
    border-spacing: 0;
  }

  /* Day label column */
  .sched-day-label {
    padding: 3px 10px 3px 0;
    font-size: 11.5px; font-weight: 600;
    color: var(--text-muted); text-align: right;
    white-space: nowrap; vertical-align: middle;
    min-width: 28px;
  }

  /* Each hour cell */
  .sched-cell {
    width: 26px; height: 26px;
    border: 1.5px solid #E2E8F0;
    border-radius: 4px;
    cursor: crosshair;
    background: #F8FAFC;
    transition: background .06s, border-color .06s;
    padding: 0;
  }
  .sched-row td + td { border-left: none; }
  .sched-table tbody tr + tr .sched-cell {  }

  /* Gap between cells via table spacing */
  .sched-table { border-spacing: 2px 2px; }

  .sched-cell:hover:not(.sched-on) {
    background: #DBEAFE; border-color: #93C5FD;
  }
  .sched-on {
    background: #2563EB; border-color: #2563EB;
  }
  .sched-on:hover {
    background: #1D4ED8; border-color: #1D4ED8;
  }

  /* Hour labels footer row */
  .sched-row-hours td { padding: 4px 0 0; vertical-align: top; }
  .sched-h-label {
    font-size: 9px; color: var(--text-muted);
    text-align: center; width: 26px;
  }

  /* ── Footer ── */
  .sched-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 24px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .sched-count {
    font-size: 12px; color: var(--text-muted);
  }
  .sched-count strong { color: var(--navy); }

  .sched-footer-btns { display: flex; gap: 10px; align-items: center; }

  .btn-cancel {
    height: 34px; padding: 0 18px;
    border: 1.5px solid var(--border); border-radius: 7px;
    background: white; font-size: 13px; font-family: inherit; font-weight: 500;
    color: var(--text); cursor: pointer;
    transition: border-color .12s, color .12s;
  }
  .btn-cancel:hover { border-color: var(--navy); color: var(--navy); }

  .btn-save {
    height: 34px; padding: 0 24px;
    background: var(--navy); color: white;
    border: none; border-radius: 7px;
    font-size: 13px; font-family: inherit; font-weight: 600;
    cursor: pointer; transition: background .15s;
  }
  .btn-save:hover { background: #1e3a6e; }
</style>
