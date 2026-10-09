import { store } from '../core/store.js'
import { UNAVAILABLE, api } from './api.js'

// Se recuerda el nombre para pintar el botón de cuenta al instante; el servidor confirma después.
export let user = store.get('user', null)
export let accountsAvailable = true

const listeners = new Set()

export function onSessionChange(listener) {
  listeners.add(listener)
  listener()
}

function setUser(next) {
  user = next
  store.set('user', user)
  for (const listener of listeners) listener()
}

export async function restoreSession() {
  try {
    setUser((await api('GET', '/me')).user)
  } catch (error) {
    if (error.code !== UNAVAILABLE) return
    accountsAvailable = false
    setUser(null)
  }
}

export function sessionExpired() {
  setUser(null)
}

export async function register(name, password) {
  setUser((await api('POST', '/register', { name, password })).user)
}

export async function logIn(name, password) {
  setUser((await api('POST', '/login', { name, password })).user)
}

export async function logOut() {
  await api('POST', '/logout').catch(() => {})
  setUser(null)
}
