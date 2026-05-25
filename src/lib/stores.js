import { writable, derived } from 'svelte/store'

export const token = writable(localStorage.getItem('dsp_token') || null)
export const currentUser = writable(null)

token.subscribe(v => {
  if (v) localStorage.setItem('dsp_token', v)
  else localStorage.removeItem('dsp_token')
})

export const isAuthenticated = derived(token, $t => !!$t)

export function logout() {
  token.set(null)
  currentUser.set(null)
  window.location.hash = '#/login'
}

// Simple hash-based router
function getHashPage() {
  const hash = window.location.hash.replace('#/', '') || 'campaigns'
  return hash.split('?')[0]
}

export const page = writable(getHashPage())

window.addEventListener('hashchange', () => {
  page.set(getHashPage())
})
