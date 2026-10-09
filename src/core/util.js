export const $ = (selector, parent = document) => parent.querySelector(selector)

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = text => String(text).replace(/[&<>"']/g, char => HTML_ENTITIES[char])

export function shuffle(items) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const pick = items => items[Math.floor(Math.random() * items.length)]

export const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x))

export const formatKm = km =>
  km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km'

export function formatTime(ms) {
  const seconds = Math.round(ms / 1000)
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}
