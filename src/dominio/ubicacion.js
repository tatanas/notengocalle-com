import {
  KM_POR_GRADO_LATITUD,
  KM_POR_GRADO_LONGITUD,
  distanciaKm,
  puntoEnPoligono,
  puntoEnRasgo,
} from '../nucleo/geografia.js'
import { escaparHtml } from '../nucleo/utilidades.js'
import { DATOS, comunas, estaciones, sonParalelas } from '../datos/datos.js'

// Hasta dónde un lugar está "frente a" el punto, y hasta dónde solo "cerca".
const FRENTE_A_KM = 0.04
const CERCA_DE_KM = 0.15
const METRO_CERCANO_KM = 0.4
// Dos calles forman una esquina si se cortan a menos de esto del punto.
const CRUCE_CERCANO_KM = 0.12
const ES_UN_CERRO = /^k/

// "Plaza Italia (Plaza Baquedano)" → "Plaza Italia"; se conservan los aclaratorios de una palabra: "Av. Condell (Renca)".
const nombreCorto = nombre => nombre.replace(/\s*\([^)]*\s[^)]*\)/g, '').trim()
const negrita = texto => `<b>${escaparHtml(nombreCorto(texto))}</b>`

// El lugar emblemático más cercano al punto (sin ríos ni cerros, que quedan lejos de todo), con su distancia en km.
function lugarMasCercano(punto) {
  let mejor = null
  for (const lugar of DATOS.landmarks) {
    if (lugar.line || ES_UN_CERRO.test(lugar.id) || lugar.cat === 'Barrios') continue
    const distancia = distanciaKm(punto, [lugar.lat, lugar.lon])
    if (!mejor || distancia < mejor.distancia) mejor = { lugar, distancia }
  }
  return mejor && mejor.distancia <= CERCA_DE_KM ? mejor : null
}

const barrioDelPunto = punto =>
  DATOS.landmarks.find(
    lugar => lugar.zone && !lugar.zone.approx && puntoEnPoligono(punto, lugar.zone.poly),
  ) ?? null

const comunaDelPunto = punto =>
  comunas.find(comuna => puntoEnRasgo(punto[0], punto[1], comuna))?.properties.name ?? null

function estacionCercana(punto) {
  const [estacion, distancia] = estaciones
    .map(candidata => [candidata, distanciaKm(punto, [candidata.lat, candidata.lon])])
    .reduce((mejor, actual) => (actual[1] < mejor[1] ? actual : mejor))
  return distancia <= METRO_CERCANO_KM ? { estacion, distancia } : null
}

// ----- calles: cuál es la principal, cuáles forman esquina con ella y cuáles solo la acompañan
const aKm = (punto, origen) => [
  (punto[1] - origen[1]) * KM_POR_GRADO_LONGITUD,
  (punto[0] - origen[0]) * KM_POR_GRADO_LATITUD,
]

const cruz = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

// Dónde se cortan los segmentos a-b y c-d (en km), o null si no se cortan.
function puntoDeCorte(a, b, c, d) {
  if (cruz(a, b, c) * cruz(a, b, d) >= 0 || cruz(c, d, a) * cruz(c, d, b) >= 0) return null
  const alCorte = cruz(c, d, a) / (cruz(c, d, a) - cruz(c, d, b))
  return [a[0] + alCorte * (b[0] - a[0]), a[1] + alCorte * (b[1] - a[1])]
}

function distanciaAlSegmento([a, b]) {
  const largo2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
  const t = largo2 ? Math.max(0, Math.min(1, -(a[0] * (b[0] - a[0]) + a[1] * (b[1] - a[1])) / largo2)) : 0
  return Math.hypot(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
}

function formanEsquina(punto, calleA, calleB) {
  const segmentos = calle =>
    calle.lines.flatMap(linea => linea.slice(1).map((fin, i) => [aKm(linea[i], punto), aKm(fin, punto)]))
  const cercanosDeA = segmentos(calleA).filter(
    segmento => distanciaAlSegmento(segmento) < CRUCE_CERCANO_KM * 2,
  )
  const segmentosDeB = segmentos(calleB).filter(
    segmento => distanciaAlSegmento(segmento) < CRUCE_CERCANO_KM * 2,
  )
  return cercanosDeA.some(([a, b]) =>
    segmentosDeB.some(([c, d]) => {
      const corte = puntoDeCorte(a, b, c, d)
      return corte && Math.hypot(...corte) < CRUCE_CERCANO_KM
    }),
  )
}

const esAutopista = calle => calle.kind === 'autopista'

// Las calles ya vienen de la más cercana a la más lejana.
function frasesDeCalles(punto, calles) {
  if (!calles.length) return []
  const principal = calles.find(calle => !esAutopista(calle)) ?? calles[0]
  const otras = calles.filter(calle => calle !== principal)
  const esquinas = otras.filter(
    calle => !sonParalelas(principal.name, calle.name) && formanEsquina(punto, principal, calle),
  )
  const acompanantes = otras.filter(calle => !esquinas.includes(calle))
  const frases = [
    esquinas.length
      ? `en la esquina de ${negrita(principal.name)} con ${esquinas.map(calle => negrita(calle.name)).join(' y ')}`
      : `en ${negrita(principal.name)}`,
  ]
  if (acompanantes.length)
    frases.push(`junto a ${acompanantes.map(calle => negrita(calle.name)).join(' y ')}`)
  return frases
}

const metros = km => Math.max(10, Math.round((km * 1000) / 10) * 10)

// "Estabas en la esquina de Av. A con Av. B, frente a Torre Entel, a 210 m del metro M (Barrio X, Las Condes)."
export function describirUbicacion(punto, calles) {
  const partes = frasesDeCalles(punto, calles)

  const cercano = lugarMasCercano(punto)
  if (cercano)
    partes.push(
      cercano.distancia <= FRENTE_A_KM
        ? `frente a ${negrita(cercano.lugar.name)}`
        : `a ${metros(cercano.distancia)} m de ${negrita(cercano.lugar.name)}`,
    )
  const metro = estacionCercana(punto)
  if (metro) partes.push(`a ${metros(metro.distancia)} m del metro ${negrita(metro.estacion.name)}`)

  const lugares = [barrioDelPunto(punto)?.name, comunaDelPunto(punto)]
    .filter(Boolean)
    .map(nombre => escaparHtml(nombreCorto(nombre)))
  const donde = lugares.length ? ` (${lugares.join(', ')})` : ''
  if (!partes.length) return lugares.length ? `Estabas en ${lugares.join(', ')}.` : ''
  return `Estabas ${partes.join(', ')}${donde}.`
}
