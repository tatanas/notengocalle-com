// Menos decisiones en el juego de ruteo en auto: en cada cruce se omiten las calles claramente peores que además son más chicas que
// la que se lleva (los pasajes que salen a los lados de una avenida) y las vueltas en U claramente peores. Cuanto más lejos del
// destino, más se relaja: "claramente peor" pide una diferencia mayor, y desde lejos solo importan las calles colectoras o mayores
// (cómo salir de un barrio no es urgente; sí a qué arteria salir). La mejor opción nunca se omite, así que seguir la ruta óptima
// sigue siendo posible; si no queda nada que comparar, el auto sigue solo. El modo de conducción libre no lo usa.

import { RANGO_DE_ARTERIA } from '../../compartido/grafoVial.js'
import { costoDeLaOpcion } from './mision.js'
import { TIPO } from './cruces.js'

// Cuánto más tiene que tardar una opción que la mejor para considerarla "claramente peor": una fracción de lo que falta, entre
// el mínimo y el máximo (60 s sobre un viaje de 5 min es mucho; sobre uno de 30 min no).
export const SEGUNDOS_PARA_OMITIR_UNA_OPCION = 60
export const SEGUNDOS_MAXIMOS_PARA_OMITIR_UNA_OPCION = 240
export const FRACCION_DE_LO_QUE_FALTA = 0.12
// Desde cuánto falta (en la mejor opción) las calles locales dejan de ser decisión.
export const SEGUNDOS_PARA_ESTAR_LEJOS = 420
// Desde lejos, lo que cambia menos que esta fracción de lo que falta da lo mismo (cae dentro de la tolerancia del puntaje).
export const FRACCION_QUE_DA_LO_MISMO = 0.025

export const segundosParaOmitirUnaOpcion = segundosQueFaltan =>
  Math.min(
    SEGUNDOS_MAXIMOS_PARA_OMITIR_UNA_OPCION,
    Math.max(SEGUNDOS_PARA_OMITIR_UNA_OPCION, segundosQueFaltan * FRACCION_DE_LO_QUE_FALTA),
  )

const esSeguirDerecho = opcion =>
  opcion.tipo === TIPO.SEGUIR || (opcion.tipo === TIPO.LEVE && opcion.mismaCalle)

// Nunca se omiten las entradas, salidas y ramales (son errores que se pueden cometer y conviene aprendérselos), ni escoger entre
// dos calles distintas que siguen más o menos de frente (Santa Teresa o Gran Vía).
const esUnaRamaQueSiempreSeMuestra = opcion =>
  [TIPO.SALIDA, TIPO.ENTRADA, TIPO.RAMAL].includes(opcion.tipo) ||
  ((opcion.tipo === TIPO.SEGUIR || opcion.tipo === TIPO.LEVE) && !opcion.mismaCalle)

// Devuelve el filtro que recibe cruceDespuesDe (junto con la calle por la que se llega). En una autopista no se omite nada.
export function filtroDeOpcionesClaramentePeores(grafo, mision, entrada) {
  const rangoActual = grafo.rango[entrada]
  return opciones => {
    if (opciones.length < 2 || rangoActual <= 1) return opciones
    const costos = opciones.map(opcion => costoDeLaOpcion(grafo, mision, opcion))
    const mejor = Math.min(...costos)
    const indiceDeLaMejor = costos.indexOf(mejor)
    const laMejorEsSeguir = esSeguirDerecho(opciones[indiceDeLaMejor])
    const estaLejos = mejor >= SEGUNDOS_PARA_ESTAR_LEJOS
    const diferenciaParaOmitir = segundosParaOmitirUnaOpcion(mejor)
    const esMasLocal = opcion => opcion.rangoDeLaCalle > rangoActual
    const esClaramentePeorYMasLocal = (opcion, indice) =>
      costos[indice] - mejor >= diferenciaParaOmitir && (esMasLocal(opcion) || opcion.tipo === TIPO.VUELTA)
    // Si lo mejor es seguir por la calle que se lleva, las calles más chicas que salen a los lados no llevan a ninguna parte.
    const esUnaRamaLateral = opcion => laMejorEsSeguir && esMasLocal(opcion)
    const sobraDesdeLejos = (opcion, indice) =>
      estaLejos &&
      (opcion.rangoDeLaCalle > RANGO_DE_ARTERIA ||
        opcion.tipo === TIPO.VUELTA ||
        (opcion.mismaCalle && costos[indice] - mejor < mejor * FRACCION_QUE_DA_LO_MISMO))
    const sobra = (opcion, indice) =>
      indice !== indiceDeLaMejor &&
      opcion.tipo !== TIPO.ROTONDA &&
      !esUnaRamaQueSiempreSeMuestra(opcion) &&
      (esClaramentePeorYMasLocal(opcion, indice) ||
        esUnaRamaLateral(opcion) ||
        sobraDesdeLejos(opcion, indice))
    const visibles = opciones.filter((opcion, indice) => !sobra(opcion, indice))
    // Si lo mejor es doblar y no queda con qué compararlo, se deja la alternativa más cercana: una sola opción no es decisión.
    // Desde lejos sí lo es: el auto dobla solo.
    if (visibles.length < 2 && !estaLejos && !laMejorEsSeguir) {
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
