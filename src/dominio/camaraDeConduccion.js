// Dónde poner la cámara de Street View en cada decisión: sobre la calle por la que se viene, unos metros antes del cruce y
// mirando hacia donde se avanza. Devuelve también el trazado que el panorama tiene que respetar: Street View solo ofrece el
// panorama más cercano, y en un cruce o junto a un bandejón el más cercano puede ser de otra calle.

import { largoDelTrazado, proyectarEnElTrazado, puntoEnElTrazado } from './trazado.js'

export const METROS_ANTES_DEL_CRUCE = 45
const METROS_DE_LAS_CAMARAS_DE_RESPALDO = [80, 120, 180]
const FRACCION_DE_UN_TRAMO_CORTO = 0.6

// estado: lo que devuelve empezarEn / elegirOpcion (src/dominio/conduccion.js), con una decisión pendiente.
export function camaraDeLaDecision({ decision, trazadoActual }) {
  if (decision.esPartida) {
    const [primera] = decision.opciones
    return {
      trazado: primera.trazado,
      largo: largoDelTrazado(primera.trazado),
      sinMargenes: true,
      candidatas: [{ punto: primera.trazado[0], rumbo: primera.rumboFinal, metrosAntesDelCruce: null }],
    }
  }
  const largo = largoDelTrazado(trazadoActual)
  const distancias = [
    Math.min(METROS_ANTES_DEL_CRUCE, largo * FRACCION_DE_UN_TRAMO_CORTO),
    ...METROS_DE_LAS_CAMARAS_DE_RESPALDO.filter(metros => metros < largo * 0.95),
  ]
  return {
    trazado: trazadoActual,
    largo,
    sinMargenes: false,
    candidatas: distancias.map(metros => ({
      ...puntoEnElTrazado(trazadoActual, largo - metros),
      metrosAntesDelCruce: metros,
    })),
  }
}

const METROS_MAXIMOS_AL_TRAZADO = 18
const METROS_LIBRES_EN_LOS_EXTREMOS = 6

// Si un panorama sirve para esta cámara: queda sobre el trazado, ni antes de donde empieza ni pegado al cruce (ahí se ve la
// calle de al lado). `rumbo` es hacia donde se avanza en el punto donde quedó.
export function evaluarPanorama(camara, posicion) {
  const proyeccion = proyectarEnElTrazado(camara.trazado, posicion)
  const margen =
    camara.sinMargenes || camara.largo < 3 * METROS_LIBRES_EN_LOS_EXTREMOS ? 0 : METROS_LIBRES_EN_LOS_EXTREMOS
  const dentro =
    proyeccion.metrosDesdeElInicio >= margen && proyeccion.metrosDesdeElInicio <= camara.largo - margen
  return {
    distanciaAlTrazado: proyeccion.distanciaMetros,
    metrosAntesDelCruce: camara.largo - proyeccion.metrosDesdeElInicio,
    rumbo: camara.trazado.length > 1 ? proyeccion.rumbo : camara.candidatas[0].rumbo,
    ladoDelTrazado: proyeccion.ladoDelTrazado,
    sirve: dentro && proyeccion.distanciaMetros <= METROS_MAXIMOS_AL_TRAZADO,
  }
}
