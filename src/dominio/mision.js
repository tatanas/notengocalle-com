// Una misión de conducción: llegar de un punto a otro lo más cerca posible de la ruta óptima. El óptimo sale del mismo grafo y de
// los mismos costos con que se maneja (un Dijkstra inverso desde el destino): ninguna consulta mientras se juega, y en cada
// decisión se sabe cuánto tiempo le falta a cada opción.

import {
  buscarCamino,
  puntosDeArista,
  segundosDeArista,
  segundosQueFaltan,
} from '../../compartido/grafoVial.js'
import { fijarDestinosEnCallesSinSalida, nombreDeCalle } from './cruces.js'
import { costosDelRecorrido } from './tiempos.js'
import { largoDelTrazado, unirTrazados } from './trazado.js'

// Hasta un 3 % sobre el óptimo es 100 (hay rutas casi empatadas); al pasar del doble se pierde todo.
export const TOLERANCIA_DEL_OPTIMO = 1.03
export const LIMITE_PARA_PERDER = 2
const SEGUNDOS_MINIMOS_PARA_CONTARLO_COMO_ERROR = 5
const CUANTOS_ERRORES_SE_MUESTRAN = 3

// El destino de una misión: las aristas con que se llega (las que tocan el lugar, ver lugaresDeRuteo.js) y cuánto falta desde el
// comienzo de cada arista del grafo.
export function prepararMision(grafo, destinos) {
  fijarDestinosEnCallesSinSalida(grafo, destinos)
  const faltan = segundosQueFaltan(
    grafo,
    [...destinos].map(arista => ({ arista, fraccion: 1 })),
  )
  return { destinos, faltan }
}

// Lo que cuesta una opción: sus segundos más lo que falta después de ella (sin contar la calle en que termina, que ya está
// en lo que cuesta).
export function costoDeLaOpcion(grafo, mision, opcion) {
  const ultima = opcion.camino.at(-1)
  return opcion.segundos + mision.faltan[ultima] - segundosDeArista(grafo, ultima)
}

// La ruta más rápida desde la partida: parte por la mejor de las opciones de salida.
export function rutaOptima(grafo, mision, opcionesDePartida) {
  let mejor = null
  for (const partida of opcionesDePartida) {
    const primera = partida.camino[0]
    const camino = mision.destinos.has(primera)
      ? { aristas: [], segundos: 0 }
      : buscarCamino(grafo, primera, { esMeta: arista => mision.destinos.has(arista) })
    if (!camino) continue
    const segundos = partida.segundos + camino.segundos
    if (!mejor || segundos < mejor.segundos)
      mejor = { partida, aristas: [primera, ...camino.aristas], segundos }
  }
  if (!mejor) return null
  return {
    aristas: mejor.aristas,
    trazado: unirTrazados([
      mejor.partida.trazado,
      ...mejor.aristas.slice(1).map(arista => puntosDeArista(grafo, arista)),
    ]),
    ...costosDelRecorrido(grafo, mejor.aristas, largoDelTrazado(mejor.partida.trazado)),
  }
}

// Lo que cuesta cada opción de la decisión pendiente (segundos hasta llegar yendo por ella y después por lo mejor).
export const costosDeLasOpciones = ({ grafo, mision, decision }) =>
  decision.opciones.map(opcion => costoDeLaOpcion(grafo, mision, opcion))

// Anota cuánto se pierde en una decisión: lo que cuesta la opción elegida menos lo que cuesta la mejor.
// `medirTramo(opcion)` dice cuánto se tarda por esa opción hasta la próxima decisión: el "tramo" con que se compara lo perdido.
export function registrarDecision(estado, opcionElegida, medirTramo) {
  const { decision } = estado
  if (decision.opciones.length < 2) return
  const costos = costosDeLasOpciones(estado)
  const mejor = Math.min(...costos)
  const elegido = costos[decision.opciones.indexOf(opcionElegida)]
  const mejorOpcion = decision.opciones[costos.indexOf(mejor)]
  estado.historial.push({
    metros: estado.metros,
    entrada: estado.entrada,
    opciones: decision.opciones,
    elegida: opcionElegida,
    mejor: mejorOpcion,
    segundosPerdidos: Number.isFinite(elegido) ? elegido - mejor : Infinity,
    segundosDelTramoOptimo: medirTramo(mejorOpcion),
  })
}

// Cuánto más se demoraría el recorrido, yendo desde aquí por lo mejor, que la ruta óptima (0 si se sigue por el óptimo).
export function segundosDeDesvio(estado, optima) {
  const mejorRestante = Math.min(...costosDeLasOpciones(estado))
  return Math.max(0, estado.segundos + mejorRestante - optima.segundos)
}

export const yaSeFueDemasiadoLejos = (estado, optima) =>
  optima.segundos + segundosDeDesvio(estado, optima) > optima.segundos * LIMITE_PARA_PERDER

// Cómo fue una decisión: lo perdido frente a la mejor opción, medido contra el tramo que esa mejor opción tarda hasta la próxima
// decisión. Hasta un cuarto del tramo (o menos de 15 s, que es lo mismo) es bien; si se pierde tanto como el tramo (el doble de lo
// que debía tardar), mal; en el medio, pasable. Nada bajo 20 s es malo.
const SEGUNDOS_QUE_NO_IMPORTAN = 15
const FRACCION_DEL_TRAMO_QUE_ES_BIEN = 0.25
const SEGUNDOS_MINIMOS_DE_UN_TRAMO_PARA_COMPARAR = 20
export function veredictoDeLaDecision(segundosPerdidos, segundosDelTramoOptimo) {
  if (!Number.isFinite(segundosPerdidos)) return 'mal'
  const tramo = Math.max(segundosDelTramoOptimo, SEGUNDOS_MINIMOS_DE_UN_TRAMO_PARA_COMPARAR)
  if (segundosPerdidos >= tramo) return 'mal'
  if (
    segundosPerdidos < SEGUNDOS_QUE_NO_IMPORTAN ||
    segundosPerdidos <= tramo * FRACCION_DEL_TRAMO_QUE_ES_BIEN
  )
    return 'bien'
  return 'regular'
}

export function puntajeDeLaRuta(razon) {
  if (razon <= TOLERANCIA_DEL_OPTIMO) return 100
  if (razon >= LIMITE_PARA_PERDER) return 0
  return Math.round((100 * (LIMITE_PARA_PERDER - razon)) / (LIMITE_PARA_PERDER - TOLERANCIA_DEL_OPTIMO))
}

// Metros por autopistas concesionadas (Autopista Central, Costanera Norte, Vespucio Sur…): las que cobran TAG.
const ES_AUTOPISTA_CON_TAG = /^Autopista /i
const metrosPorAutopistasConTag = (grafo, aristas) =>
  aristas
    .filter(arista => grafo.rango[arista] <= 1 && ES_AUTOPISTA_CON_TAG.test(nombreDeCalle(grafo, arista)))
    .reduce((suma, arista) => suma + grafo.metros[arista], 0)

// El resultado de una misión terminada: lo recorrido, lo óptimo, el puntaje y las decisiones donde más se perdió.
export function analizarRecorrido(estado, optima) {
  const { grafo } = estado
  const jugador = {
    ...costosDelRecorrido(grafo, estado.recorrido, estado.metrosDePartida),
    metrosConTag: metrosPorAutopistasConTag(grafo, estado.recorrido),
  }
  const razon = jugador.segundos / optima.segundos
  return {
    jugador,
    optima: { ...optima, metrosConTag: metrosPorAutopistasConTag(grafo, optima.aristas) },
    razon,
    puntaje: puntajeDeLaRuta(razon),
    errores: estado.historial
      .filter(registro => registro.segundosPerdidos >= SEGUNDOS_MINIMOS_PARA_CONTARLO_COMO_ERROR)
      .sort((a, b) => b.segundosPerdidos - a.segundosPerdidos)
      .slice(0, CUANTOS_ERRORES_SE_MUESTRAN)
      .map(registro => ({
        ...registro,
        calle: registro.entrada === null ? 'La partida' : nombreDeCalle(grafo, registro.entrada),
      })),
  }
}
