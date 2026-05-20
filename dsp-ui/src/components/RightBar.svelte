<script>
  import { currentUser, logout } from '../lib/stores.js'

  function initials(name) {
    if (!name) return '?'
    return name.split(/[\s@]/).filter(Boolean).map(p => p[0]).join('').slice(0,2).toUpperCase()
  }
</script>

<aside class="rightbar">
  <!-- Avatar -->
  <div class="avatar-circle" title={$currentUser?.email || ''}>
    {initials($currentUser?.name || $currentUser?.email || '?')}
  </div>

  <!-- Bell -->
  <div class="rightbar-icon" title="Уведомления">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
    </svg>
  </div>

  <!-- Help -->
  <div class="rightbar-icon" title="Помощь">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
    </svg>
  </div>

  <!-- Spacer -->
  <div style="flex:1"></div>

  <!-- Logout -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="rightbar-icon" title="Выйти" on:click={logout} role="button" tabindex="0">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h7a1 1 0 000-2H4V5h6a1 1 0 000-2H3zm11.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L15.586 11H9a1 1 0 010-2h6.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
    </svg>
  </div>
</aside>
