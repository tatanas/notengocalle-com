import { distanceKm, nearestBy } from '../core/geo.js'
import { angleBetween, lookalikeWeight, streetShape } from '../core/lookalike.js'
import { weightedSample } from '../core/progress.js'
import { store } from '../core/store.js'
import { escapeHtml } from '../core/util.js'
import { isPara, isRoad, parallelPartnersOf, roads, streetByName } from '../data/dataset.js'
import { SEGMENT_COLORS } from '../map/draw.js'
import { quiz } from '../quiz/engine.js'

export const STREET_QUESTION = {
  calle: '¿Qué calle está marcada en azul?',
  autopista: '¿Qué autopista o carretera está marcada en azul?',
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

const shapes = new Map()
const shapeOf = street => {
  if (!shapes.has(street)) shapes.set(street, streetShape(street.lines))
  return shapes.get(street)
}

// Las calles que se pueden confundir con esta: las vecinas, las que corren pegadas a ella y las que el jugador
// ya confundió con ella (aunque queden lejos). En una ronda oficial no cuenta lo que haya confundido cada uno:
// las alternativas son las mismas para todos.
function lookalikes(street) {
  const personal = new Map(quiz?.ranked ? [] : confusionsOf(street.name))
  const distanceTo = new Map(street.nb || [])
  const names = new Set([...distanceTo.keys(), ...parallelPartnersOf(street.name), ...personal.keys()])
  const shape = shapeOf(street)
  const candidates = []
  for (const name of names) {
    const other = streetByName[name]
    if (!other || other === street || !isRoad(other)) continue
    const otherShape = shapeOf(other)
    candidates.push({
      street: other,
      weight: lookalikeWeight({
        distanceKm: distanceTo.get(name) ?? distanceKm(street.mid, other.mid),
        angleDiff: angleBetween(shape.angle, otherShape.angle),
        straightness: Math.min(shape.straightness, otherShape.straightness),
        sameKind: (street.kind || 'calle') === (other.kind || 'calle'),
        overlaps: isPara(street.name, name),
        confusions: personal.get(name) || 0,
      }),
    })
  }
  return candidates
}

// Alternativas incorrectas que cuesten: calles cercanas que apuntan hacia el mismo lado (Holanda, Suecia, Luis Thayer
// Ojeda), las que van una dentro de la otra (Eduardo Frei y la Ruta 5) y las que el jugador ha confundido antes.
export function streetDistractors(street, count = 3) {
  const picked = weightedSample(lookalikes(street), count, { weightOf: candidate => candidate.weight }).map(
    candidate => candidate.street,
  )
  if (picked.length >= count) return picked
  const fillers = nearestBy(
    roads(),
    street.mid,
    other => other.mid,
    count,
    other => other === street || picked.includes(other),
  )
  return [...picked, ...fillers].slice(0, count)
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
