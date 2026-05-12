<script>
  import { onMount } from 'svelte'
  import { token, isAuthenticated, currentUser, page } from './lib/stores.js'
  import { api } from './lib/api.js'
  import Sidebar from './components/Sidebar.svelte'
  import RightBar from './components/RightBar.svelte'
  import Login from './pages/Login.svelte'
  import CampaignsList    from './pages/CampaignsList.svelte'
  import CampaignTypeSelect from './pages/CampaignTypeSelect.svelte'
  import CampaignCreate   from './pages/CampaignCreate.svelte'

  onMount(async () => {
    if ($token) {
      try { currentUser.set(await api.me()) } catch {}
    }
    if (!$token && $page !== 'login') window.location.hash = '#/login'
    if ($token && $page === 'login') window.location.hash = '#/campaigns'
  })

  // Parse campaign type from routes like "campaigns/create/rtb"
  $: campaignCreateType = $page.startsWith('campaigns/create/')
    ? $page.split('/')[2].toUpperCase()
    : null

  $: isCreating = $page === 'campaigns/create' || !!campaignCreateType

  // Parse campaign detail route: "campaigns/123"
  $: campaignIdParam = (() => {
    const parts = $page.split('/')
    if (parts[0] === 'campaigns' && parts[1] && /^\d+$/.test(parts[1])) return Number(parts[1])
    return null
  })()
</script>

{#if !$isAuthenticated}
  <Login />
{:else if $page === 'campaigns/create'}
  <CampaignTypeSelect />
{:else if campaignCreateType}
  <CampaignCreate campaignType={campaignCreateType} />
{:else if campaignIdParam}
  <CampaignCreate campaignId={campaignIdParam} initialStep="summary" />
{:else}
  <div class="layout">
    <Sidebar />
    <div class="main-content">
      {#if $page === 'campaigns' || $page === ''}
        <CampaignsList />
      {:else}
        <div style="padding:32px;color:var(--text-muted);font-size:14px">
          Страница в разработке
        </div>
      {/if}
    </div>
    <RightBar />
  </div>
{/if}
