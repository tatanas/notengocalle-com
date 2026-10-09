import { store } from './store.js'

// stats[clave] = { n, ok, streak, last }, con clave = "<modo>:<ítem>"
export const stats = store.get('stats', {})

// bests["<modo>:<preguntas>"] = { ok, ms, d }
export const bests = store.get('best', {})

export function record(key, ok) {
  const entry = stats[key] || (stats[key] = { n: 0, ok: 0, streak: 0 })
  entry.n++
  if (ok) {
    entry.ok++
    entry.streak++
  } else {
    entry.streak = 0
  }
  entry.last = Date.now()
  store.set('stats', stats)
}

export function saveBest(key, best) {
  bests[key] = best
  store.set('best', bests)
}

export function resetProgress() {
  for (const key in stats) delete stats[key]
  for (const key in bests) delete bests[key]
  store.set('stats', stats)
  store.set('best', bests)
}

// Lo nuevo y lo fallado pesan más; lo que ya se acierta seguido pesa menos.
export function adaptiveWeight(key) {
  const entry = stats[key]
  if (!entry) return 2.5
  const missRate = 1 - entry.ok / entry.n
  return Math.max(0.25, 1 + 4 * missRate + (entry.streak === 0 ? 1.5 : 0) - Math.min(entry.streak, 4) * 0.3)
}

const MAX_SHARE_PER_GROUP = 15

// Sorteo sin reposición. groupOf (ej. la comuna) evita que un grupo muy poblado domine la ronda.
export function weightedSample(items, count, { weightOf = () => 1, groupOf = null } = {}) {
  const groupSize = {}
  if (groupOf) for (const item of items) groupSize[groupOf(item)] = (groupSize[groupOf(item)] || 0) + 1
  const pool = items.map(item => ({
    item,
    weight: weightOf(item) * (groupOf ? Math.min(1, MAX_SHARE_PER_GROUP / groupSize[groupOf(item)]) : 1),
  }))
  const sample = []
  while (sample.length < count && pool.length) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
    let threshold = Math.random() * total
    let index = 0
    for (; index < pool.length - 1; index++) {
      threshold -= pool[index].weight
      if (threshold <= 0) break
    }
    sample.push(pool[index].item)
    pool.splice(index, 1)
  }
  return sample
}
