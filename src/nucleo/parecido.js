import { KM_POR_GRADO_LATITUD, KM_POR_GRADO_LONGITUD } from './geografia.js'

// Para armar alternativas que cuesten: qué calles se parecen a otra. Una calle se confunde con las que quedan
// cerca, con las que apuntan hacia el mismo lado y con las que corren pegadas a ella ("una adentro de la otra").

// Hacia dónde apunta una calle (grados, 0–180 desde el este) y cuán recta es (0 = curva o anillo, 1 = recta).
// Es el eje principal de sus tramos, ponderados por su largo.
export function formaDeCalle(lineas) {
  const tramos = []
  for (const linea of lineas)
    for (let i = 0; i < linea.length - 1; i++) {
      const [lat1, lon1] = linea[i]
      const [lat2, lon2] = linea[i + 1]
      const dx = (lon2 - lon1) * KM_POR_GRADO_LONGITUD
      const dy = (lat2 - lat1) * KM_POR_GRADO_LATITUD
      const largo = Math.hypot(dx, dy)
      if (largo > 0)
        tramos.push({
          dx,
          dy,
          length: largo,
          x: ((lon1 + lon2) / 2) * KM_POR_GRADO_LONGITUD,
          y: ((lat1 + lat2) / 2) * KM_POR_GRADO_LATITUD,
        })
    }
  const total = tramos.reduce((suma, s) => suma + s.length, 0)
  if (!total) return { angle: 0, straightness: 0 }
  const mediaX = tramos.reduce((suma, s) => suma + s.length * s.x, 0) / total
  const mediaY = tramos.reduce((suma, s) => suma + s.length * s.y, 0) / total
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const s of tramos) {
    // varianza de los puntos del tramo respecto del centro de la calle: la de su punto medio más la propia del tramo
    sxx += s.length * ((s.x - mediaX) ** 2 + s.dx ** 2 / 12)
    syy += s.length * ((s.y - mediaY) ** 2 + s.dy ** 2 / 12)
    sxy += s.length * ((s.x - mediaX) * (s.y - mediaY) + (s.dx * s.dy) / 12)
  }
  sxx /= total
  syy /= total
  sxy /= total
  const dispersion = Math.hypot((sxx - syy) / 2, sxy)
  const mayor = (sxx + syy) / 2 + dispersion
  const menor = (sxx + syy) / 2 - dispersion
  const radianes = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return {
    angle: ((((radianes * 180) / Math.PI) % 180) + 180) % 180,
    straightness: mayor > 0 ? Math.max(0, Math.min(1, 1 - menor / mayor)) : 0,
  }
}

// Diferencia entre dos orientaciones, de 0 (paralelas) a 90 (perpendiculares).
export function anguloEntre(a, b) {
  const diferencia = Math.abs(a - b) % 180
  return Math.min(diferencia, 180 - diferencia)
}

const DESFASE_DE_CERCANIA_KM = 0.4
const PISO_PERPENDICULAR = 0.15
const FACTOR_DE_OTRO_TIPO = 0.4
const FACTOR_DE_SUPERPOSICION = 4
const BONO_POR_CONFUSION = 3
const MAXIMO_DE_CONFUSIONES_CONTADAS = 3

// Cuánto se parece una calle candidata a la pedida, como peso para sortear las alternativas.
//  distanceKm: distancia media entre ambas · angleDiff: diferencia de orientación (0–90)
//  straightness: qué tan rectas son las dos (0–1) · sameKind: ambas calles o ambas autopistas
//  overlaps: corren una pegada a la otra · confusions: cuántas veces el jugador las ha confundido
export function pesoDeParecido({
  distanceKm: distanciaKm,
  angleDiff: diferenciaDeAngulo,
  straightness: rectitud,
  sameKind: mismoTipo,
  overlaps: seSuperponen,
  confusions: confusiones,
}) {
  const cercania = 1 / (DESFASE_DE_CERCANIA_KM + distanciaKm)
  const alineacion =
    PISO_PERPENDICULAR + (1 - PISO_PERPENDICULAR) * Math.cos((diferenciaDeAngulo * Math.PI) / 180) ** 4
  // Una calle curva (un anillo como Américo Vespucio) no tiene una orientación que valga la pena comparar.
  const orientacion = 1 - rectitud * (1 - alineacion)
  let peso = cercania * orientacion * (mismoTipo ? 1 : FACTOR_DE_OTRO_TIPO)
  if (seSuperponen) peso *= FACTOR_DE_SUPERPOSICION
  return peso + BONO_POR_CONFUSION * Math.min(confusiones, MAXIMO_DE_CONFUSIONES_CONTADAS)
}
