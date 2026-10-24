// Geometría de trazados: listas de puntos [lat, lon] que se recorren de principio a fin.

import { distanciaEnMetros, rumboEntre } from '../../compartido/grafoVial.js'

const METROS_POR_GRADO_DE_LATITUD = 111200
const METROS_POR_GRADO_DE_LONGITUD_EN_EL_ECUADOR = 111320

export function largoDelTrazado(trazado) {
  let metros = 0
  for (let i = 1; i < trazado.length; i++) metros += distanciaEnMetros(trazado[i - 1], trazado[i])
  return metros
}

// Une trazados que se siguen uno a otro: el último punto de uno es el primero del siguiente y no se repite.
export function unirTrazados(trazados) {
  const unido = []
  for (const trazado of trazados)
    for (const punto of trazado) {
      const ultimo = unido.at(-1)
      if (!ultimo || ultimo[0] !== punto[0] || ultimo[1] !== punto[1]) unido.push(punto)
    }
  return unido
}

// El punto que queda a `metros` del comienzo y el rumbo con que se pasa por ahí.
export function puntoEnElTrazado(trazado, metros) {
  let acumulado = 0
  for (let i = 1; i < trazado.length; i++) {
    const largo = distanciaEnMetros(trazado[i - 1], trazado[i])
    if (acumulado + largo >= metros || i === trazado.length - 1) {
      const fraccion = largo ? Math.min(1, Math.max(0, (metros - acumulado) / largo)) : 0
      return {
        punto: [
          trazado[i - 1][0] + (trazado[i][0] - trazado[i - 1][0]) * fraccion,
          trazado[i - 1][1] + (trazado[i][1] - trazado[i - 1][1]) * fraccion,
        ],
        rumbo: rumboEntre(trazado[i - 1], trazado[i]),
      }
    }
    acumulado += largo
  }
  return { punto: trazado[0], rumbo: 0 }
}

// El rumbo con que se avanza entre `desdeMetros` y `hastaMetros` (se mide con la cuerda, no con el tramo suelto).
export function rumboEntreDistancias(trazado, desdeMetros, hastaMetros) {
  const desde = puntoEnElTrazado(trazado, desdeMetros).punto
  const hasta = puntoEnElTrazado(trazado, hastaMetros).punto
  return rumboEntre(desde, hasta)
}

// Dónde queda `punto` respecto del trazado: a cuántos metros del comienzo cae su proyección (y qué fracción del largo es),
// el punto del trazado más cercano, a qué distancia de la línea está, con qué rumbo pasa el trazado por ahí y de qué lado queda
// el punto (1 a la derecha de quien avanza, -1 a la izquierda).
export function proyectarEnElTrazado(trazado, punto) {
  const metrosPorGradoDeLongitud =
    METROS_POR_GRADO_DE_LONGITUD_EN_EL_ECUADOR * Math.cos((punto[0] * Math.PI) / 180)
  const largoTotal = largoDelTrazado(trazado)
  let mejor = {
    distanciaMetros: Infinity,
    metrosDesdeElInicio: 0,
    fraccion: 0,
    punto: trazado[0],
    rumbo: 0,
    ladoDelTrazado: 0,
  }
  let acumulado = 0
  for (let i = 1; i < trazado.length; i++) {
    const ax = (trazado[i - 1][1] - punto[1]) * metrosPorGradoDeLongitud
    const ay = (trazado[i - 1][0] - punto[0]) * METROS_POR_GRADO_DE_LATITUD
    const dx = (trazado[i][1] - trazado[i - 1][1]) * metrosPorGradoDeLongitud
    const dy = (trazado[i][0] - trazado[i - 1][0]) * METROS_POR_GRADO_DE_LATITUD
    const cuadrado = dx * dx + dy * dy
    const fraccion = cuadrado ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / cuadrado)) : 0
    const distanciaMetros = Math.hypot(ax + fraccion * dx, ay + fraccion * dy)
    const largo = Math.sqrt(cuadrado)
    if (distanciaMetros < mejor.distanciaMetros) {
      const metrosDesdeElInicio = acumulado + fraccion * largo
      mejor = {
        distanciaMetros,
        metrosDesdeElInicio,
        fraccion: largoTotal ? metrosDesdeElInicio / largoTotal : 0,
        punto: [
          trazado[i - 1][0] + (trazado[i][0] - trazado[i - 1][0]) * fraccion,
          trazado[i - 1][1] + (trazado[i][1] - trazado[i - 1][1]) * fraccion,
        ],
        rumbo: rumboEntre(trazado[i - 1], trazado[i]),
        ladoDelTrazado: dx * -(ay + fraccion * dy) - dy * -(ax + fraccion * dx) < 0 ? 1 : -1,
      }
    }
    acumulado += largo
  }
  return mejor
}

const PUNTOS_CARDINALES = [
  'norte',
  'nororiente',
  'oriente',
  'suroriente',
  'sur',
  'surponiente',
  'poniente',
  'norponiente',
]

export const puntoCardinal = rumbo => PUNTOS_CARDINALES[Math.round((((rumbo % 360) + 360) % 360) / 45) % 8]

// Los primeros `metros` del trazado.
export function recortarTrazado(trazado, metros) {
  const recortado = [trazado[0]]
  let acumulado = 0
  for (let i = 1; i < trazado.length; i++) {
    const largo = distanciaEnMetros(trazado[i - 1], trazado[i])
    if (acumulado + largo >= metros) return [...recortado, puntoEnElTrazado(trazado, metros).punto]
    recortado.push(trazado[i])
    acumulado += largo
  }
  return recortado
}
