import { weightedSample } from '../core/progress.js'
import { store } from '../core/store.js'
import { escapeHtml, shuffle } from '../core/util.js'
import { DATA, isRoad, streetByName } from '../data/dataset.js'
import { SEGMENT_COLORS } from '../map/draw.js'

export const STREET_QUESTION = {
  calle: '¿Qué calle está marcada en azul?',
  autopista: '¿Qué autopista o carretera está marcada en azul?',
  agua: '¿Qué río o canal está marcado en azul?',
  tren: '¿Qué es lo que está marcado en azul?',
}

// street.tr = { n: [[nombre, km], ...], i: índice de tramo por cada línea } para calles que cambian de nombre.
export function namedSegmentsHtml(street) {
  if (!street.tr) return ''
  const items = street.tr.n.map(([name, km], index) => {
    const color = SEGMENT_COLORS[index % SEGMENT_COLORS.length]
    return `<li><span class="dot" style="background:${color}"></span>${escapeHtml(name)} — ${String(km).replace('.', ',')} km</li>`
  })
  return `<p><b>Cambia de nombre por tramos:</b></p><ul class="blist">${items.join('')}</ul>`
}

const NEIGHBORS_CONSIDERED = 8

// Alternativas incorrectas: calles realmente cercanas (street.nb viene ordenado), con más peso a las más próximas.
export function streetDistractors(street, count = 3) {
  if (street.kind === 'agua')
    return shuffle(DATA.streets.filter(other => other.kind === 'agua' && other !== street)).slice(0, count)
  const neighbors = (street.nb || [])
    .map(([name]) => streetByName[name])
    .filter(neighbor => neighbor && isRoad(neighbor))
    .slice(0, NEIGHBORS_CONSIDERED)
  return weightedSample(neighbors, count, {
    weightOf: neighbor => NEIGHBORS_CONSIDERED - neighbors.indexOf(neighbor),
  })
}

// ----- confusiones: qué calles ha mezclado el jugador entre sí
const confusions = store.get('conf', {})
const confusionKey = (a, b) => [a, b].sort().join('|')

export function noteConfusion(a, b) {
  if (!a || !b || a === b) return
  const key = confusionKey(a, b)
  confusions[key] = (confusions[key] || 0) + 1
  store.set('conf', confusions)
}

// [[otraCalle, veces], ...]
export const confusionsOf = name =>
  Object.entries(confusions)
    .filter(([key]) => key.split('|').includes(name))
    .map(([key, times]) => [key.split('|').find(other => other !== name) || name, times])
    .filter(([other]) => streetByName[other])
