// Menos decisiones en el juego de ruteo en auto: en cada cruce se omiten las calles claramente peores que además son más chicas que
// la que se lleva (los pasajes que salen a los lados de una avenida) y las vueltas en U claramente peores. La mejor opción nunca se
// omite, así que seguir la ruta óptima sigue siendo posible; si lo mejor es seguir derecho y no queda nada más, el auto sigue solo.
// El modo de conducción libre no lo usa.

import { costoDeLaOpcion } from './mision.js'
import { TIPO } from './cruces.js'

// Cuánto más tiene que tardar una opción que la mejor para considerarla "claramente peor".
export const SEGUNDOS_PARA_OMITIR_UNA_OPCION = 60

const esSeguirDerecho = opcion =>
  opcion.tipo === TIPO.SEGUIR || (opcion.tipo === TIPO.LEVE && opcion.mismaCalle)

// Devuelve el filtro que recibe cruceDespuesDe (junto con la calle por la que se llega).
export function filtroDeOpcionesClaramentePeores(grafo, mision, entrada) {
  const rangoActual = grafo.rango[entrada]
  return opciones => {
    if (opciones.length < 2) return opciones
    const costos = opciones.map(opcion => costoDeLaOpcion(grafo, mision, opcion))
    const mejor = Math.min(...costos)
    const indiceDeLaMejor = costos.indexOf(mejor)
    const sobra = (opcion, indice) =>
      indice !== indiceDeLaMejor &&
      opcion.tipo !== TIPO.ROTONDA &&
      costos[indice] - mejor >= SEGUNDOS_PARA_OMITIR_UNA_OPCION &&
      (opcion.rangoDeLaCalle > rangoActual || opcion.tipo === TIPO.VUELTA)
    const visibles = opciones.filter((opcion, indice) => !sobra(opcion, indice))
    // Si lo mejor es doblar y no queda con qué compararlo, se deja la alternativa más cercana: una sola opción no es decisión.
    if (visibles.length < 2 && !esSeguirDerecho(opciones[indiceDeLaMejor])) {
      const alternativaCercana = opciones
        .map((opcion, indice) => ({ opcion, indice }))
        .filter(({ opcion }) => !visibles.includes(opcion))
        .sort((a, b) => costos[a.indice] - costos[b.indice])[0]
      if (alternativaCercana)
        return opciones.filter(
          (opcion, indice) => visibles.includes(opcion) || indice === alternativaCercana.indice,
        )
    }
    return visibles
  }
}
