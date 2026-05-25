<script>
  export let page = 0        // 0-indexed
  export let totalPages = 0
  export let totalElements = 0
  export let size = 25

  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()

  function go(p) {
    if (p < 0 || p >= totalPages) return
    dispatch('change', p)
  }

  $: from = page * size + 1
  $: to = Math.min(page * size + size, totalElements)

  $: pages = buildPages(page, totalPages)

  function buildPages(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i)
    const result = []
    result.push(0)
    if (current > 3) result.push('...')
    for (let i = Math.max(1, current - 2); i <= Math.min(total - 2, current + 2); i++) result.push(i)
    if (current < total - 4) result.push('...')
    result.push(total - 1)
    return result
  }
</script>

<div class="pagination">
  <span class="pagination-info">
    {from}–{to} из {totalElements.toLocaleString('ru-RU')}
  </span>

  <div class="pagination-controls">
    <button class="page-btn" disabled={page === 0} on:click={() => go(page - 1)}>
      ‹
    </button>

    {#each pages as p}
      {#if p === '...'}
        <span style="padding:0 4px;color:var(--text-muted)">…</span>
      {:else}
        <button
          class="page-btn"
          class:active={p === page}
          on:click={() => go(p)}
        >{p + 1}</button>
      {/if}
    {/each}

    <button class="page-btn" disabled={page >= totalPages - 1} on:click={() => go(page + 1)}>
      ›
    </button>
  </div>
</div>
