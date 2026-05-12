<script>
  import { onMount, createEventDispatcher } from 'svelte'
  import { api } from '../../lib/api.js'
  const dispatch = createEventDispatcher()

  export let draft

  let customers = []
  let brands = []
  let loading = true

  // City multi-select state
  let cityInput = ''
  let cityDropdownOpen = false
  let allCities = []      // [{ name, id }] from API
  let citiesLoading = true

  if (!draft.cities) draft.cities = []
  if (!draft.cityIds) draft.cityIds = []

  $: cityNames = allCities.map(c => c.name)
  $: citySuggestions = cityInput.length > 0
    ? cityNames.filter(c => c.toLowerCase().includes(cityInput.toLowerCase()) && !draft.cities.includes(c))
    : cityNames.filter(c => !draft.cities.includes(c))

  onMount(async () => {
    try {
      const [customersData] = await Promise.all([
        api.customers.list({ size: 100 }),
      ])
      customers = customersData.content ?? []
    } catch {}
    loading = false

    // Load cities in background — not blocking
    try {
      allCities = await api.inventories.cities()
    } catch {
      allCities = []
    } finally {
      citiesLoading = false
    }
  })

  async function onCustomerChange() {
    draft.brandId   = null
    draft.brandName = null
    brands = []
    if (!draft.customerId) { draft.customerName = null; return }
    // Store name for summary display
    const found = customers.find(c => c.id === draft.customerId)
    draft.customerName = found?.name ?? null
    try {
      const data = await api.customers.brands(draft.customerId)
      brands = data.content ?? []
    } catch {}
  }

  function onBrandChange() {
    const found = brands.find(b => b.id === draft.brandId)
    draft.brandName = found?.name ?? null
  }

  function addCity(name) {
    if (draft.cities.includes(name)) return
    const found = allCities.find(c => c.name === name)
    draft.cities = [...draft.cities, name]
    if (found?.id != null) draft.cityIds = [...draft.cityIds, found.id]
    cityInput = ''
    cityDropdownOpen = false
  }

  function removeCity(name) {
    const found = allCities.find(c => c.name === name)
    draft.cities = draft.cities.filter(c => c !== name)
    if (found?.id != null) draft.cityIds = draft.cityIds.filter(id => id !== found.id)
  }

  function addAllCities() {
    for (const name of citySuggestions) addCity(name)
    cityDropdownOpen = false
  }

  function onCityKeydown(e) {
    if (e.key === 'Enter' && citySuggestions.length > 0) addCity(citySuggestions[0])
    if (e.key === 'Escape') cityDropdownOpen = false
  }
</script>

<div class="step-content">
  <h1 class="step-title">Основные параметры</h1>

  <div class="step-card">
    <!-- Advertiser -->
    <div class="field-group">
      <div class="field-label">Рекламодатель</div>
      <select
        class="field-select"
        class:placeholder={!draft.customerId}
        bind:value={draft.customerId}
        on:change={onCustomerChange}
        disabled={loading}
      >
        <option value={null}>Выберите рекламодателя</option>
        {#each customers as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </div>

    <!-- Brand -->
    <div class="field-group">
      <div class="field-label">Бренд</div>
      <select
        class="field-select"
        class:placeholder={!draft.brandId}
        bind:value={draft.brandId}
        on:change={onBrandChange}
        disabled={!draft.customerId || brands.length === 0}
      >
        <option value={null}>Выберите или создайте бренд</option>
        {#each brands as b}
          <option value={b.id}>{b.name}</option>
        {/each}
      </select>
    </div>

    <!-- Date range -->
    <div class="field-group">
      <div class="field-label">Период</div>
      <div class="date-range-row">
        <div class="date-field">
          <input
            class="field-input"
            type="date"
            bind:value={draft.startDate}
            placeholder="Начало"
          />
        </div>
        <span class="date-sep">—</span>
        <div class="date-field">
          <input
            class="field-input"
            type="date"
            bind:value={draft.endDate}
            min={draft.startDate}
            placeholder="Конец"
          />
        </div>
      </div>
    </div>

    <!-- Bid type -->
    <div class="field-group">
      <div class="field-label">Тип ставки</div>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" bind:group={draft.bidType} value="BID" />
          По выходам
        </label>
        <label class="radio-label">
          <input type="radio" bind:group={draft.bidType} value="OTS" />
          По OTS
        </label>
      </div>
    </div>
  </div>

  <!-- City selection -->
  <div class="step-card">
    <div class="step-card-title" style="margin-bottom:6px">В каких городах запустить кампанию?</div>
    <div class="field-desc" style="margin-bottom:14px">Добавьте одну или несколько локаций для кампании.</div>

    <!-- Selected cities -->
    {#if draft.cities.length > 0}
      <div class="city-tags">
        {#each draft.cities as city}
          <div class="city-tag">
            {city}
            <button class="city-tag-remove" on:click={() => removeCity(city)}>×</button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- City input with dropdown -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="city-input-wrap" style="position:relative">
      <div class="city-input-box" on:click={() => cityDropdownOpen = true}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="color:var(--text-muted);flex-shrink:0">
          <path d="M9 17A8 8 0 109 1a8 8 0 000 16zM17 17l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <input
          class="city-input"
          type="text"
          placeholder={citiesLoading ? 'Загрузка городов…' : 'Выберите один или несколько городов'}
          bind:value={cityInput}
          on:focus={() => cityDropdownOpen = true}
          on:keydown={onCityKeydown}
          on:input={() => cityDropdownOpen = true}
          disabled={citiesLoading}
        />
        <svg class="chip-arrow" viewBox="0 0 10 6" fill="none" width="10" height="6">
          <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      {#if cityDropdownOpen && citySuggestions.length > 0}
        <div class="city-dropdown">
          {#each citySuggestions.slice(0, 8) as city}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="city-dropdown-item" on:click={() => addCity(city)}>
              {city}
            </div>
          {/each}
          {#if citySuggestions.length > 1}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="city-dropdown-add-all" on:click={addAllCities}>
              Добавить все{citySuggestions.length > 8 ? ` (${citySuggestions.length})` : ''}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <div class="step-nav">
    <button class="btn-back" on:click={() => dispatch('back')}>Назад</button>
    <button class="btn-next" on:click={() => dispatch('next')} disabled={!draft.customerId}>Дальше</button>
  </div>
</div>

<!-- Close city dropdown on outside click -->
<svelte:window on:click|capture={(e) => {
  if (!e.target.closest('.city-input-wrap')) cityDropdownOpen = false
}} />

<style>
  .date-range-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .date-field { flex: 1; }

  .date-sep {
    color: var(--text-muted);
    font-size: 14px;
    flex-shrink: 0;
  }

  .field-desc {
    font-size: 12.5px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .city-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }

  .city-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--navy-light);
    color: var(--navy);
    border: 1px solid rgba(17,40,83,.2);
    border-radius: 20px;
    padding: 3px 10px 3px 12px;
    font-size: 12.5px;
    font-weight: 600;
  }

  .city-tag-remove {
    background: none;
    border: none;
    color: var(--navy);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    padding: 0 0 0 2px;
    opacity: .6;
  }
  .city-tag-remove:hover { opacity: 1; }

  .city-input-box {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    padding: 0 10px;
    cursor: text;
    background: #fff;
  }
  .city-input-box:focus-within { border-color: var(--navy); }

  .city-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    background: transparent;
  }
  .city-input::placeholder { color: var(--text-muted); }

  .chip-arrow { color: var(--text-muted); flex-shrink: 0; }

  .city-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 4px 20px rgba(0,0,0,.12);
    z-index: 200;
    overflow: hidden;
  }

  .city-dropdown-item {
    padding: 8px 12px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    transition: background .1s;
  }
  .city-dropdown-item:hover { background: var(--navy-light); color: var(--navy); }

  .city-dropdown-add-all {
    padding: 7px 12px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--navy);
    cursor: pointer;
    border-top: 1px solid var(--border);
    background: var(--bg);
    transition: background .1s;
  }
  .city-dropdown-add-all:hover { background: var(--navy-light); }
</style>
