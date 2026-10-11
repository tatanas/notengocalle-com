import { KM_PER_DEG_LAT, KM_PER_DEG_LON } from './geo.js'

// Para armar alternativas que cuesten: qué calles se parecen a otra. Una calle se confunde con las que quedan
// cerca, con las que apuntan hacia el mismo lado y con las que corren pegadas a ella ("una adentro de la otra").

// Hacia dónde apunta una calle (grados, 0–180 desde el este) y cuán recta es (0 = curva o anillo, 1 = recta).
// Es el eje principal de sus tramos, ponderados por su largo.
export function streetShape(lines) {
  const segments = []
  for (const line of lines)
    for (let i = 0; i < line.length - 1; i++) {
      const [lat1, lon1] = line[i]
      const [lat2, lon2] = line[i + 1]
      const dx = (lon2 - lon1) * KM_PER_DEG_LON
      const dy = (lat2 - lat1) * KM_PER_DEG_LAT
      const length = Math.hypot(dx, dy)
      if (length > 0)
        segments.push({
          dx,
          dy,
          length,
          x: ((lon1 + lon2) / 2) * KM_PER_DEG_LON,
          y: ((lat1 + lat2) / 2) * KM_PER_DEG_LAT,
        })
    }
  const total = segments.reduce((sum, s) => sum + s.length, 0)
  if (!total) return { angle: 0, straightness: 0 }
  const meanX = segments.reduce((sum, s) => sum + s.length * s.x, 0) / total
  const meanY = segments.reduce((sum, s) => sum + s.length * s.y, 0) / total
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const s of segments) {
    // varianza de los puntos del tramo respecto del centro de la calle: la de su punto medio más la propia del tramo
    sxx += s.length * ((s.x - meanX) ** 2 + s.dx ** 2 / 12)
    syy += s.length * ((s.y - meanY) ** 2 + s.dy ** 2 / 12)
    sxy += s.length * ((s.x - meanX) * (s.y - meanY) + (s.dx * s.dy) / 12)
  }
  sxx /= total
  syy /= total
  sxy /= total
  const spread = Math.hypot((sxx - syy) / 2, sxy)
  const major = (sxx + syy) / 2 + spread
  const minor = (sxx + syy) / 2 - spread
  const radians = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return {
    angle: ((((radians * 180) / Math.PI) % 180) + 180) % 180,
    straightness: major > 0 ? Math.max(0, Math.min(1, 1 - minor / major)) : 0,
  }
}

// Diferencia entre dos orientaciones, de 0 (paralelas) a 90 (perpendiculares).
export function angleBetween(a, b) {
  const difference = Math.abs(a - b) % 180
  return Math.min(difference, 180 - difference)
}

const NEARNESS_OFFSET_KM = 0.4
const PERPENDICULAR_FLOOR = 0.15
const OTHER_KIND_FACTOR = 0.4
const OVERLAP_FACTOR = 4
const CONFUSION_BONUS = 3
const MAX_CONFUSIONS_COUNTED = 3

// Cuánto se parece una calle candidata a la pedida, como peso para sortear las alternativas.
//  distanceKm: distancia media entre ambas · angleDiff: diferencia de orientación (0–90)
//  straightness: qué tan rectas son las dos (0–1) · sameKind: ambas calles o ambas autopistas
//  overlaps: corren una pegada a la otra · confusions: cuántas veces el jugador las ha confundido
export function lookalikeWeight({ distanceKm, angleDiff, straightness, sameKind, overlaps, confusions }) {
  const nearness = 1 / (NEARNESS_OFFSET_KM + distanceKm)
  const alignment =
    PERPENDICULAR_FLOOR + (1 - PERPENDICULAR_FLOOR) * Math.cos((angleDiff * Math.PI) / 180) ** 4
  // Una calle curva (un anillo como Américo Vespucio) no tiene una orientación que valga la pena comparar.
  const orientation = 1 - straightness * (1 - alignment)
  let weight = nearness * orientation * (sameKind ? 1 : OTHER_KIND_FACTOR)
  if (overlaps) weight *= OVERLAP_FACTOR
  return weight + CONFUSION_BONUS * Math.min(confusions, MAX_CONFUSIONS_COUNTED)
}
