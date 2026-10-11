import { escapeHtml, formatKm } from '../core/util.js'
import { crossingsOf, isRoad, parallelPartnersOf } from '../data/dataset.js'
import { streetShape } from '../core/lookalike.js'

const MIN_CROSSINGS = 3
const MENTIONED_CROSSINGS = 3

// Las calles que sirven para el juego sin mapa: las que se pueden describir con sus cruces.
// Si el nombre contiene su comuna ("Av. Recoleta"), decir por dónde pasa delataría la respuesta.
const namesItsComuna = street =>
  street.comunas.some(comuna => street.name.toLowerCase().includes(comuna.toLowerCase()))

export const canBeDescribed = street =>
  isRoad(street) && !namesItsComuna(street) && crossingsOf(street.name).length >= MIN_CROSSINGS

// En qué dirección crece la proyección sobre el eje de la calle, según su ángulo (0° = oriente, 90° = norte).
const AXIS_ENDS = [
  { from: 0, to: 22.5, low: 'poniente', high: 'oriente' },
  { from: 22.5, to: 67.5, low: 'suroeste', high: 'noreste' },
  { from: 67.5, to: 112.5, low: 'sur', high: 'norte' },
  { from: 112.5, to: 157.5, low: 'sureste', high: 'noroeste' },
  { from: 157.5, to: 180, low: 'poniente', high: 'oriente' },
]

const axisName = angle => {
  const ends = AXIS_ENDS.find(end => angle >= end.from && angle <= end.to) ?? AXIS_ENDS[0]
  return ends
}

const KILOMETERS_PER_DEGREE_LATITUDE = 111.2

// Los cruces ordenados a lo largo de la calle, del extremo "bajo" (sur/poniente) al "alto".
function crossingsAlong(street, angle) {
  const radians = (angle * Math.PI) / 180
  const eastKmPerDegree = KILOMETERS_PER_DEGREE_LATITUDE * Math.cos((street.mid[0] * Math.PI) / 180)
  return crossingsOf(street.name)
    .map(({ other, i }) => {
      const [lat, lon] = i.pts[0]
      const projection =
        lon * eastKmPerDegree * Math.cos(radians) + lat * KILOMETERS_PER_DEGREE_LATITUDE * Math.sin(radians)
      return { other, projection }
    })
    .sort((a, b) => a.projection - b.projection)
}

const listOf = names => names.map(name => `<b>${escapeHtml(name)}</b>`).join(', ')

// Las pistas, de lo más general a lo más específico. `names` son las calles mencionadas: ninguna es la respuesta.
export function streetClues(street) {
  const { angle } = streetShape(street.lines)
  const ends = axisName(angle)
  const along = crossingsAlong(street, angle)
  const lowEnd = along[0]
  const highEnd = along[along.length - 1]
  const used = new Set([lowEnd.other, highEnd.other])
  const middle = along.filter(crossing => !used.has(crossing.other)).slice(0, MENTIONED_CROSSINGS)
  middle.forEach(crossing => used.add(crossing.other))
  const parallel = parallelPartnersOf(street.name).slice(0, 2)
  parallel.forEach(name => used.add(name))

  const clues = [
    `Pasa por ${street.comunas.map(escapeHtml).join(', ')}.`,
    `Corre más o menos de ${ends.low} a ${ends.high} y mide unos ${formatKm(street.km)}.`,
    `Su cruce más hacia el ${ends.low} es con ${listOf([lowEnd.other])}, y el más hacia el ${ends.high}, con ${listOf([highEnd.other])}.`,
  ]
  if (middle.length) clues.push(`En el medio la cruzan ${listOf(middle.map(crossing => crossing.other))}.`)
  if (parallel.length) clues.push(`Corre pegada a ${listOf(parallel)}.`)
  return { clues, mentioned: used }
}
