<script>
  import { api } from '../lib/api.js'
  import { token } from '../lib/stores.js'

  let email = ''
  let password = ''
  let loading = false
  let error = ''
  let devMode = false
  let devToken = ''

  async function submit() {
    if (!email || !password) return
    loading = true
    error = ''
    try {
      const res = await api.login(email, password)
      const jwt = res?.token ?? res?.accessToken ?? res?.authToken
      if (jwt) {
        token.set(jwt)
        window.location.hash = '#/campaigns'
      } else {
        error = 'Неверный ответ сервера'
      }
    } catch (e) {
      error = e?.data?.message || 'Неверный логин или пароль'
    } finally {
      loading = false
    }
  }

  function submitToken() {
    const t = devToken.trim()
    if (!t) return
    token.set(t)
    window.location.hash = '#/campaigns'
  }

  function onKey(e) {
    if (e.key === 'Enter') submit()
  }

  function onTokenKey(e) {
    if (e.key === 'Enter') submitToken()
  }
</script>

<div class="login-page">
  <div class="card login-card">
    <div class="login-logo">
      <div class="logo-box" style="width:40px;height:40px;font-size:11px;border-radius:10px">
        <div>Omni</div><div>360</div>
      </div>
      <div class="login-logo-name">Omni360 DSP</div>
    </div>

    <div class="login-heading">Войти в систему</div>
    <div class="login-sub">Введите данные вашего аккаунта</div>

    {#if !devMode}
      <div class="form-group">
        <label class="form-label" for="email">Email</label>
        <input
          id="email"
          class="form-input"
          type="email"
          placeholder="you@example.com"
          bind:value={email}
          on:keydown={onKey}
          autocomplete="email"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="password">Пароль</label>
        <input
          id="password"
          class="form-input"
          type="password"
          placeholder="••••••••"
          bind:value={password}
          on:keydown={onKey}
          autocomplete="current-password"
        />
      </div>

      {#if error}
        <div class="form-error">{error}</div>
      {/if}

      <button class="btn btn-primary btn-login" on:click={submit} disabled={loading}>
        {loading ? 'Вход…' : 'Войти'}
      </button>

      <button
        style="width:100%;margin-top:12px;background:none;border:none;font-size:12px;color:var(--text-muted);cursor:pointer;"
        on:click={() => devMode = true}
      >
        Войти по токену (dev)
      </button>
    {:else}
      <div class="form-group">
        <label class="form-label" for="dev-token">Bearer Token</label>
        <textarea
          id="dev-token"
          class="form-input"
          style="height:80px;padding:10px 14px;resize:none;font-family:monospace;font-size:11px"
          placeholder="Вставьте bearer token…"
          bind:value={devToken}
          on:keydown={onTokenKey}
        ></textarea>
      </div>

      <button class="btn btn-primary btn-login" on:click={submitToken} disabled={!devToken.trim()}>
        Войти по токену
      </button>

      <button
        style="width:100%;margin-top:12px;background:none;border:none;font-size:12px;color:var(--text-muted);cursor:pointer;"
        on:click={() => devMode = false}
      >
        ← Вернуться к форме входа
      </button>
    {/if}
  </div>
</div>
