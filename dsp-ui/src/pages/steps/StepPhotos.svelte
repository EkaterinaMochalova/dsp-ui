<script>
  import { createEventDispatcher } from 'svelte'
  const dispatch = createEventDispatcher()
  export let draft
</script>

<div class="step-content">
  <h1 class="step-title">Фотоотчёты</h1>
  <div class="step-card">
    <p style="color:var(--text-muted);font-size:13px">Настройка фотоотчётов будет доступна после выбора экранов.</p>
  </div>
  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <button class="btn-next" on:click={() => dispatch('next')}>Дальше</button>
  </div>
</div>
