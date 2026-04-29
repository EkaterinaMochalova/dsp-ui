<script>
  import { createEventDispatcher } from 'svelte'
  import { formatDate, formatMoney } from '../../lib/utils.js'
  const dispatch = createEventDispatcher()
  export let draft
  export let metrics
</script>

<div class="step-content">
  <h1 class="step-title">Сводка</h1>

  <div class="step-card">
    <div class="step-card-title" style="margin-bottom:16px">Параметры кампании</div>

    <div class="summary-row">
      <span class="summary-label">Тип</span>
      <span class="summary-val">{draft.type}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Период</span>
      <span class="summary-val">
        {draft.startDate && draft.endDate ? `${formatDate(draft.startDate)} — ${formatDate(draft.endDate)}` : '—'}
      </span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Ставка</span>
      <span class="summary-val">{draft.bidType === 'OTS' ? 'По OTS' : 'По выходам'}</span>
    </div>
    {#if draft.cities?.length > 0}
      <div class="summary-row">
        <span class="summary-label">Города</span>
        <span class="summary-val">{draft.cities.join(', ')}</span>
      </div>
    {/if}
    {#if draft.screenIds?.length > 0}
      <div class="summary-row">
        <span class="summary-label">Экраны</span>
        <span class="summary-val">{draft.screenIds.length} шт.</span>
      </div>
    {/if}
    <div class="summary-row">
      <span class="summary-label">НДС</span>
      <span class="summary-val">{draft.vatEnabled ? 'Включён' : 'Без НДС'}</span>
    </div>
    {#if draft.buyerMarkup}
      <div class="summary-row">
        <span class="summary-label">Надбавка баера</span>
        <span class="summary-val">{draft.buyerMarkup}%</span>
      </div>
    {/if}
  </div>

  <div class="step-card">
    <div class="step-card-title" style="margin-bottom:16px">Прогноз</div>
    <div class="summary-row">
      <span class="summary-label">Количество выходов</span>
      <span class="summary-val">{metrics.impressions.toLocaleString('ru-RU')}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Количество OTS</span>
      <span class="summary-val">{metrics.ots.toLocaleString('ru-RU')}</span>
    </div>
    {#if metrics.budget}
      <div class="summary-row">
        <span class="summary-label">Рекомендованный бюджет</span>
        <span class="summary-val">{formatMoney(metrics.budget)}</span>
      </div>
    {/if}
  </div>

  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <button class="btn-next" style="background:#16A34A" on:click={() => dispatch('launch')}>
      Запустить кампанию
    </button>
  </div>
</div>

<style>
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .summary-row:last-child { border-bottom: none; }
  .summary-label { color: var(--text-muted); }
  .summary-val { font-weight: 600; color: var(--text); }
</style>
