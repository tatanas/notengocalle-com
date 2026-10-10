import { store } from '../core/store.js'
import { OFFLINE, api } from './api.js'
import { accountsAvailable, onSessionChange, sessionExpired, user } from './session.js'

// Rondas oficiales que aún no llegan al servidor: jugadas sin cuenta o sin conexión.
const MAX_PENDING = 20
const outbox = store.get('outbox', [])
const saveOutbox = () => store.set('outbox', outbox)

function enqueue(result) {
  outbox.push(result)
  outbox.splice(0, outbox.length - MAX_PENDING)
  saveOutbox()
}

const UNAUTHORIZED = 401

// Devuelve { status } con 'saved' (más rank, players, improved, best), 'guest', 'offline', 'unavailable' o 'rejected'.
export async function submitOfficialRound(result) {
  if (!accountsAvailable) return { status: 'unavailable' }
  if (!user) {
    enqueue(result)
    return { status: 'guest' }
  }
  try {
    return { status: 'saved', ...(await api('POST', '/scores', result)) }
  } catch (error) {
    if (error.code === OFFLINE) {
      enqueue(result)
      return { status: 'offline' }
    }
    if (error.status === UNAUTHORIZED) {
      enqueue(result)
      sessionExpired()
      return { status: 'guest' }
    }
    return { status: 'rejected', message: error.message }
  }
}

// Lo que respondió el servidor por cada ronda pendiente que ya se envió.
const delivered = new WeakMap()
export const deliveryOf = result => delivered.get(result)

let flushing = null

// Envía lo pendiente; si ya hay un envío en curso, espera ese mismo.
export function flushOutbox() {
  flushing ||= sendPending().finally(() => (flushing = null))
  return flushing
}

async function sendPending() {
  while (user && outbox.length) {
    const result = outbox[0]
    try {
      delivered.set(result, await api('POST', '/scores', result))
    } catch (error) {
      if (error.code === OFFLINE || error.status === UNAUTHORIZED) break
    }
    outbox.shift()
    saveOutbox()
  }
}

onSessionChange(flushOutbox)

export const fetchLeaderboard = (mode, category, period) =>
  api('GET', `/leaderboard?mode=${encodeURIComponent(mode)}&category=${category}&period=${period}`)

export const fetchLeaders = (category, period) => api('GET', `/leaders?category=${category}&period=${period}`)
