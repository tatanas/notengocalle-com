// Conducir libremente por el grafo vial: se parte de un punto y se avanza de decisión en decisión. Donde hay una sola cosa
// que hacer el auto sigue solo; donde hay dos o más (src/dominio/cruces.js) se detiene y espera que se elija.

import {
  puntosDeArista,
  recortarPuntos,
  segundosDeArista,
  segundosDeGiro,
} from '../../compartido/grafoVial.js'
import { aristasCercaDe } from './indiceDeAristas.js'
import { cruceDespuesDe, nombreDeCalle, TIPO } from './cruces.js'
import { registrarDecision } from './mision.js'
import {
  largoDelTrazado,
  proyectarEnElTrazado,
  puntoCardinal,
  rumboEntreDistancias,
  unirTrazados,
} from './trazado.js'

export const METROS_MAXIMOS_PARA_UBICAR_LA_PARTIDA = 80
const MAXIMO_DE_TRAMOS_SIN_DECISION = 600
const METROS_PARA_MEDIR_EL_RUMBO_DE_PARTIDA = 30

// La calle del grafo más cercana a `punto`: la arista, en qué fracción de ella queda y el punto sobre la calle.
export function aristaMasCercana(grafo, punto, radioMaximoM = METROS_MAXIMOS_PARA_UBICAR_LA_PARTIDA) {
  let mejor = null
  for (const arista of aristasCercaDe(grafo, punto, radioMaximoM)) {
    const proyeccion = proyectarEnElTrazado(puntosDeArista(grafo, arista), punto)
    if (
      proyeccion.distanciaMetros <= radioMaximoM &&
      (!mejor || proyeccion.distanciaMetros < mejor.distanciaMetros)
    )
      mejor = { arista, ...proyeccion }
  }
  return mejor
}

function opcionDePartida(grafo, arista, fraccion, id) {
  const trazado = recortarPuntos(puntosDeArista(grafo, arista), fraccion, 1)
  const rumbo = rumboEntreDistancias(trazado, 0, METROS_PARA_MEDIR_EL_RUMBO_DE_PARTIDA)
  return {
    id,
    tipo: TIPO.PARTIDA,
    camino: [arista],
    trazado,
    segundos: segundosDeArista(grafo, arista) * (1 - fraccion),
    calle: nombreDeCalle(grafo, arista),
    esRamal: false,
    giroInicial: 0,
    rumboFinal: rumbo,
    hacia: puntoCardinal(rumbo),
  }
}

// La decisión de la partida: por dónde se sale. `partidas` son [{ arista, fraccion, punto }]: una por cada calle y sentido posibles.
function decisionDePartida(grafo, partidas) {
  const vistas = new Set()
  const opciones = partidas
    .map(({ arista, fraccion }, indice) => opcionDePartida(grafo, arista, fraccion, indice))
    .filter(opcion => {
      const clave = `${opcion.calle}|${opcion.hacia}`
      return !vistas.has(clave) && vistas.add(clave)
    })
    .map((opcion, indice) => ({ ...opcion, id: indice }))
  return { esPartida: true, entrada: null, nodo: null, punto: partidas[0].punto, opciones, sinSalida: 0 }
}

// Partiendo a mitad de una calle: se puede salir hacia los dos lados (si la calle es de un solo sentido, hacia uno).
function partidasEnUnaCalle(grafo, { arista, fraccion, punto }) {
  const opuesta = grafo.inversa[arista]
  return [
    { arista, fraccion, punto },
    ...(opuesta === -1 ? [] : [{ arista: opuesta, fraccion: 1 - fraccion, punto }]),
  ]
}

// `mision` (src/dominio/mision.js) es opcional: con ella el juego termina al llegar y se anota lo que se pierde en cada decisión.
// Con `salidas` ([{ arista, fraccion, punto }], ver lugaresDeRuteo.js) se parte de un lugar con varias salidas y se elige por cuál.
export function empezarEn(grafo, punto, { radioMaximoM, mision = null, salidas = null } = {}) {
  const cercana = salidas?.length ? null : aristaMasCercana(grafo, punto, radioMaximoM)
  if (!salidas?.length && !cercana) return null
  const partidas = salidas?.length ? salidas : partidasEnUnaCalle(grafo, cercana)
  const estado = {
    grafo,
    partida: partidas[0].punto,
    recorrido: [],
    puntosRecorridos: [partidas[0].punto],
    trazadoActual: [partidas[0].punto],
    metros: 0,
    segundos: 0,
    decision: decisionDePartida(grafo, partidas),
    opcionesDePartida: null,
    entrada: null,
    avisos: [],
    mision,
    historial: [],
    llego: false,
    metrosDePartida: 0,
  }
  estado.opcionesDePartida = estado.decision.opciones
  if (estado.decision.opciones.length === 1) elegirOpcion(estado, 0)
  return estado
}

// Suma lo que se recorre. `trazado` es lo nuevo; el trazado actual (desde la última decisión) empieza de nuevo si se acaba de
// elegir y sigue creciendo si el auto avanza solo. En la partida solo cuenta el tramo que queda adelante.
function recorrer(estado, camino, trazado, { avanzaSolo = false, tramoParcial = null } = {}) {
  const { grafo } = estado
  let anterior = estado.entrada
  for (const arista of camino) {
    estado.segundos +=
      segundosDeArista(grafo, arista) + (anterior === null ? 0 : segundosDeGiro(grafo, anterior, arista))
    estado.metros += grafo.metros[arista]
    anterior = arista
  }
  if (tramoParcial) {
    estado.segundos += tramoParcial.segundos - segundosDeArista(grafo, camino[0])
    estado.metros += tramoParcial.metros - grafo.metros[camino[0]]
  }
  estado.recorrido.push(...camino)
  if (estado.mision && camino.some(arista => estado.mision.destinos.has(arista))) estado.llego = true
  estado.entrada = camino.at(-1)
  estado.trazadoActual = avanzaSolo ? unirTrazados([estado.trazadoActual, trazado]) : trazado
  estado.puntosRecorridos = unirTrazados([estado.puntosRecorridos, trazado])
}

// Una maniobra obligada que el jugador debe ver se muestra como decisión de una sola opción: cambiar de calle (de Cerro La Campana
// a José Alcalde Délano, de Kennedy a la Costanera) o dar la vuelta donde la calle termina. Lo demás (seguir por una rampa que
// da vueltas, curvas) se recorre solo.
const esAutopista = nombre => /^(Autopista|Túnel) /i.test(nombre)

function esManiobraObligada(grafo, entrada, opcion) {
  if (opcion.tipo === TIPO.VUELTA)
    return opcion.camino.length === 1 && opcion.camino[0] === grafo.inversa[entrada]
  const calleActual = nombreDeCalle(grafo, entrada)
  if (!calleActual || !opcion.calle || opcion.mismaCalle) return false
  // Seguir de frente sin más es automático, salvo que la calle pase a ser una autopista (Kennedy se une a la Costanera).
  return opcion.tipo !== TIPO.SEGUIR || (esAutopista(opcion.calle) && !esAutopista(calleActual))
}

// Sigue solo mientras no haya nada que decidir; se detiene en el próximo cruce con más de una opción o con una maniobra obligada.
function avanzarHastaLaProximaDecision(estado) {
  const { grafo } = estado
  for (let tramos = 0; tramos < MAXIMO_DE_TRAMOS_SIN_DECISION; tramos++) {
    if (estado.llego) break
    const cruce = cruceDespuesDe(grafo, estado.entrada)
    const [unica] = cruce.opciones
    if (cruce.opciones.length >= 2 || (unica && esManiobraObligada(grafo, estado.entrada, unica))) {
      estado.decision = { ...cruce, esObligada: cruce.opciones.length === 1 }
      return
    }
    if (!unica) break
    recorrer(estado, unica.camino, unica.trazado, { avanzaSolo: true })
  }
  estado.decision = null
}

export function elegirOpcion(estado, idDeLaOpcion) {
  const opcion = estado.decision.opciones.find(candidata => candidata.id === idDeLaOpcion)
  if (estado.mision) registrarDecision(estado, opcion)
  estado.avisos = []
  estado.decision = null
  const tramoParcial =
    opcion.tipo === TIPO.PARTIDA
      ? { metros: largoDelTrazado(opcion.trazado), segundos: opcion.segundos }
      : null
  if (tramoParcial) {
    estado.metrosDePartida = tramoParcial.metros
    estado.puntosRecorridos = []
  }
  recorrer(estado, opcion.camino, opcion.trazado, { tramoParcial })
  avanzarHastaLaProximaDecision(estado)
  return opcion
}

// Para que una prueba o un recorrido guiado pueda seguir una lista de aristas ya conocida (si quedan menos que las de la opción,
// que termina más allá del final, basta que coincidan las que quedan).
export function opcionQueSigue(estado, aristasPorRecorrer) {
  return estado.decision.opciones.find(opcion =>
    opcion.camino.every(
      (arista, indice) => indice >= aristasPorRecorrer.length || arista === aristasPorRecorrer[indice],
    ),
  )
}

export const calleActual = estado =>
  estado.entrada === null ? '' : nombreDeCalle(estado.grafo, estado.entrada)
