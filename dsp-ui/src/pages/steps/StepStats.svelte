<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()
  export let draft
</script>

<div class="step-content">
  <h1 class="step-title">Статистика</h1>
  <div class="step-card">
    <p style="color:var(--text-muted);font-size:13px">Статистика будет доступна после запуска кампании.</p>
  </div>
  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
  </div>
</div>
