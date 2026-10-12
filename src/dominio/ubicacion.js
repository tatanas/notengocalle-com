import { distanciaKm, puntoEnPoligono, puntoEnRasgo } from '../nucleo/geografia.js'
import { escaparHtml } from '../nucleo/utilidades.js'
import { DATOS, comunas, estaciones } from '../datos/datos.js'

// Hasta dónde un lugar está "frente a" el punto, y hasta dónde solo "cerca".
const FRENTE_A_KM = 0.04
const CERCA_DE_KM = 0.15
const METRO_CERCANO_KM = 0.4
const ES_UN_CERRO = /^k/

const negrita = texto => `<b>${escaparHtml(texto)}</b>`

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

// "A con B" para dos calles; "A, B y C" para más.
const unirConCon = nombres =>
  nombres.length === 2 ? nombres.join(' con ') : nombres.slice(0, -1).join(', ') + ' y ' + nombres.at(-1)

const metros = km => Math.max(10, Math.round((km * 1000) / 10) * 10)

// "Estabas en Av. Apoquindo con Av. Tomás Moro, frente a Torre Entel, cerca del metro Manquehue, en Las Condes."
export function describirUbicacion(punto, calles) {
  const partes = []
  if (calles.length === 1) partes.push(`en ${negrita(calles[0].name)}`)
  else if (calles.length > 1)
    partes.push(`en la esquina de ${unirConCon(calles.map(calle => negrita(calle.name)))}`)
  partes.push(`en la esquina de ${calles.map(calle => negrita(calle.name)).join(' con ')}`)

  const cercano = lugarMasCercano(punto)
  if (cercano)
    partes.push(
      cercano.distancia <= FRENTE_A_KM
        ? `frente a ${negrita(cercano.lugar.name)}`
        : `a ${metros(cercano.distancia)} m de ${negrita(cercano.lugar.name)}`,
    )
  const barrio = barrioDelPunto(punto)
  if (barrio) partes.push(`en ${negrita(barrio.name)}`)
  const metro = estacionCercana(punto)
  if (metro) partes.push(`a ${metros(metro.distancia)} m del metro ${negrita(metro.estacion.name)}`)
  const comuna = comunaDelPunto(punto)
  if (comuna) partes.push(`en ${escaparHtml(comuna)}`)
  return partes.length ? `Estabas ${partes.join(', ')}.` : ''
}
