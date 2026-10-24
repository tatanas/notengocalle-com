// Dónde poner la cámara de Street View en cada decisión de "Ruta libre": un poco antes del cruce, mirando hacia donde se avanza.
// Siempre dentro de la calle por la que se viene: si se acaba de doblar a una calle corta, la cámara no retrocede a la calle
// anterior (se vería el mismo cruce otra vez).

import {
  diferenciaDeRumbo,
  distanciaEnMetros,
  puntosDeArista,
  rumboDeLlegada,
  rumboDeSalida,
  rumboEntre,
} from '../../compartido/grafoVial.js'
import { rumboDeLaVistaEnElOrigen } from './rutaLibre.js'

const METROS_ANTES_DEL_CRUCE = 50
const METROS_DE_LAS_CAMARAS_DE_RESPALDO = [80, 120, 180]
const FRACCION_DE_LA_CALLE_CORTA = 0.6
const GRADOS_PARA_SEGUIR_EN_LA_MISMA_CALLE = 30

function sigueLaMismaCalle(grafo, anterior, actual) {
  return (
    grafo.nombre[anterior] === grafo.nombre[actual] &&
    Math.abs(diferenciaDeRumbo(rumboDeLlegada(grafo, anterior), rumboDeSalida(grafo, actual))) <=
      GRADOS_PARA_SEGUIR_EN_LA_MISMA_CALLE
  )
}

// Lo último que se recorrió, sin salir de la calle por la que se viene (hasta `metrosNecesarios`).
export function trazadoDeLaCalleActual(grafo, aristas, metrosNecesarios) {
  const trazado = []
  let metros = 0
  for (let i = aristas.length - 1; i >= 0 && metros < metrosNecesarios; i--) {
    const puntos = puntosDeArista(grafo, aristas[i])
    trazado.unshift(...(trazado.length ? puntos.slice(0, -1) : puntos))
    metros += grafo.metros[aristas[i]]
    if (i > 0 && !sigueLaMismaCalle(grafo, aristas[i - 1], aristas[i])) break
  }
  return trazado
}

const largoDelTrazado = trazado =>
  trazado.slice(1).reduce((suma, punto, i) => suma + distanciaEnMetros(trazado[i], punto), 0)

// El punto que queda a `metros` del final del trazado, con el rumbo con que se pasa por ahí.
function puntoAntesDelFinal(trazado, metros) {
  let acumulado = 0
  for (let i = trazado.length - 1; i > 0; i--) {
    const largo = distanciaEnMetros(trazado[i - 1], trazado[i])
    if (acumulado + largo >= metros) {
      const fraccion = (metros - acumulado) / largo
      return {
        punto: [
          trazado[i][0] + (trazado[i - 1][0] - trazado[i][0]) * fraccion,
          trazado[i][1] + (trazado[i - 1][1] - trazado[i][1]) * fraccion,
        ],
        rumbo: rumboEntre(trazado[i - 1], trazado[i]),
      }
    }
    acumulado += largo
  }
  return { punto: trazado[0], rumbo: rumboEntre(trazado[0], trazado[1] ?? trazado[0]) }
}

// aristas: lo recorrido hasta la decisión (vacío si es la primera, en el origen).
export function camaraDeLaDecision(grafo, aristas, ruta) {
  if (!aristas.length) {
    const [lat, lon] = ruta.origen.punto
    return {
      lat,
      lon,
      rumbo: rumboDeLaVistaEnElOrigen(grafo, ruta),
      lugarDeLaDecision: null,
      camarasDeRespaldo: [],
    }
  }
  const maximo = Math.max(METROS_ANTES_DEL_CRUCE, ...METROS_DE_LAS_CAMARAS_DE_RESPALDO)
  const trazado = trazadoDeLaCalleActual(grafo, aristas, maximo)
  const largo = largoDelTrazado(trazado)
  const principal = puntoAntesDelFinal(
    trazado,
    Math.min(METROS_ANTES_DEL_CRUCE, largo * FRACCION_DE_LA_CALLE_CORTA),
  )
  return {
    lat: principal.punto[0],
    lon: principal.punto[1],
    rumbo: principal.rumbo,
    lugarDeLaDecision: trazado.at(-1),
    camarasDeRespaldo: METROS_DE_LAS_CAMARAS_DE_RESPALDO.filter(metros => metros < largo).map(
      metros => puntoAntesDelFinal(trazado, metros).punto,
    ),
  }
}
