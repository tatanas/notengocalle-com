import { nearestBy } from '../core/geo.js'
import { shuffle } from '../core/util.js'
import { comunaByName, labelPoint, scopeComunas } from '../data/dataset.js'

// Alternativas incorrectas creíbles: primero las vecinas; si faltan, las más cercanas.
export function comunaDistractors(name, count = 3) {
  const comuna = comunaByName[name]
  const inPlay = scopeComunas().map(feature => feature.properties.name)
  const neighbors = shuffle(comuna.properties.nb.filter(neighbor => inPlay.includes(neighbor)))
  if (neighbors.length >= count) return neighbors.slice(0, count)
  const nearby = nearestBy(
    scopeComunas(),
    labelPoint(comuna),
    labelPoint,
    8,
    feature => feature.properties.name === name || neighbors.includes(feature.properties.name),
  ).map(feature => feature.properties.name)
  return [...neighbors, ...shuffle(nearby)].slice(0, count)
}
