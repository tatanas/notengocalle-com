// Grafo vial dirigido de "Ruta libre". Lo genera tools/grafo (a partir de OpenStreetMap) y lo leen el juego y las herramientas.
// Cada arista es un tramo de calle en un sentido, entre dos cruces; el estado de un recorrido es la arista por la que se
// llegó a un cruce, porque las prohibiciones de giro y el costo de doblar dependen de por dónde se entra.

import { decodificarPolilinea } from './rutaEnAuto.js'

export const RANGO_DE_ARTERIA = 4

export const BANDERA = {
  SEMAFORO: 1,
  ROTONDA: 2,
  ENLACE: 4,
  SENTIDO_UNICO: 8,
  PARE: 16,
  FUERA_DEL_AREA: 32,
}

// Rango de la calle: 0 autopista, 1 troncal, 2 primaria, 3 secundaria, 4 terciaria, 5 sin clasificar, 6 residencial, 7 de servicio.
export const RANGO_POR_CLASE_DE_OSM = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
  residential: 6,
  living_street: 6,
  service: 7,
}
export const KMH_POR_RANGO = [80, 60, 45, 40, 35, 25, 20, 12]

export const SEGUNDOS_DE_SEMAFORO = 20
export const SEGUNDOS_DE_PARE = 6
export const SEGUNDOS_DE_VUELTA_EN_U = 15
// Entre calles chicas hay pares, ceda el paso y lomos de toro: atravesar un barrio por dentro cuesta más que lo que dice su largo.
const SEGUNDOS_POR_CRUCE_ENTRE_CALLES_CHICAS = 4
export const SEGUNDOS_DE_ENTRAR_A_ROTONDA = 4
const SEGUNDOS_DE_DOBLAR_A_LA_DERECHA = 4
const SEGUNDOS_DE_DOBLAR_A_LA_IZQUIERDA = 8
const SEGUNDOS_DE_CURVA_CERRADA = 2
const METROS_PARA_MEDIR_EL_RUMBO = 25

const METROS_POR_GRADO_DE_LATITUD = 111200
const METROS_POR_GRADO_DE_LONGITUD_EN_EL_ECUADOR = 111320

export function distanciaEnMetros([latitudA, longitudA], [latitudB, longitudB]) {
  const metrosPorGradoDeLongitud =
    METROS_POR_GRADO_DE_LONGITUD_EN_EL_ECUADOR * Math.cos((((latitudA + latitudB) / 2) * Math.PI) / 180)
  return Math.hypot(
    (latitudB - latitudA) * METROS_POR_GRADO_DE_LATITUD,
    (longitudB - longitudA) * metrosPorGradoDeLongitud,
  )
}

// Rumbo en grados desde el norte, hacia el este.
export function rumboEntre([latitudA, longitudA], [latitudB, longitudB]) {
  const metrosAlEste =
    (longitudB - longitudA) *
    METROS_POR_GRADO_DE_LONGITUD_EN_EL_ECUADOR *
    Math.cos((((latitudA + latitudB) / 2) * Math.PI) / 180)
  const metrosAlNorte = (latitudB - latitudA) * METROS_POR_GRADO_DE_LATITUD
  return (Math.atan2(metrosAlEste, metrosAlNorte) * 180) / Math.PI + (metrosAlEste < 0 ? 360 : 0)
}

// Positivo = a la derecha, negativo = a la izquierda; entre -180 y 180.
export const diferenciaDeRumbo = (desde, hasta) => ((((hasta - desde) % 360) + 540) % 360) - 180

export class ColaDePrioridad {
  constructor() {
    this.costos = []
    this.valores = []
  }

  get cantidad() {
    return this.costos.length
  }

  agregar(costo, valor) {
    const { costos, valores } = this
    let hueco = costos.length
    costos.push(costo)
    valores.push(valor)
    while (hueco > 0) {
      const padre = (hueco - 1) >> 1
      if (costos[padre] <= costo) break
      costos[hueco] = costos[padre]
      valores[hueco] = valores[padre]
      hueco = padre
    }
    costos[hueco] = costo
    valores[hueco] = valor
  }

  sacar() {
    const { costos, valores } = this
    const costoMinimo = costos[0]
    const valorMinimo = valores[0]
    const ultimoCosto = costos.pop()
    const ultimoValor = valores.pop()
    const cantidad = costos.length
    if (cantidad > 0) {
      let hueco = 0
      for (;;) {
        let hijo = 2 * hueco + 1
        if (hijo >= cantidad) break
        if (hijo + 1 < cantidad && costos[hijo + 1] < costos[hijo]) hijo++
        if (costos[hijo] >= ultimoCosto) break
        costos[hueco] = costos[hijo]
        valores[hueco] = valores[hijo]
        hueco = hijo
      }
      costos[hueco] = ultimoCosto
      valores[hueco] = ultimoValor
    }
    return [costoMinimo, valorMinimo]
  }
}

function indiceCsr(cantidadDeNodos, nodoDeCadaArista) {
  const inicios = new Int32Array(cantidadDeNodos + 1)
  for (const nodo of nodoDeCadaArista) inicios[nodo + 1]++
  for (let nodo = 0; nodo < cantidadDeNodos; nodo++) inicios[nodo + 1] += inicios[nodo]
  const aristas = new Int32Array(nodoDeCadaArista.length)
  const siguiente = inicios.slice(0, cantidadDeNodos)
  nodoDeCadaArista.forEach((nodo, arista) => {
    aristas[siguiente[nodo]++] = arista
  })
  return { inicios, aristas }
}

// datos: lo que escribe tools/grafo/construirGrafo.mjs. Coordenadas de los nodos en grados × 1e5.
export function cargarGrafo(datos) {
  const cantidadDeNodos = datos.nodos.lat.length
  const cantidadDeAristas = datos.aristas.desde.length
  const desde = Int32Array.from(datos.aristas.desde)
  const hasta = Int32Array.from(datos.aristas.hasta)
  const salientes = indiceCsr(cantidadDeNodos, desde)
  const entrantes = indiceCsr(cantidadDeNodos, hasta)
  return {
    cantidadDeNodos,
    cantidadDeAristas,
    latitud: Float64Array.from(datos.nodos.lat, valor => valor / 1e5),
    longitud: Float64Array.from(datos.nodos.lon, valor => valor / 1e5),
    desde,
    hasta,
    metros: Float32Array.from(datos.aristas.metros),
    kmh: Float32Array.from(datos.aristas.kmh),
    rango: Uint8Array.from(datos.aristas.rango),
    nombre: Int32Array.from(datos.aristas.nombre),
    banderas: Uint8Array.from(datos.aristas.banderas),
    inversa: Int32Array.from(datos.aristas.inversa),
    nombres: datos.nombres,
    formas: datos.formas ?? {},
    etiquetas: datos.etiquetas ?? {},
    salidasNumeradas: datos.salidas ?? {},
    prohibidos: new Set(datos.giros.map(([entrada, salida]) => entrada * cantidadDeAristas + salida)),
    inicioDeSalientes: salientes.inicios,
    salientes: salientes.aristas,
    inicioDeEntrantes: entrantes.inicios,
    entrantes: entrantes.aristas,
    rumbosDeSalida: new Float32Array(cantidadDeAristas).fill(NaN),
    rumbosDeLlegada: new Float32Array(cantidadDeAristas).fill(NaN),
    formasDecodificadas: new Map(),
    meta: datos.meta ?? {},
  }
}

export function salientesDe(grafo, nodo) {
  return grafo.salientes.subarray(grafo.inicioDeSalientes[nodo], grafo.inicioDeSalientes[nodo + 1])
}

export function entrantesA(grafo, nodo) {
  return grafo.entrantes.subarray(grafo.inicioDeEntrantes[nodo], grafo.inicioDeEntrantes[nodo + 1])
}

export const puntoDelNodo = (grafo, nodo) => [grafo.latitud[nodo], grafo.longitud[nodo]]

// La parte de una polilínea entre dos fracciones de su largo (0 a 1): el origen y el destino quedan a mitad de una arista.
export function recortarPuntos(puntos, desde, hasta) {
  if (desde <= 0 && hasta >= 1) return puntos
  const largos = puntos.slice(1).map((punto, i) => distanciaEnMetros(puntos[i], punto))
  const total = largos.reduce((suma, largo) => suma + largo, 0)
  const comienzo = desde * total
  const fin = hasta * total
  const recortados = []
  const puntoA = distancia => {
    let acumulado = 0
    for (let i = 0; i < largos.length; i++) {
      if (acumulado + largos[i] >= distancia || i === largos.length - 1) {
        const fraccion = largos[i] ? Math.min(1, Math.max(0, (distancia - acumulado) / largos[i])) : 0
        return [
          puntos[i][0] + (puntos[i + 1][0] - puntos[i][0]) * fraccion,
          puntos[i][1] + (puntos[i + 1][1] - puntos[i][1]) * fraccion,
        ]
      }
      acumulado += largos[i]
    }
    return puntos[0]
  }
  recortados.push(puntoA(comienzo))
  let acumulado = 0
  for (let i = 1; i < puntos.length - 1; i++) {
    acumulado += largos[i - 1]
    if (acumulado > comienzo && acumulado < fin) recortados.push(puntos[i])
  }
  recortados.push(puntoA(fin))
  return recortados
}

// Los puntos de la arista, de un cruce al otro; la forma intermedia viene en una polilínea de 6 decimales.
export function puntosDeArista(grafo, arista) {
  let puntos = grafo.formasDecodificadas.get(arista)
  if (puntos) return puntos
  const intermedios = grafo.formas[arista] ? decodificarPolilinea(grafo.formas[arista]) : []
  puntos = [
    puntoDelNodo(grafo, grafo.desde[arista]),
    ...intermedios,
    puntoDelNodo(grafo, grafo.hasta[arista]),
  ]
  grafo.formasDecodificadas.set(arista, puntos)
  return puntos
}

// El punto de la arista más cercano a `punto` (para saber hacia dónde queda la calle desde un origen).
export function puntoMasCercanoDeArista(grafo, arista, punto) {
  const puntos = puntosDeArista(grafo, arista)
  let mejor = puntos[0]
  let menorDistancia = Infinity
  for (let i = 1; i < puntos.length; i++) {
    const metrosPorGradoDeLongitud =
      METROS_POR_GRADO_DE_LONGITUD_EN_EL_ECUADOR * Math.cos((punto[0] * Math.PI) / 180)
    const ax = (puntos[i - 1][1] - punto[1]) * metrosPorGradoDeLongitud
    const ay = (puntos[i - 1][0] - punto[0]) * METROS_POR_GRADO_DE_LATITUD
    const dx = (puntos[i][1] - puntos[i - 1][1]) * metrosPorGradoDeLongitud
    const dy = (puntos[i][0] - puntos[i - 1][0]) * METROS_POR_GRADO_DE_LATITUD
    const cuadrado = dx * dx + dy * dy
    const t = cuadrado ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / cuadrado)) : 0
    const distancia = Math.hypot(ax + t * dx, ay + t * dy)
    if (distancia < menorDistancia) {
      menorDistancia = distancia
      mejor = [
        puntos[i - 1][0] + (puntos[i][0] - puntos[i - 1][0]) * t,
        puntos[i - 1][1] + (puntos[i][1] - puntos[i - 1][1]) * t,
      ]
    }
  }
  return mejor
}

function puntoAMetrosDelBorde(puntos, metros, desdeElFinal) {
  const recorrido = desdeElFinal ? [...puntos].reverse() : puntos
  let acumulado = 0
  for (let i = 1; i < recorrido.length; i++) {
    acumulado += distanciaEnMetros(recorrido[i - 1], recorrido[i])
    if (acumulado >= metros) return recorrido[i]
  }
  return recorrido.at(-1)
}

export function rumboDeSalida(grafo, arista) {
  if (Number.isNaN(grafo.rumbosDeSalida[arista])) {
    const puntos = puntosDeArista(grafo, arista)
    grafo.rumbosDeSalida[arista] = rumboEntre(
      puntos[0],
      puntoAMetrosDelBorde(puntos, METROS_PARA_MEDIR_EL_RUMBO, false),
    )
  }
  return grafo.rumbosDeSalida[arista]
}

export function rumboDeLlegada(grafo, arista) {
  if (Number.isNaN(grafo.rumbosDeLlegada[arista])) {
    const puntos = puntosDeArista(grafo, arista)
    grafo.rumbosDeLlegada[arista] = rumboEntre(
      puntoAMetrosDelBorde(puntos, METROS_PARA_MEDIR_EL_RUMBO, true),
      puntos.at(-1),
    )
  }
  return grafo.rumbosDeLlegada[arista]
}

export function esFinDeCalle(grafo, nodo) {
  const salientes = salientesDe(grafo, nodo)
  const entrantes = entrantesA(grafo, nodo)
  return salientes.length === 1 && entrantes.length === 1 && grafo.inversa[salientes[0]] === entrantes[0]
}

// Doblar en U solo se puede donde la calle termina; en los demás casos los retornos son calles del grafo.
export function giroPermitido(grafo, entrada, salida) {
  if (grafo.prohibidos.has(entrada * grafo.cantidadDeAristas + salida)) return false
  if (salida === grafo.inversa[entrada]) return esFinDeCalle(grafo, grafo.hasta[entrada])
  return true
}

export const segundosDeArista = (grafo, arista) => grafo.metros[arista] / (grafo.kmh[arista] / 3.6)

export function segundosDeGiro(grafo, entrada, salida) {
  const banderasDeEntrada = grafo.banderas[entrada]
  let segundos = 0
  if (banderasDeEntrada & BANDERA.SEMAFORO) segundos += SEGUNDOS_DE_SEMAFORO
  else if (banderasDeEntrada & BANDERA.PARE) segundos += SEGUNDOS_DE_PARE
  if (salida === grafo.inversa[entrada]) return segundos + SEGUNDOS_DE_VUELTA_EN_U
  const entraEnRotonda = grafo.banderas[salida] & BANDERA.ROTONDA
  const veniaEnRotonda = banderasDeEntrada & BANDERA.ROTONDA
  if (entraEnRotonda && veniaEnRotonda) return segundos
  if (entraEnRotonda) return segundos + SEGUNDOS_DE_ENTRAR_A_ROTONDA
  if (grafo.rango[entrada] > RANGO_DE_ARTERIA && grafo.rango[salida] > RANGO_DE_ARTERIA)
    segundos += SEGUNDOS_POR_CRUCE_ENTRE_CALLES_CHICAS
  const angulo = diferenciaDeRumbo(rumboDeLlegada(grafo, entrada), rumboDeSalida(grafo, salida))
  if (angulo >= 30) return segundos + SEGUNDOS_DE_DOBLAR_A_LA_DERECHA
  if (angulo <= -30) return segundos + SEGUNDOS_DE_DOBLAR_A_LA_IZQUIERDA
  return segundos + (Math.abs(angulo) >= 15 ? SEGUNDOS_DE_CURVA_CERRADA : 0)
}

// Segundos que faltan, desde el comienzo de cada arista, para llegar a una de las entradas del destino.
// llegadas: [{ arista, fraccion }], donde fraccion es el punto de la arista (0 a 1) en que queda la entrada.
export function segundosQueFaltan(grafo, llegadas) {
  const faltan = new Float64Array(grafo.cantidadDeAristas).fill(Infinity)
  const cola = new ColaDePrioridad()
  for (const { arista, fraccion } of llegadas) {
    const segundos = segundosDeArista(grafo, arista) * fraccion
    if (segundos < faltan[arista]) {
      faltan[arista] = segundos
      cola.agregar(segundos, arista)
    }
  }
  while (cola.cantidad) {
    const [segundos, arista] = cola.sacar()
    if (segundos > faltan[arista]) continue
    for (const anterior of entrantesA(grafo, grafo.desde[arista])) {
      if (!giroPermitido(grafo, anterior, arista)) continue
      const candidato = segundosDeArista(grafo, anterior) + segundosDeGiro(grafo, anterior, arista) + segundos
      if (candidato < faltan[anterior]) {
        faltan[anterior] = candidato
        cola.agregar(candidato, anterior)
      }
    }
  }
  return faltan
}

// Camino más rápido hacia delante desde el cruce al que se llegó por `aristaDeEntrada`. `esMeta(arista)` decide dónde termina;
// `puedeUsar(arista)` limita por dónde se puede ir; no se pasa de `maximoDeMetros` antes de llegar a la meta (la arista de la meta no cuenta). Devuelve { aristas, segundos } o null.
export function buscarCamino(
  grafo,
  aristaDeEntrada,
  { esMeta, puedeUsar = () => true, maximoDeMetros = Infinity },
) {
  const mejores = new Map()
  const cola = new ColaDePrioridad()
  const estados = [{ arista: aristaDeEntrada, anterior: -1, segundos: 0, metros: 0 }]
  cola.agregar(0, 0)
  while (cola.cantidad) {
    const [segundos, indice] = cola.sacar()
    const estado = estados[indice]
    if (segundos > (mejores.get(estado.arista) ?? Infinity)) continue
    if (estado.anterior !== -1 && esMeta(estado.arista)) {
      const aristas = []
      for (let i = indice; estados[i].anterior !== -1; i = estados[i].anterior)
        aristas.push(estados[i].arista)
      return { aristas: aristas.reverse(), segundos }
    }
    for (const siguiente of salientesDe(grafo, grafo.hasta[estado.arista])) {
      if (!giroPermitido(grafo, estado.arista, siguiente) || !puedeUsar(siguiente)) continue
      const metros = estado.metros + grafo.metros[siguiente]
      if (metros > maximoDeMetros && !esMeta(siguiente)) continue
      const costo =
        segundos + segundosDeGiro(grafo, estado.arista, siguiente) + segundosDeArista(grafo, siguiente)
      if (costo >= (mejores.get(siguiente) ?? Infinity)) continue
      mejores.set(siguiente, costo)
      estados.push({ arista: siguiente, anterior: indice, segundos: costo, metros })
      cola.agregar(costo, estados.length - 1)
    }
  }
  return null
}
