// Qué se puede hacer al llegar a un cruce, sobre el grafo vial (compartido/grafoVial.js).
// Se ofrece todo lo que un auto puede hacer de verdad (giros permitidos, sentidos únicos, retornos, rampas, rotondas) y nada
// que no lleve a ninguna parte (accesos, pasajes y calles sin salida). Los cruces que se toman casi a la vez (un giro a la
// izquierda que cruza el bandejón, una calle que se parte en dos tramos de pocos metros) son una sola decisión.

import {
  BANDERA,
  diferenciaDeRumbo,
  esFinDeCalle,
  giroPermitido,
  puntosDeArista,
  rumboDeLlegada,
  rumboDeSalida,
  salientesDe,
  segundosDeArista,
  segundosDeGiro,
} from '../../compartido/grafoVial.js'
import { largoDelTrazado, puntoCardinal, rumboEntreDistancias, unirTrazados } from './trazado.js'

export const METROS_PARA_AGRUPAR_CRUCES = 30
// Una calle que no sale a ninguna parte y cuyos tramos suman (ida y vuelta) menos que esto es un acceso o un pasaje.
export const METROS_MAXIMOS_DE_CALLEJON = 400
const MAXIMO_DE_TRAMOS_AGRUPADOS = 3
const MAXIMO_DE_OPCIONES_AGRUPADAS = 8
const METROS_PARA_BUSCAR_EL_NOMBRE = 800
const METROS_PARA_MEDIR_EL_GIRO = 30
const METROS_PARA_RECONOCER_UNA_VUELTA = 250
const GRADOS_DE_SEGUIR_DERECHO = 20
const GRADOS_DE_MANTENERSE = 55
const GRADOS_DE_VUELTA = 135
// Volviendo por la misma calle (el retorno de una avenida) la curva de la calle le quita grados al giro.
const GRADOS_DE_VUELTA_POR_LA_MISMA_CALLE = 100

export const TIPO = {
  SEGUIR: 'seguir',
  LEVE: 'leve',
  GIRO: 'giro',
  MANTENERSE: 'mantenerse',
  VUELTA: 'vuelta',
  ROTONDA: 'rotonda',
  ENTRADA: 'entrada',
  SALIDA: 'salida',
  RAMAL: 'ramal',
  PARTIDA: 'partida',
}

const esRotonda = (grafo, arista) => (grafo.banderas[arista] & BANDERA.ROTONDA) !== 0
const esEnlace = (grafo, arista) => (grafo.banderas[arista] & BANDERA.ENLACE) !== 0

export function nombreDeCalle(grafo, arista) {
  const { n: nombre, r: ruta } = grafo.nombres[grafo.nombre[arista]]
  return nombre || (ruta ? `Ruta ${ruta}` : '')
}

const TIPOS_DE_VIA = /^(avenida|av\.?|calle|camino|pasaje|ruta)\s+/
const sinTilde = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
const nombreParaComparar = nombre => sinTilde(nombre.toLowerCase()).replace(TIPOS_DE_VIA, '').trim()

export function mismaCalle(nombreA, nombreB) {
  return !!nombreA && !!nombreB && nombreParaComparar(nombreA) === nombreParaComparar(nombreB)
}

const callejonesPorGrafo = new WeakMap()
const destinosPorGrafo = new WeakMap()

// Una calle sin salida donde está el destino de una ruta sí se ofrece: si no, no se podría llegar. Vale hasta que se fije otro.
export function fijarDestinosEnCallesSinSalida(grafo, aristasDelDestino) {
  destinosPorGrafo.set(grafo, aristasDelDestino)
  callejonesPorGrafo.delete(grafo)
}

// Explora lo que hay detrás de `salida` sin volver a pasar por el cruce. Si se agota antes de sumar
// METROS_MAXIMOS_DE_CALLEJON, la calle no lleva a ninguna parte (volver por donde se entró no cuenta como salir).
function noLlevaANingunaParte(grafo, salida) {
  const destinos = destinosPorGrafo.get(grafo)
  const cruce = grafo.desde[salida]
  const retorno = grafo.inversa[salida]
  const vistas = new Set([salida])
  const pendientes = [salida]
  let metros = grafo.metros[salida]
  while (pendientes.length) {
    const actual = pendientes.pop()
    if (destinos?.has(actual)) return false
    if (grafo.hasta[actual] === cruce) {
      if (actual === retorno) continue
      return false
    }
    for (const siguiente of salientesDe(grafo, grafo.hasta[actual])) {
      if (vistas.has(siguiente) || !giroPermitido(grafo, actual, siguiente)) continue
      vistas.add(siguiente)
      metros += grafo.metros[siguiente]
      if (metros > METROS_MAXIMOS_DE_CALLEJON) return false
      pendientes.push(siguiente)
    }
  }
  return true
}

export function esCallejon(grafo, salida) {
  if (!callejonesPorGrafo.has(grafo)) callejonesPorGrafo.set(grafo, new Map())
  const conocidos = callejonesPorGrafo.get(grafo)
  if (!conocidos.has(salida)) conocidos.set(salida, noLlevaANingunaParte(grafo, salida))
  return conocidos.get(salida)
}

function salientesLegales(grafo, entrada) {
  return [...salientesDe(grafo, grafo.hasta[entrada])].filter(salida => giroPermitido(grafo, entrada, salida))
}

// Las calles por las que se puede seguir desde el cruce al que se llegó por `entrada` (sin las que no llevan a ninguna parte).
export function salidasPosibles(grafo, entrada) {
  const legales = salientesLegales(grafo, entrada)
  const utiles = legales.filter(salida => !esCallejon(grafo, salida))
  return utiles.length ? utiles : legales.filter(salida => salida === grafo.inversa[entrada])
}

export const hayQueDecidir = (grafo, entrada) => salidasPosibles(grafo, entrada).length >= 2

// ----- caminos: cada uno es una opción del cruce (varias aristas si hay cruces tan cerca que se toman a la vez)

function agruparCruces(grafo, camino, caminos) {
  const ultima = camino.at(-1)
  const sePuedeAgrupar =
    grafo.metros[ultima] <= METROS_PARA_AGRUPAR_CRUCES && camino.length < MAXIMO_DE_TRAMOS_AGRUPADOS
  const siguientes = sePuedeAgrupar ? salidasPosibles(grafo, ultima) : []
  if (siguientes.length < 2 || siguientes.some(salida => esRotonda(grafo, salida))) {
    caminos.push(camino)
    return
  }
  for (const salida of siguientes) agruparCruces(grafo, [...camino, salida], caminos)
}

// Al entrar a una rotonda las opciones son sus salidas, en el orden en que se van encontrando al darle la vuelta.
function recorrerRotonda(grafo, entrada, primera, caminos) {
  const nodosRevisados = new Set()
  const avanzar = camino => {
    const nodo = grafo.hasta[camino.at(-1)]
    if (nodosRevisados.has(nodo)) return
    nodosRevisados.add(nodo)
    for (const siguiente of salidasPosibles(grafo, camino.at(-1))) {
      if (esRotonda(grafo, siguiente)) avanzar([...camino, siguiente])
      else caminos.push([...camino, siguiente])
    }
  }
  avanzar([primera])
}

function caminosDelCruce(grafo, entrada) {
  const caminos = []
  for (const primera of salidasPosibles(grafo, entrada)) {
    if (esRotonda(grafo, primera) && !esRotonda(grafo, entrada))
      recorrerRotonda(grafo, entrada, primera, caminos)
    else agruparCruces(grafo, [primera], caminos)
  }
  if (caminos.length <= MAXIMO_DE_OPCIONES_AGRUPADAS) return caminos
  return salidasPosibles(grafo, entrada).map(primera => [primera])
}

function segundosDelCamino(grafo, entrada, camino) {
  let segundos = 0
  let anterior = entrada
  for (const arista of camino) {
    segundos += segundosDeGiro(grafo, anterior, arista) + segundosDeArista(grafo, arista)
    anterior = arista
  }
  return segundos
}

// De varios caminos que terminan en la misma arista se queda con el más rápido.
function sinRepetidos(grafo, entrada, caminos) {
  const mejores = new Map()
  for (const camino of caminos) {
    const segundos = segundosDelCamino(grafo, entrada, camino)
    const conocido = mejores.get(camino.at(-1))
    if (!conocido || segundos < conocido.segundos) mejores.set(camino.at(-1), { camino, segundos })
  }
  return [...mejores.values()]
}

// ----- cómo se llama cada opción

const unicaSalida = (grafo, arista) => {
  const siguientes = salidasPosibles(grafo, arista)
  return siguientes.length === 1 ? siguientes[0] : null
}

// Lo que el auto recorre solo después de la opción (mientras no haya nada que decidir), hasta `metrosMaximos`.
function continuacionObligada(grafo, camino, metrosMaximos) {
  const extension = []
  let metros = 0
  for (let ultima = unicaSalida(grafo, camino.at(-1)); ultima !== null && metros < metrosMaximos;) {
    extension.push(ultima)
    metros += grafo.metros[ultima]
    ultima = unicaSalida(grafo, ultima)
  }
  return extension
}

// Lo que dicen los carteles de las ramas de una rampa que se bifurca (la 11 de la Costanera: «Los Conquistadores» y «Huechuraba / Ciudad
// Empresarial»): se recorren las ramas sin pasar de las calles con nombre.
function cartelEnLasRamas(grafo, desde) {
  const carteles = []
  const vistas = new Set()
  const pendientes = [[desde, 0]]
  while (pendientes.length) {
    const [arista, metros] = pendientes.shift()
    for (const siguiente of salidasPosibles(grafo, arista)) {
      if (vistas.has(siguiente)) continue
      vistas.add(siguiente)
      carteles.push(...(grafo.etiquetas[siguiente]?.split(' / ') ?? []))
      const alFinal = metros + grafo.metros[siguiente]
      if (!nombreDeCalle(grafo, siguiente) && alFinal <= METROS_PARA_BUSCAR_EL_NOMBRE)
        pendientes.push([siguiente, alFinal])
    }
  }
  return [...new Set(carteles)].slice(0, 3).join(' / ') || null
}

// Una rampa o un ramal sin nombre se nombra por la calle a la que lleva: se sigue por la salida más derecha hasta encontrarla.
function nombreMasAdelante(grafo, desde) {
  let arista = desde
  for (let metros = 0; metros < METROS_PARA_BUSCAR_EL_NOMBRE;) {
    const siguientes = salidasPosibles(grafo, arista)
    if (!siguientes.length) return null
    const rumbo = rumboDeLlegada(grafo, arista)
    arista = siguientes.reduce((a, b) =>
      Math.abs(diferenciaDeRumbo(rumbo, rumboDeSalida(grafo, b))) <
      Math.abs(diferenciaDeRumbo(rumbo, rumboDeSalida(grafo, a)))
        ? b
        : a,
    )
    metros += grafo.metros[arista]
    if (nombreDeCalle(grafo, arista)) return arista
  }
  return null
}

// La calle a la que entra la opción: la última con nombre del camino o, si no tiene (rampas), la primera a la que llega.
function calleDelCamino(grafo, camino) {
  const nombrada = camino.findLast(arista => nombreDeCalle(grafo, arista))
  if (nombrada !== undefined)
    return { calle: nombreDeCalle(grafo, nombrada), esRamal: false, rango: grafo.rango[nombrada] }
  const alLlegar = nombreMasAdelante(grafo, camino.at(-1))
  if (alLlegar === null) return { calle: '', esRamal: true, rango: 7 }
  return { calle: nombreDeCalle(grafo, alLlegar), esRamal: true, rango: grafo.rango[alLlegar] }
}

function describirCamino(grafo, entrada, { camino, segundos }) {
  const trazado = unirTrazados(camino.map(arista => puntosDeArista(grafo, arista)))
  const largo = largoDelTrazado(trazado)
  const rumboDeEntrada = rumboDeLlegada(grafo, entrada)
  const rumboFinal = rumboDeLlegada(grafo, camino.at(-1))
  const continuacion = continuacionObligada(grafo, camino, METROS_PARA_RECONOCER_UNA_VUELTA)
  const { calle, esRamal, rango } = calleDelCamino(grafo, camino)
  // El cartel de una salida puede estar en cualquiera de los tramos de la rampa, no solo en el primero.
  const recorridoConCartel = [...camino, ...continuacion]
  const opcion = {
    camino,
    trazado,
    segundos,
    calle,
    esRamal,
    rangoDeLaCalle: rango,
    giroInicial: diferenciaDeRumbo(
      rumboDeEntrada,
      rumboEntreDistancias(trazado, 0, Math.min(METROS_PARA_MEDIR_EL_GIRO, largo)),
    ),
    giroNeto: diferenciaDeRumbo(rumboDeEntrada, rumboDeLlegada(grafo, [...camino, ...continuacion].at(-1))),
    rumboFinal,
    hacia: puntoCardinal(rumboFinal),
    mismaCalle: mismaCalle(calle, nombreDeCalle(grafo, entrada)),
    porRetorno: camino.length > 1 || esEnlace(grafo, camino[0]),
    destino:
      grafo.etiquetas[recorridoConCartel.find(arista => grafo.etiquetas[arista])] ??
      (esEnlace(grafo, camino[0]) ? cartelEnLasRamas(grafo, camino.at(-1)) : null),
    numeroDeSalida:
      grafo.salidasNumeradas[recorridoConCartel.find(arista => grafo.salidasNumeradas[arista])] ?? null,
  }
  opcion.tipo = clasificar(grafo, entrada, opcion)
  return opcion
}

function clasificar(grafo, entrada, opcion) {
  const primera = opcion.camino[0]
  if (esRotonda(grafo, primera) && !esRotonda(grafo, entrada)) return TIPO.ROTONDA
  const volverPorLaMismaCalle = opcion.camino.length === 1 && primera === grafo.inversa[entrada]
  const giro = Math.abs(opcion.giroInicial)
  const gradosDeVuelta = opcion.mismaCalle ? GRADOS_DE_VUELTA_POR_LA_MISMA_CALLE : GRADOS_DE_VUELTA
  const terminaEnSentidoContrario =
    giro >= GRADOS_DE_MANTENERSE && Math.abs(opcion.giroNeto) >= gradosDeVuelta
  const entraAUnaAutopista = !opcion.mismaCalle && opcion.rangoDeLaCalle <= 1
  if (volverPorLaMismaCalle || (terminaEnSentidoContrario && !entraAUnaAutopista)) return TIPO.VUELTA
  if (esEnlace(grafo, primera) && !(giro < GRADOS_DE_MANTENERSE && opcion.mismaCalle)) {
    if (esEnlace(grafo, entrada)) return TIPO.RAMAL
    if (grafo.rango[entrada] <= 1) return TIPO.SALIDA
    return opcion.rangoDeLaCalle <= 1 ? TIPO.ENTRADA : TIPO.RAMAL
  }
  if (giro < GRADOS_DE_SEGUIR_DERECHO || (giro < GRADOS_DE_MANTENERSE && opcion.mismaCalle))
    return TIPO.SEGUIR
  return giro < GRADOS_DE_MANTENERSE ? TIPO.LEVE : TIPO.GIRO
}

// Si dos o más caminos se abren casi de frente, no se dobla: se elige por cuál mantenerse.
function marcarBifurcaciones(opciones) {
  const juntas = opciones.filter(opcion => opcion.tipo === TIPO.SEGUIR || opcion.tipo === TIPO.LEVE)
  if (juntas.length < 2) return
  juntas.sort((a, b) => a.giroInicial - b.giroInicial)
  juntas.forEach((opcion, indice) => {
    opcion.tipo = TIPO.MANTENERSE
    opcion.posicion = indice === 0 ? 'izquierda' : indice === juntas.length - 1 ? 'derecha' : 'centro'
  })
}

function numerarSalidasDeRotonda(opciones) {
  opciones
    .filter(opcion => opcion.tipo === TIPO.ROTONDA)
    .sort((a, b) => a.camino.length - b.camino.length || a.giroInicial - b.giroInicial)
    .forEach((opcion, indice) => {
      opcion.numeroDeSalida = indice + 1
    })
}

const PESO_DEL_ORDEN = { [TIPO.VUELTA]: 2, [TIPO.ROTONDA]: 1 }

// Primero seguir de frente, después de izquierda a derecha, al final dar la vuelta. Las salidas de una rotonda, en el orden
// en que se las encuentra.
function ordenar(opciones) {
  const grupo = opcion => PESO_DEL_ORDEN[opcion.tipo] ?? (opcion.tipo === TIPO.SEGUIR ? -1 : 0)
  const posicion = opcion => (opcion.tipo === TIPO.ROTONDA ? opcion.numeroDeSalida : opcion.giroInicial)
  opciones.sort((a, b) => grupo(a) - grupo(b) || posicion(a) - posicion(b))
  opciones.forEach((opcion, indice) => {
    opcion.id = indice
  })
}

// El cruce al que se llega por `entrada`: sus opciones, ordenadas, y cuántas calles sin salida se dejaron fuera.
export function cruceDespuesDe(grafo, entrada) {
  const candidatos = sinRepetidos(grafo, entrada, caminosDelCruce(grafo, entrada))
  const opciones = candidatos.map(candidato => describirCamino(grafo, entrada, candidato))
  marcarBifurcaciones(opciones)
  numerarSalidasDeRotonda(opciones)
  ordenar(opciones)
  return {
    entrada,
    nodo: grafo.hasta[entrada],
    opciones,
    sinSalida: salientesLegales(grafo, entrada).filter(salida => esCallejon(grafo, salida)).length,
    esFinDeCalle: esFinDeCalle(grafo, grafo.hasta[entrada]),
  }
}
