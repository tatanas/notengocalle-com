// "Ruta libre": un recorrido de A a B sobre el grafo vial (compartido/grafoVial.js). El jugador decide en cada cruce relevante;
// lo demás se recorre solo. Este módulo no sabe de pantallas: entrega las decisiones y mide cómo le fue.

import {
  BANDERA,
  RANGO_DE_ARTERIA,
  buscarCamino,
  diferenciaDeRumbo,
  distanciaEnMetros,
  entrantesA,
  giroPermitido,
  puntoDelNodo,
  puntoMasCercanoDeArista,
  rumboDeLlegada,
  rumboDeSalida,
  rumboEntre,
  salientesDe,
  segundosDeArista,
  segundosDeGiro,
  segundosQueFaltan,
} from '../../compartido/grafoVial.js'

const METROS_DONDE_SE_OFRECE_TODO = 300
const METROS_DONDE_SE_OFRECE_LA_VUELTA = 1000
const GRADOS_DE_LA_CONTINUACION = 30
const GRADOS_MAXIMOS_PARA_PERMANECER = 100
const GRADOS_DE_UNA_ESQUINA = 45
const METROS_MAXIMOS_DE_UN_CONECTOR = 800
const METROS_MAXIMOS_DE_UNA_VUELTA = 1500
const GRADOS_PARA_SEGUIR_DERECHO = 20
const GRADOS_PARA_MANTENERSE = 60
const GRADOS_DE_LA_CALLE_CONTRARIA = 150
const VECES_EL_OPTIMO_PARA_ABANDONAR = 3
const TOLERANCIA_DEL_OPTIMO = 1.05
const VECES_EL_OPTIMO_SIN_PUNTOS = 2
const SEGUNDOS_QUE_NO_SE_CUENTAN_COMO_PERDIDA = 10
const PASOS_MAXIMOS_SIN_DECIDIR = 20000
const ANGULO_DE_LA_VUELTA = 360
const RANGO_DE_ARTERIA_PRINCIPAL = 3
const GRADOS_DEL_RETORNO = 120
const GRADOS_MAXIMOS_ENTRE_RAMAS_DE_UNA_BIFURCACION = 35
const CANTIDAD_DE_CALLES_RECIENTES = 10
const METROS_ENTRE_LOS_NODOS_DE_UNA_MISMA_SALIDA = 60
const GRADOS_ENTRE_LAS_CALZADAS_DE_UNA_SALIDA = 90
const METROS_DE_UN_CRUCE_COMPLEJO = 200
const METROS_DE_UN_TRAMO_DE_CRUCE_COMPLEJO = 100
const PASOS_MAXIMOS_DE_UN_CRUCE_COMPLEJO = 6
const GRADOS_DE_DAR_LA_VUELTA = 150
const METROS_PARA_MIRAR_HACIA_LA_CALLE = 3
const ARISTAS_MAXIMAS_DE_UN_PASAJE = 60
const CRUCES_EN_UNA_VENTANA = 3
const METROS_DE_UNA_VENTANA = 800
const OPCIONES_MAXIMAS_DE_UNA_VENTANA = 8
const METROS_PARA_DECIR_LA_DISTANCIA = 30
const ORDEN_DE_LO_QUE_VA_AL_FINAL = 1e9
const ORDEN_DE_LO_QUE_VA_AL_PRINCIPIO = -1e9
const RANGO_DE_UNA_AUTOPISTA = 1

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

export function puntajeDeLaRuta(optimoSegundos, segundos) {
  const veces = segundos / optimoSegundos
  if (veces <= TOLERANCIA_DEL_OPTIMO) return 100
  if (veces >= VECES_EL_OPTIMO_SIN_PUNTOS) return 0
  return Math.round(
    (100 * (VECES_EL_OPTIMO_SIN_PUNTOS - veces)) / (VECES_EL_OPTIMO_SIN_PUNTOS - TOLERANCIA_DEL_OPTIMO),
  )
}

const SIN_NOMBRE = 'calle sin nombre'
const METROS_MAXIMOS_DE_UN_CAMINO_SIN_NOMBRE = 2000
const ARISTAS_MAXIMAS_DE_UN_ENLACE = 12

const tieneNombre = (grafo, arista) => {
  const { n, r } = grafo.nombres[grafo.nombre[arista]]
  return !!(n || r)
}

function nombreDeLaCalle(grafo, arista) {
  const { n, r } = grafo.nombres[grafo.nombre[arista]]
  return n || r || SIN_NOMBRE
}

// Un enlace (rampa, salida) casi nunca tiene nombre: la calle a la que lleva es la primera con nombre que se encuentra siguiéndolo.
function calleDeLaSalida(grafo, arista) {
  let actual = arista
  for (let i = 0; i < ARISTAS_MAXIMAS_DE_UN_ENLACE; i++) {
    if (tieneNombre(grafo, actual) || !(grafo.banderas[actual] & BANDERA.ENLACE)) break
    const siguientes = Array.from(salientesDe(grafo, grafo.hasta[actual])).filter(
      otra => otra !== grafo.inversa[actual],
    )
    const conNombre = siguientes.find(otra => tieneNombre(grafo, otra))
    const enlaces = siguientes.filter(otra => grafo.banderas[otra] & BANDERA.ENLACE)
    // La rampa sigue por su propio ramal; la calle que empalma en el camino (la que se ve en el mismo nodo) no es a donde lleva.
    const proxima = enlaces.length === 1 ? enlaces[0] : conNombre
    if (proxima === undefined) break
    actual = proxima
  }
  return actual
}

// Un camino sin nombre (los del cerro Santa Lucía, un estacionamiento) se describe por la calle con nombre a la que sale:
// la más importante de las primeras que se encuentran siguiéndolo.
function calleAlFinalDelCamino(grafo, arista) {
  const vistas = new Set([arista])
  let frontera = [{ arista, metros: grafo.metros[arista] }]
  let mejor = null
  while (frontera.length && !mejor) {
    const siguientes = []
    for (const { arista: ultima, metros } of frontera) {
      if (metros > METROS_MAXIMOS_DE_UN_CAMINO_SIN_NOMBRE) continue
      for (const otra of salientesDe(grafo, grafo.hasta[ultima])) {
        if (vistas.has(otra) || otra === grafo.inversa[ultima]) continue
        vistas.add(otra)
        if (!tieneNombre(grafo, otra)) siguientes.push({ arista: otra, metros: metros + grafo.metros[otra] })
        else if (!mejor || grafo.rango[otra] < grafo.rango[mejor]) mejor = otra
      }
    }
    frontera = siguientes
  }
  return mejor === null ? null : nombreDeLaCalle(grafo, mejor)
}

const nombreDeLaSalida = (grafo, arista) => nombreDeLaCalle(grafo, calleDeLaSalida(grafo, arista))

const esLaMismaCalle = (grafo, a, b) =>
  grafo.nombre[a] === grafo.nombre[b] && !!grafo.nombres[grafo.nombre[a]].n

function giroDe(angulo) {
  const grados = Math.abs(angulo)
  const lado = angulo > 0 ? 'derecha' : 'izquierda'
  if (grados <= GRADOS_PARA_SEGUIR_DERECHO) return 'recto'
  if (grados <= GRADOS_PARA_MANTENERSE) return `mantenerse-${lado}`
  if (grados >= GRADOS_DE_DAR_LA_VUELTA) return 'atras'
  return lado
}

function segundosDeSalirDelOrigen(grafo, { arista, fraccion }) {
  return (1 - fraccion) * segundosDeArista(grafo, arista)
}

function segundosSiguiendoDesde(grafo, faltan, arista) {
  let mejor = Infinity
  for (const siguiente of salientesDe(grafo, grafo.hasta[arista]))
    if (giroPermitido(grafo, arista, siguiente))
      mejor = Math.min(mejor, segundosDeGiro(grafo, arista, siguiente) + faltan[siguiente])
  return mejor
}

function segundosDesdeElOrigen(grafo, faltan, llegadas, salida) {
  const fraccionDeLlegada = llegadas.get(salida.arista)
  if (fraccionDeLlegada !== undefined && fraccionDeLlegada >= salida.fraccion)
    return (fraccionDeLlegada - salida.fraccion) * segundosDeArista(grafo, salida.arista)
  return segundosDeSalirDelOrigen(grafo, salida) + segundosSiguiendoDesde(grafo, faltan, salida.arista)
}

// ruta: el `meta` del grafo ({ origen: { punto, aristas }, destino: { punto, aristas } }).
export function crearRecorrido(grafo, ruta) {
  const faltan = segundosQueFaltan(grafo, ruta.destino.aristas)
  const llegadas = new Map(ruta.destino.aristas.map(({ arista, fraccion }) => [arista, fraccion]))
  const optimoSegundos = Math.min(
    ...ruta.origen.aristas.map(salida => segundosDesdeElOrigen(grafo, faltan, llegadas, salida)),
  )
  if (!Number.isFinite(optimoSegundos)) throw new Error('El destino no se puede alcanzar desde el origen')
  const recorrido = {
    grafo,
    ruta,
    faltan,
    llegadas,
    optimoSegundos,
    aristas: [],
    actual: -1,
    segundos: 0,
    fin: null,
    decision: null,
    historial: [],
    intentos: [],
    reinicios: 0,
    conectores: new Map(),
    pasajes: new Map(),
  }
  avanzarHastaDecidir(recorrido)
  return recorrido
}

function estaCercaDeLosExtremos(recorrido, nodo, metros = METROS_DONDE_SE_OFRECE_TODO) {
  const punto = puntoDelNodo(recorrido.grafo, nodo)
  return [recorrido.ruta.origen.punto, recorrido.ruta.destino.punto].some(
    extremo => distanciaEnMetros(punto, extremo) <= metros,
  )
}

const nombresDeLasCallesRecientes = ({ grafo, aristas }) =>
  new Set(aristas.slice(-CANTIDAD_DE_CALLES_RECIENTES).map(arista => nombreDeLaCalle(grafo, arista)))

// Una calle chica que lleva a otra arteria importante sin pasar por más arterias: sirve para pasar de una calle importante a otra.
function conectorDe(recorrido, actual, salida) {
  const { grafo, conectores } = recorrido
  const clave = `${salida}:${grafo.nombre[actual]}`
  if (!conectores.has(clave)) {
    const recientes = nombresDeLasCallesRecientes(recorrido)
    const nodoDeLaDecision = grafo.hasta[actual]
    const vuelveAlCruce = arista =>
      grafo.desde[arista] === nodoDeLaDecision ||
      grafo.hasta[arista] === nodoDeLaDecision ||
      esLaMismaCalle(grafo, arista, actual)
    const esArteriaDistinta = arista =>
      grafo.rango[arista] <= RANGO_DE_ARTERIA_PRINCIPAL &&
      tieneNombre(grafo, arista) &&
      !esLaMismaCalle(grafo, arista, actual) &&
      !esLaMismaCalle(grafo, arista, salida) &&
      !recientes.has(nombreDeLaCalle(grafo, arista))
    const camino = buscarCamino(grafo, salida, {
      esMeta: esArteriaDistinta,
      puedeUsar: arista =>
        !vuelveAlCruce(arista) &&
        (grafo.rango[arista] > RANGO_DE_ARTERIA_PRINCIPAL || esArteriaDistinta(arista)),
      maximoDeMetros: METROS_MAXIMOS_DE_UN_CONECTOR - grafo.metros[salida],
    })
    conectores.set(clave, camino && nombreDeLaCalle(grafo, camino.aristas.at(-1)))
  }
  return conectores.get(clave)
}

// Las calles que llegan a un nodo del anillo, sin contar el anillo.
function callesQueLlegan(grafo, cruce) {
  const aristas = [...salientesDe(grafo, cruce), ...entrantesA(grafo, cruce)].filter(
    arista => !(grafo.banderas[arista] & BANDERA.ROTONDA),
  )
  const haciaAfuera = arista =>
    grafo.desde[arista] === cruce ? rumboDeSalida(grafo, arista) : (rumboDeLlegada(grafo, arista) + 180) % 360
  return {
    aristas,
    rumbos: aristas.map(haciaAfuera),
    nombres: new Set(
      aristas.filter(arista => tieneNombre(grafo, arista)).map(arista => grafo.nombre[arista]),
    ),
  }
}

// Una calle con dos calzadas llega al anillo por dos nodos (uno por donde entra y otro por donde sale) y es una sola salida.
function esLaMismaSalida(anterior, nueva, metrosEntreLosNodos) {
  if (!anterior || metrosEntreLosNodos > METROS_ENTRE_LOS_NODOS_DE_UNA_MISMA_SALIDA) return false
  const salenParaElMismoLado = nueva.rumbos.some(nuevo =>
    anterior.rumbos.some(
      previo => Math.abs(diferenciaDeRumbo(previo, nuevo)) <= GRADOS_ENTRE_LAS_CALZADAS_DE_UNA_SALIDA,
    ),
  )
  if (!salenParaElMismoLado) return false
  if (!anterior.nombres.size && !nueva.nombres.size) return true
  return [...nueva.nombres].some(nombre => anterior.nombres.has(nombre))
}

function opcionesDeRotonda(recorrido, nodo, permitidas) {
  const { grafo, actual } = recorrido
  const entrada = permitidas.find(arista => grafo.banderas[arista] & BANDERA.ROTONDA)
  if (entrada === undefined || grafo.banderas[actual] & BANDERA.ROTONDA) return null
  const opciones = []
  const anillo = []
  let orden = 0
  let ultimaSalida = null
  let metrosDesdeLaUltimaSalida = 0
  let enElAnillo = entrada
  while (enElAnillo !== undefined) {
    anillo.push(enElAnillo)
    metrosDesdeLaUltimaSalida += grafo.metros[enElAnillo]
    const cruce = grafo.hasta[enElAnillo]
    if (cruce === nodo) break
    const llegan = callesQueLlegan(grafo, cruce)
    if (llegan.aristas.length) {
      if (!esLaMismaSalida(ultimaSalida, llegan, metrosDesdeLaUltimaSalida)) orden++
      ultimaSalida = llegan
      metrosDesdeLaUltimaSalida = 0
    }
    for (const salida of salientesDe(grafo, cruce))
      if (!(grafo.banderas[salida] & BANDERA.ROTONDA) && giroPermitido(grafo, enElAnillo, salida))
        opciones.push({ aristas: [...anillo, salida], arista: salida, tipo: 'rotonda', orden })
    enElAnillo = salientesDe(grafo, cruce).find(arista => grafo.banderas[arista] & BANDERA.ROTONDA)
  }
  return opciones
}

// Una calle que, sin volver por el cruce de donde sale, no lleva a ninguna parte (con su mini rotonda para las casas, por ejemplo).
function esUnPasajeSinSalida(recorrido, salida, { desdeElOrigen = false } = {}) {
  const { grafo, llegadas, ruta, pasajes } = recorrido
  if (pasajes.has(salida)) return pasajes.get(salida)
  const cruce = grafo.desde[salida]
  const vistas = new Set([salida])
  const pendientes = [salida]
  const salidasDeA = new Set(desdeElOrigen ? [] : ruta.origen.aristas.map(({ arista }) => arista))
  let sinSalida = true
  while (pendientes.length && sinSalida) {
    const arista = pendientes.pop()
    if (llegadas.has(arista) || salidasDeA.has(arista)) sinSalida = false
    const fin = grafo.hasta[arista]
    if (fin === cruce) continue
    for (const siguiente of salientesDe(grafo, fin)) {
      if (vistas.has(siguiente)) continue
      vistas.add(siguiente)
      pendientes.push(siguiente)
    }
    if (vistas.size > ARISTAS_MAXIMAS_DE_UN_PASAJE) sinSalida = false
  }
  pasajes.set(salida, sinSalida)
  return sinSalida
}

// Seguir derecho: la misma calle, o la que sigue de frente con la misma importancia.
function esContinuacion(recorrido, salida) {
  const { grafo, actual } = recorrido
  const angulo = Math.abs(diferenciaDeRumbo(rumboDeLlegada(grafo, actual), rumboDeSalida(grafo, salida)))
  if (esLaMismaCalle(grafo, actual, salida)) return angulo <= GRADOS_MAXIMOS_PARA_PERMANECER
  return angulo <= GRADOS_DE_LA_CONTINUACION && grafo.rango[salida] === grafo.rango[actual]
}

// Un ramal corto que pasa a la calzada contraria de la misma calle es un retorno: no es una decisión de ruta (para eso está dar la vuelta).
function esUnRetorno(recorrido, salida) {
  const { grafo, actual } = recorrido
  const destino = calleDeLaSalida(grafo, salida)
  return (
    esLaMismaCalle(grafo, actual, destino) &&
    Math.abs(diferenciaDeRumbo(rumboDeLlegada(grafo, actual), rumboDeSalida(grafo, destino))) >
      GRADOS_DEL_RETORNO
  )
}

// Las salidas que llevan a alguna parte: sin los retornos ni los pasajes sin salida (salvo que no quede otra).
function salidasUtiles(recorrido, todasLasPermitidas) {
  const sinRetornos = todasLasPermitidas.filter(arista => !esUnRetorno(recorrido, arista))
  const conCalles = sinRetornos.length ? sinRetornos : todasLasPermitidas
  const pasajes = conCalles.filter(arista => esUnPasajeSinSalida(recorrido, arista))
  return pasajes.length < conCalles.length ? conCalles.filter(arista => !pasajes.includes(arista)) : conCalles
}

// Cerca de A y de B se ofrece todo; lejos, solo las calles importantes, seguir derecho y las calles chicas que conectan arterias.
function opcionesOfrecidas(recorrido, todasLasPermitidas, nodo) {
  const { grafo, actual } = recorrido
  if (!todasLasPermitidas.length) return []
  const permitidas = salidasUtiles(recorrido, todasLasPermitidas)
  const todas = permitidas.map(arista => ({ aristas: [arista], arista }))
  if (estaCercaDeLosExtremos(recorrido, nodo)) return conLaMejorSalida(recorrido, todas, todasLasPermitidas)
  const ofrecidas = []
  for (const arista of permitidas) {
    if (grafo.rango[arista] <= RANGO_DE_ARTERIA || esContinuacion(recorrido, arista)) {
      ofrecidas.push({ aristas: [arista], arista })
      continue
    }
    if (conectorDe(recorrido, actual, arista)) ofrecidas.push({ aristas: [arista], arista, tipo: 'conector' })
  }
  return conLaMejorSalida(recorrido, ofrecidas.length ? ofrecidas : todas, todasLasPermitidas)
}

// Lo que se oculta por ser poco importante no puede ser justo lo mejor: si la mejor salida del cruce quedó fuera, se agrega.
function conLaMejorSalida(recorrido, ofrecidas, permitidas) {
  const { grafo, actual, faltan } = recorrido
  const costo = arista => segundosDeGiro(grafo, actual, arista) + faltan[arista]
  const mejor = permitidas.reduce((a, b) => (costo(b) < costo(a) ? b : a))
  if (ofrecidas.some(opcion => opcion.arista === mejor)) return ofrecidas
  return [
    ...ofrecidas,
    { aristas: [mejor], arista: mejor, ...(esUnRetorno(recorrido, mejor) && { tipo: 'retorno' }) },
  ]
}

// Solo cerca de B, donde una calle con bandejón puede obligar a dar la vuelta; lejos, los retornos se obvian.
function opcionDeVuelta(recorrido) {
  const { grafo, actual } = recorrido
  if (grafo.inversa[actual] !== -1 || grafo.banderas[actual] & (BANDERA.ROTONDA | BANDERA.ENLACE)) return null
  const metrosAlDestino = distanciaEnMetros(
    puntoDelNodo(grafo, grafo.hasta[actual]),
    recorrido.ruta.destino.punto,
  )
  if (metrosAlDestino > METROS_DONDE_SE_OFRECE_LA_VUELTA) return null
  const llegadaAnterior = rumboDeLlegada(grafo, actual)
  const camino = buscarCamino(grafo, actual, {
    esMeta: arista =>
      esLaMismaCalle(grafo, arista, actual) &&
      Math.abs(diferenciaDeRumbo(llegadaAnterior, rumboDeSalida(grafo, arista))) >
        GRADOS_DE_LA_CALLE_CONTRARIA,
    maximoDeMetros: METROS_MAXIMOS_DE_UNA_VUELTA,
  })
  return camino && { aristas: camino.aristas, arista: camino.aristas.at(-1), tipo: 'vuelta' }
}

function opcionesDelCruce(recorrido) {
  const { grafo, actual } = recorrido
  if (actual === -1) {
    const salidas = recorrido.ruta.origen.aristas.map(({ arista }) => arista)
    const conSalida = salidas.filter(
      arista => !esUnPasajeSinSalida(recorrido, arista, { desdeElOrigen: true }),
    )
    return (conSalida.length ? conSalida : salidas).map(arista => ({
      aristas: [arista],
      arista,
      tipo: 'origen',
    }))
  }
  const nodo = grafo.hasta[actual]
  const permitidas = [...salientesDe(grafo, nodo)].filter(arista => giroPermitido(grafo, actual, arista))
  const deRotonda = opcionesDeRotonda(recorrido, nodo, permitidas)
  if (deRotonda) {
    const ofrecidas = deRotonda.filter(
      opcion => estaCercaDeLosExtremos(recorrido, nodo) || grafo.rango[opcion.arista] <= RANGO_DE_ARTERIA,
    )
    const mejor = deRotonda.reduce((a, b) =>
      segundosQueFaltanPor(recorrido, b) < segundosQueFaltanPor(recorrido, a) ? b : a,
    )
    if (!ofrecidas.length) return deRotonda
    return ofrecidas.includes(mejor) ? ofrecidas : [...ofrecidas, mejor]
  }
  return opcionesOfrecidas(recorrido, permitidas, nodo)
}

function aplicarOpcion(recorrido, opcion) {
  const { grafo, llegadas, ruta } = recorrido
  for (const arista of opcion.aristas) {
    const venia = recorrido.actual
    const fraccionDeSalida =
      venia === -1 ? ruta.origen.aristas.find(salida => salida.arista === arista).fraccion : 0
    if (venia !== -1) recorrido.segundos += segundosDeGiro(grafo, venia, arista)
    recorrido.aristas.push(arista)
    recorrido.actual = arista
    const propios = segundosDeArista(grafo, arista)
    const fraccionDeLlegada = llegadas.get(arista)
    if (fraccionDeLlegada !== undefined && fraccionDeLlegada >= fraccionDeSalida) {
      recorrido.segundos += (fraccionDeLlegada - fraccionDeSalida) * propios
      recorrido.fin = 'llegada'
      return
    }
    recorrido.segundos += (1 - fraccionDeSalida) * propios
    if (grafo.banderas[arista] & BANDERA.FUERA_DEL_AREA) {
      recorrido.fin = 'fuera'
      return
    }
  }
  if (recorrido.segundos > recorrido.optimoSegundos * VECES_EL_OPTIMO_PARA_ABANDONAR)
    recorrido.fin = 'abandono'
}

function segundosQueFaltanPor(recorrido, opcion) {
  const { grafo, faltan } = recorrido
  if (recorrido.actual === -1) {
    const salida = recorrido.ruta.origen.aristas.find(candidata => candidata.arista === opcion.arista)
    return segundosDesdeElOrigen(grafo, faltan, recorrido.llegadas, salida)
  }
  let previa = recorrido.actual
  let segundos = 0
  opcion.aristas.forEach((arista, posicion) => {
    segundos += segundosDeGiro(grafo, previa, arista)
    segundos += posicion === opcion.aristas.length - 1 ? faltan[arista] : segundosDeArista(grafo, arista)
    previa = arista
  })
  return segundos
}

// En una autopista, si lo único que no es una salida es seguir por la calzada principal, eso es "permanecer": las salidas se
// entienden solas como salidas. Solo cuando hay dos calzadas que llevan a tramos distintos importa el lado.
function marcarPermanencia(recorrido, opciones) {
  const { grafo, actual } = recorrido
  for (const opcion of opciones) opcion.permanece = false
  if (actual === -1 || grafo.rango[actual] > RANGO_DE_UNA_AUTOPISTA) return
  const principales = opciones.filter(
    opcion =>
      !opcion.esEnlace &&
      !opcion.ventana &&
      !['vuelta', 'retorno', 'rotonda', 'origen', 'permanecer'].includes(opcion.tipo),
  )
  if (principales.length === 1) principales[0].permanece = true
}

// Partiendo entre dos calles (una plaza rodeada de calles de un solo sentido), las salidas pueden ser "a la izquierda" las dos:
// se distinguen diciendo dónde queda cada calle respecto de hacia donde se mira.
function marcarDondeQuedaCadaCalleDeSalida({ grafo, ruta }, opciones, mirando) {
  if (new Set(opciones.map(opcion => grafo.nombre[opcion.arista])).size < 2) return
  for (const opcion of opciones) {
    const calle = puntoMasCercanoDeArista(grafo, opcion.arista, ruta.origen.punto)
    const angulo = diferenciaDeRumbo(mirando, rumboEntre(ruta.origen.punto, calle))
    opcion.dondeQuedaLaCalle =
      Math.abs(angulo) <= GRADOS_PARA_SEGUIR_DERECHO * 3
        ? 'la calle de enfrente'
        : Math.abs(angulo) >= GRADOS_PARA_MANTENERSE * 2
          ? 'la calle de atrás'
          : angulo > 0
            ? 'la calle de la derecha'
            : 'la calle de la izquierda'
  }
}

// Dos o tres ramas que salen casi en la misma dirección son una bifurcación: se distinguen por el lado, no por "seguir derecho".
function etiquetarBifurcacion(opciones) {
  const alFrente = opciones.filter(
    opcion =>
      !['vuelta', 'retorno', 'rotonda', 'origen', 'permanecer'].includes(opcion.tipo) &&
      !opcion.ventana &&
      !opcion.permanece &&
      Math.abs(opcion.angulo) <= GRADOS_PARA_MANTENERSE,
  )
  if (alFrente.length < 2) return
  const ordenadas = alFrente.toSorted((a, b) => a.angulo - b.angulo)
  if (ordenadas.at(-1).angulo - ordenadas[0].angulo > GRADOS_MAXIMOS_ENTRE_RAMAS_DE_UNA_BIFURCACION) return
  ordenadas.forEach((opcion, posicion) => {
    opcion.giro =
      posicion === 0
        ? 'mantenerse-izquierda'
        : posicion === ordenadas.length - 1
          ? 'mantenerse-derecha'
          : 'recto'
  })
}

// Hacia dónde mira quien parte de A: hacia la calle (el punto de partida queda a un lado), para decir "a la izquierda" o "a la derecha".
export function rumboDeLaVistaEnElOrigen(grafo, ruta) {
  const { punto, aristas } = ruta.origen
  const calle = puntoMasCercanoDeArista(grafo, aristas[0].arista, punto)
  if (distanciaEnMetros(punto, calle) < METROS_PARA_MIRAR_HACIA_LA_CALLE)
    return rumboDeSalida(grafo, aristas[0].arista)
  return rumboEntre(punto, calle)
}

function describir(recorrido, opciones) {
  const { grafo, actual } = recorrido
  const llegada =
    actual === -1 ? rumboDeLaVistaEnElOrigen(grafo, recorrido.ruta) : rumboDeLlegada(grafo, actual)
  for (const opcion of opciones) {
    if (opcion.ventana || (opcion.pasos && !opcion.etiquetadaPorElDestino)) {
      opcion.segundosQueFaltan = segundosQueFaltanPor(recorrido, opcion)
      opcion.id = String(opcion.arista)
      continue
    }
    const rumbo = rumboDeSalida(grafo, opcion.etiquetadaPorElDestino ? opcion.arista : opcion.aristas[0])
    opcion.tipo ??= 'calle'
    const esVuelta = ['vuelta', 'retorno'].includes(opcion.tipo)
    opcion.giro = esVuelta ? 'vuelta' : giroDe(diferenciaDeRumbo(llegada, rumbo))
    opcion.nombre = opcion.nombreFijo ?? nombreDeLaSalida(grafo, opcion.arista)
    opcion.enAutopista = actual !== -1 && grafo.rango[actual] <= RANGO_DE_UNA_AUTOPISTA
    opcion.entraAUnaAutopista =
      !opcion.enAutopista && grafo.rango[calleDeLaSalida(grafo, opcion.arista)] <= RANGO_DE_UNA_AUTOPISTA
    opcion.mismaCalleQueLaDeOrigen = actual !== -1 && nombreDeLaCalle(grafo, actual) === opcion.nombre
    opcion.vuelveDondeVenia =
      opcion.tipo === 'rotonda' &&
      actual !== -1 &&
      esLaMismaCalle(grafo, actual, opcion.arista) &&
      Math.abs(diferenciaDeRumbo(llegada, rumboDeSalida(grafo, opcion.arista))) > GRADOS_DEL_RETORNO
    opcion.hacia = puntoCardinal(rumboDeSalida(grafo, opcion.arista))
    if (opcion.nombre === SIN_NOMBRE && opcion.tipo === 'origen')
      opcion.llevaA = calleAlFinalDelCamino(grafo, opcion.arista)
    opcion.rango = grafo.rango[opcion.arista]
    opcion.esEnlace = !!(grafo.banderas[opcion.arista] & BANDERA.ENLACE)
    opcion.numeroDeSalida = grafo.salidasNumeradas[opcion.arista] ?? null
    opcion.destino = grafo.etiquetas[opcion.arista] ?? null
    opcion.segundosQueFaltan = segundosQueFaltanPor(recorrido, opcion)
    opcion.id = opcion.tipo === 'vuelta' ? 'vuelta' : String(opcion.arista)
    opcion.angulo = esVuelta ? ANGULO_DE_LA_VUELTA : diferenciaDeRumbo(llegada, rumbo)
  }
  marcarPermanencia(recorrido, opciones)
  if (actual === -1) marcarDondeQuedaCadaCalleDeSalida(recorrido, opciones, llegada)
  etiquetarBifurcacion(opciones)
  const nombres = opciones.filter(opcion => opcion.tipo !== 'vuelta').map(opcion => opcion.nombre)
  const nombresRepetidos = new Set(nombres.filter((nombre, i) => nombres.indexOf(nombre) !== i))
  for (const opcion of opciones) {
    const base = textoDeOpcion(opcion, nombresRepetidos.has(opcion.nombre))
    opcion.texto = opcion.metrosHastaElCruce
      ? `${base} (a ${aDiezMetros(opcion.metrosHastaElCruce)} m)`
      : base
  }
  return opciones.sort((a, b) => ordenEnLaTarjeta(a) - ordenEnLaTarjeta(b))
}

const aDiezMetros = metros => Math.max(10, Math.round(metros / 10) * 10)

// Primero lo del cruce actual, de izquierda a derecha; después lo de los cruces siguientes, por distancia; al final, las vueltas.
function ordenEnLaTarjeta(opcion) {
  if (['vuelta', 'retorno'].includes(opcion.tipo)) return ORDEN_DE_LO_QUE_VA_AL_FINAL
  if (opcion.tipo === 'permanecer' || opcion.esLaContinuacion || opcion.permanece)
    return ORDEN_DE_LO_QUE_VA_AL_PRINCIPIO
  return (opcion.metrosHastaElCruce ?? 0) * 1000 + opcion.angulo
}

const LADOS = { derecha: 'la derecha', izquierda: 'la izquierda' }

function textoDeSalirDelOrigen(opcion, calle) {
  let por = calle
  if (opcion.llevaA) por = ` por el camino que sale a ${opcion.llevaA}`
  const rumbo = ` (${opcion.dondeQuedaLaCalle ? `${opcion.dondeQuedaLaCalle}, ` : ''}hacia el ${opcion.hacia})`
  if (opcion.giro === 'recto') return `Salir de frente${por}${rumbo}`
  if (opcion.giro === 'atras') return `Salir hacia atrás${por}${rumbo}`
  return `Salir a ${LADOS[opcion.giro.endsWith('derecha') ? 'derecha' : 'izquierda']}${por}${rumbo}`
}

export function textoDeOpcion(opcion, conPuntoCardinal = false) {
  const hacia = conPuntoCardinal ? ` hacia el ${opcion.hacia}` : ''
  const por = opcion.nombre === SIN_NOMBRE ? '' : ` por ${opcion.nombre}`
  if (opcion.tipo === 'vuelta' || opcion.tipo === 'retorno') return 'Dar la vuelta en el próximo retorno'
  if (opcion.tipo === 'permanecer')
    return `Permanecer en ${opcion.nombre === SIN_NOMBRE ? 'esta calle' : opcion.nombre}`
  if (opcion.permanece)
    return `Permanecer en ${opcion.nombre === SIN_NOMBRE ? 'la autopista' : opcion.nombre}`
  if (opcion.tipo === 'origen') return textoDeSalirDelOrigen(opcion, por)
  if (opcion.tipo === 'rotonda' && opcion.vuelveDondeVenia)
    return `Tomar la ${opcion.orden}ª salida de la rotonda: volver por${por.replace(' por', '')} (por donde llegaste)`
  if (opcion.tipo === 'rotonda') return `Tomar la ${opcion.orden}ª salida de la rotonda${por}${hacia}`
  const lado = opcion.giro.endsWith('derecha') ? 'derecha' : 'izquierda'
  if (opcion.esEnlace && (opcion.numeroDeSalida || opcion.destino)) {
    const numero = opcion.numeroDeSalida ? ` ${opcion.numeroDeSalida}` : ''
    return `Tomar la salida${numero} hacia ${opcion.destino ?? opcion.nombre}`
  }
  if (opcion.esEnlace && opcion.entraAUnaAutopista && opcion.nombre !== SIN_NOMBRE)
    return `Tomar la entrada a ${opcion.nombre}`
  if (opcion.esEnlace && opcion.enAutopista) {
    const haciaDonde =
      opcion.nombre === SIN_NOMBRE || opcion.mismaCalleQueLaDeOrigen ? '' : ` hacia ${opcion.nombre}`
    return `Tomar la salida${haciaDonde}`
  }
  const ramal = opcion.esEnlace ? ' (ramal)' : ''
  const porDeLaCalle = opcion.esEnlace && opcion.mismaCalleQueLaDeOrigen ? '' : por
  if (opcion.giro === 'recto') return `Seguir derecho${porDeLaCalle}${ramal}${hacia}`
  if (opcion.giro.startsWith('mantenerse'))
    return `Mantenerse a ${LADOS[lado]}${porDeLaCalle}${ramal}${hacia}`
  return `Doblar a ${LADOS[lado]}${porDeLaCalle}${ramal}${hacia}`
}

// Un ramal sin nombre se dice por la calle de la que sale.
function nombreParaDecir({ grafo, aristas }, arista) {
  const nombre = nombreDeLaSalida(grafo, arista)
  if (nombre !== SIN_NOMBRE) return nombre
  const conNombre = aristas.findLast(otra => tieneNombre(grafo, otra))
  return conNombre === undefined ? SIN_NOMBRE : `un ramal de ${nombreDeLaCalle(grafo, conNombre)}`
}

const esDeUnCruceComplejo = (grafo, arista) =>
  (grafo.rango[arista] <= RANGO_DE_ARTERIA || grafo.banderas[arista] & BANDERA.ENLACE) &&
  grafo.metros[arista] <= METROS_DE_UN_TRAMO_DE_CRUCE_COMPLEJO

function conLaLlegadaEn(recorrido, arista, hacer) {
  const antes = recorrido.actual
  recorrido.actual = arista
  try {
    return hacer()
  } finally {
    recorrido.actual = antes
  }
}

// Dentro de un cruce grande solo hay ramas que siguen de frente y ramales; una calle que dobla en serio o una rotonda no se agrupan.
function esUnaDecisionAparte({ grafo, actual }, opcion) {
  if (opcion.tipo === 'rotonda') return true
  if (opcion.tipo === 'vuelta' || opcion.tipo === 'retorno' || grafo.banderas[opcion.arista] & BANDERA.ENLACE)
    return false
  const angulo = diferenciaDeRumbo(rumboDeLlegada(grafo, actual), rumboDeSalida(grafo, opcion.aristas[0]))
  return Math.abs(angulo) > GRADOS_PARA_MANTENERSE
}

// Los caminos que atraviesan un cruce grande (ramales y calzadas modelados con varios nodos seguidos), hasta la primera calle larga.
function hojasDelCruceComplejo(recorrido, opciones, previo) {
  const { grafo, llegadas } = recorrido
  describir(recorrido, opciones)
  return opciones.flatMap(opcion => {
    if (grafo.hasta[opcion.arista] !== undefined && previo.nodos.has(grafo.hasta[opcion.arista])) return []
    const metrosDeLaOpcion =
      opcion.tipo === 'rotonda'
        ? grafo.metros[opcion.arista]
        : opcion.aristas.reduce((suma, arista) => suma + grafo.metros[arista], 0)
    const hoja = {
      aristas: [...previo.aristas, ...opcion.aristas],
      pasos: [...previo.pasos, opcion],
      metros: previo.metros + metrosDeLaOpcion,
      nodos: new Set([...previo.nodos, ...opcion.aristas.map(arista => grafo.hasta[arista])]),
    }
    const ultima = opcion.arista
    const sigue =
      hoja.metros <= METROS_DE_UN_CRUCE_COMPLEJO &&
      hoja.pasos.length < PASOS_MAXIMOS_DE_UN_CRUCE_COMPLEJO &&
      !['vuelta', 'retorno'].includes(opcion.tipo) &&
      !llegadas.has(ultima) &&
      !(grafo.banderas[ultima] & BANDERA.FUERA_DEL_AREA) &&
      esDeUnCruceComplejo(grafo, ultima)
    if (!sigue) return [hoja]
    const siguientes = conLaLlegadaEn(recorrido, ultima, () => {
      const opcionesSiguientes = opcionesDelCruce(recorrido).filter(
        opcion => !hoja.nodos.has(grafo.hasta[opcion.arista]),
      )
      const hayQueElegirEnSerio =
        opcionesSiguientes.length > 1 &&
        opcionesSiguientes.some(opcion => esUnaDecisionAparte(recorrido, opcion))
      const llegaAOtraRotonda = opcionesSiguientes.some(opcion => opcion.tipo === 'rotonda')
      if (!opcionesSiguientes.length || hayQueElegirEnSerio || llegaAOtraRotonda) return null
      return hojasDelCruceComplejo(recorrido, opcionesSiguientes, hoja)
    })
    return siguientes ?? [hoja]
  })
}

const esMenor = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

// Las opciones de un cruce, sin repetir decisiones que son una sola: cada destino (la calle larga a la que se llega) es una opción.
function opcionesAgrupadas(recorrido) {
  const raiz = opcionesDelCruce(recorrido)
  if (recorrido.actual === -1 || raiz.length < 2) return raiz
  const { grafo } = recorrido
  const nodoDeLaLlegada = grafo.hasta[recorrido.actual]
  const hojas = hojasDelCruceComplejo(recorrido, raiz, {
    aristas: [],
    pasos: [],
    metros: 0,
    nodos: new Set([nodoDeLaLlegada]),
  })
  // Un ramal que sale y vuelve a la misma calle en sentido contrario (un retorno) es dar la vuelta, aunque no lo diga.
  const terminaMirandoHaciaAtras = hoja =>
    hoja.pasos.length > 1 &&
    hoja.pasos[0].tipo !== 'rotonda' &&
    esLaMismaCalle(grafo, recorrido.actual, hoja.aristas.at(-1)) &&
    Math.abs(
      diferenciaDeRumbo(rumboDeLlegada(grafo, recorrido.actual), rumboDeLlegada(grafo, hoja.aristas.at(-1))),
    ) > GRADOS_DEL_RETORNO
  const costos = hojas.map(hoja => segundosQueFaltanPor(recorrido, { aristas: hoja.aristas }))
  const masRapida = costos.indexOf(Math.min(...costos))
  const candidatas = []
  for (const [posicion, hoja] of hojas.entries()) {
    const destino = hoja.aristas.at(-1)
    if (posicion !== masRapida && hoja.pasos[0].tipo !== 'rotonda' && esUnRetorno(recorrido, destino))
      continue
    candidatas.push({ hoja, destino, segundos: costos[posicion] })
  }
  // Cada rama que se ve en el cruce es una opción, y lleva por esa misma calle (Gran Vía sigue por Gran Vía aunque haya un
  // ramal que después empalme con Santa Teresa); entre varias, la más rápida.
  const porRama = new Map()
  for (const candidata of candidatas) {
    const rama = candidata.hoja.pasos[0]
    const nombreDeLaRama = nombreDeLaSalida(grafo, rama.arista)
    const sigueEnLaRama =
      nombreDeLaRama !== SIN_NOMBRE && nombreDeLaCalle(grafo, candidata.destino) === nombreDeLaRama
    const daLaVuelta =
      candidata.hoja.pasos.some(paso => ['retorno', 'vuelta'].includes(paso.tipo)) ||
      terminaMirandoHaciaAtras(candidata.hoja)
    const rango = [daLaVuelta ? 1 : 0, sigueEnLaRama ? 0 : 1, candidata.hoja.pasos.length, candidata.segundos]
    const anterior = porRama.get(rama)
    if (!anterior || esMenor(rango, anterior.rango)) porRama.set(rama, { ...candidata, rango })
  }
  const elegidas = [...porRama.values()]
  // La mejor ruta siempre se ofrece, aunque no sea la de ninguna rama (se nombra por la calle a la que llega).
  const mejor = candidatas.reduce((a, b) => (b.segundos < a.segundos ? b : a))
  if (!elegidas.some(elegida => elegida.destino === mejor.destino))
    elegidas.push({ ...mejor, porElDestino: true })
  return elegidas.map(({ hoja, porElDestino: pedidaPorElDestino }) => {
    const [primero] = hoja.pasos
    if (terminaMirandoHaciaAtras(hoja))
      return {
        ...primero,
        aristas: hoja.aristas,
        arista: hoja.aristas.at(-1),
        pasos: hoja.pasos,
        tipo: 'retorno',
      }
    const terminaEnUnRamal = !!(grafo.banderas[hoja.aristas.at(-1)] & BANDERA.ENLACE)
    const porElDestino = pedidaPorElDestino || (hoja.pasos.length > 1 && terminaEnUnRamal)
    if (hoja.pasos.length === 1 && !porElDestino) return primero
    return {
      ...primero,
      aristas: hoja.aristas,
      arista: hoja.aristas.at(-1),
      pasos: hoja.pasos,
      ...(porElDestino && { etiquetadaPorElDestino: true }),
    }
  })
}

const metrosDe = (grafo, aristas) => aristas.reduce((suma, arista) => suma + grafo.metros[arista], 0)

// Las opciones de un cruce que siguen de frente: la misma calle, o la que sigue con la misma importancia.
function continuacionesEn(recorrido, opciones) {
  const { grafo, actual } = recorrido
  const girar = opcion =>
    Math.abs(diferenciaDeRumbo(rumboDeLlegada(grafo, actual), rumboDeSalida(grafo, opcion.aristas[0])))
  const sigueAdelante = opcion =>
    Math.abs(diferenciaDeRumbo(rumboDeLlegada(grafo, actual), rumboDeSalida(grafo, opcion.arista))) <=
    GRADOS_MAXIMOS_PARA_PERMANECER
  return opciones
    .filter(
      opcion =>
        (opcion.tipo ?? 'calle') === 'calle' &&
        esContinuacion(recorrido, opcion.aristas[0]) &&
        sigueAdelante(opcion),
    )
    .sort((a, b) => girar(a) - girar(b))
}

// Si dos ramas siguen de frente es una bifurcación: no hay "permanecer" que valga, hay que elegir una rama.
const continuacionUnica = (recorrido, opciones) => {
  const continuaciones = continuacionesEn(recorrido, opciones)
  return continuaciones.length === 1 ? continuaciones[0] : undefined
}

// Una calle con varias calles laterales seguidas es una sola decisión: las próximas salidas, en orden y con su distancia, más
// "permanecer" (que pasa de largo por todas). Si se permanece, la decisión siguiente es la ventana que viene después.
function opcionesConVentana(recorrido) {
  const raiz = opcionesAgrupadas(recorrido)
  if (recorrido.actual === -1 || raiz.length < 2) return raiz
  const { grafo, llegadas } = recorrido
  const continuacion = continuacionUnica(recorrido, raiz)
  if (!continuacion) return raiz
  const adelante = []
  const camino = [...continuacion.aristas]
  let metros = metrosDe(grafo, camino)
  let ultima = continuacion.arista
  let cruces = 1
  let total = raiz.length
  while (
    cruces < CRUCES_EN_UNA_VENTANA &&
    metros <= METROS_DE_UNA_VENTANA &&
    !llegadas.has(ultima) &&
    !(grafo.banderas[ultima] & BANDERA.FUERA_DEL_AREA)
  ) {
    const cruce = conLaLlegadaEn(recorrido, ultima, () => {
      const opciones = opcionesAgrupadas(recorrido)
      describir(recorrido, opciones)
      return { opciones, alFrente: continuacionUnica(recorrido, opciones) }
    })
    if (!cruce.alFrente || cruce.opciones.some(opcion => opcion.tipo === 'rotonda')) break
    const giros = cruce.opciones.filter(
      opcion => opcion !== cruce.alFrente && !['vuelta', 'retorno'].includes(opcion.tipo),
    )
    if (total + giros.length > OPCIONES_MAXIMAS_DE_UNA_VENTANA) break
    if (giros.length) {
      cruces++
      total += giros.length
      for (const giro of giros)
        adelante.push({
          ...giro,
          aristas: [...camino, ...giro.aristas],
          ventana: true,
          metrosHastaElCruce: metros >= METROS_PARA_DECIR_LA_DISTANCIA ? metros : 0,
        })
    }
    camino.push(...cruce.alFrente.aristas)
    metros += metrosDe(grafo, cruce.alFrente.aristas)
    ultima = cruce.alFrente.arista
  }
  if (!adelante.length) {
    continuacion.esLaContinuacion = true
    return raiz
  }
  const permanecer = {
    aristas: camino,
    arista: ultima,
    tipo: 'permanecer',
    nombreFijo: nombreDeLaSalida(grafo, continuacion.arista),
  }
  return [...raiz.filter(opcion => opcion !== continuacion), permanecer, ...adelante]
}

function sinOpcionesRepetidas(opciones) {
  const masRapidas = new Map()
  for (const opcion of opciones) {
    const anterior = masRapidas.get(opcion.texto)
    if (!anterior || opcion.segundosQueFaltan < anterior.segundosQueFaltan)
      masRapidas.set(opcion.texto, opcion)
  }
  return opciones.filter(opcion => masRapidas.get(opcion.texto) === opcion)
}

function crearDecision(recorrido, opciones) {
  const vuelta = recorrido.actual === -1 ? null : opcionDeVuelta(recorrido)
  const todas = sinOpcionesRepetidas(describir(recorrido, vuelta ? [...opciones, vuelta] : opciones))
  const { grafo, actual } = recorrido
  return {
    numero: recorrido.historial.length + 1,
    ibaPor: actual === -1 ? null : nombreParaDecir(recorrido, actual),
    ibaHacia:
      actual === -1 || grafo.rango[actual] > RANGO_DE_ARTERIA
        ? null
        : puntoCardinal(rumboDeLlegada(grafo, actual)),
    arista: actual,
    forzada: todas.length === 1,
    opciones: todas,
  }
}

// Hay una sola salida y se nota: el origen, o un cruce con una única salida que cambia algo (dobla en serio, es otra calle o es un
// ramal). Seguir por la misma calle, aunque haya entradas a estacionamientos o calles sin salida, no es una decisión.
function esUnaDecisionForzada(recorrido) {
  const { grafo, actual } = recorrido
  if (actual === -1) return true
  if (grafo.banderas[actual] & BANDERA.ROTONDA) return false
  const permitidas = [...salientesDe(grafo, grafo.hasta[actual])].filter(
    arista => arista !== grafo.inversa[actual] && giroPermitido(grafo, actual, arista),
  )
  const utiles = salidasUtiles(recorrido, permitidas)
  if (utiles.length !== 1) return false
  const [salida] = utiles
  const sigueElRamal = grafo.banderas[actual] & BANDERA.ENLACE && grafo.banderas[salida] & BANDERA.ENLACE
  if (sigueElRamal) return false
  const giro = diferenciaDeRumbo(rumboDeLlegada(grafo, actual), rumboDeSalida(grafo, salida))
  return (
    Math.abs(giro) > GRADOS_DE_UNA_ESQUINA ||
    nombreDeLaCalle(grafo, salida) !== nombreDeLaCalle(grafo, actual) ||
    !!(grafo.banderas[salida] & BANDERA.ENLACE)
  )
}

function avanzarHastaDecidir(recorrido) {
  recorrido.decision = null
  for (let pasos = 0; !recorrido.fin; pasos++) {
    if (pasos > PASOS_MAXIMOS_SIN_DECIDIR) {
      recorrido.fin = 'abandono'
      return
    }
    const opciones = opcionesConVentana(recorrido)
    if (!opciones.length) {
      recorrido.fin = 'atrapado'
      return
    }
    if (opciones.length > 1 || esUnaDecisionForzada(recorrido)) {
      recorrido.decision = crearDecision(recorrido, opciones)
      return
    }
    aplicarOpcion(recorrido, opciones[0])
  }
}

function segundosParaVolverAlOrigen(recorrido) {
  const { grafo, ruta } = recorrido
  recorrido.faltanParaVolverAlOrigen ??= segundosQueFaltan(grafo, ruta.origen.aristas)
  return recorrido.actual === -1
    ? 0
    : segundosSiguiendoDesde(grafo, recorrido.faltanParaVolverAlOrigen, recorrido.actual)
}

// Volver a A y partir de nuevo. Con costo (en una ronda) se suma lo que ya se manejó y lo que toma volver a A desde donde se está.
export function reiniciarRecorrido(recorrido, { conCosto }) {
  const costo = conCosto ? recorrido.segundos + segundosParaVolverAlOrigen(recorrido) : 0
  recorrido.intentos.push({ aristas: recorrido.aristas, historial: recorrido.historial })
  recorrido.reinicios++
  recorrido.aristas = []
  recorrido.historial = []
  recorrido.actual = -1
  recorrido.segundos = costo
  recorrido.fin = costo > recorrido.optimoSegundos * VECES_EL_OPTIMO_PARA_ABANDONAR ? 'abandono' : null
  if (recorrido.fin) recorrido.decision = null
  else avanzarHastaDecidir(recorrido)
}

export function rendirse(recorrido) {
  recorrido.fin = 'rendido'
  recorrido.decision = null
}

export function elegirOpcion(recorrido, id) {
  const opcion = recorrido.decision?.opciones.find(candidata => candidata.id === id)
  if (!opcion) throw new Error(`No hay una opción "${id}" en esta decisión`)
  recorrido.historial.push({ decision: recorrido.decision, elegida: id })
  aplicarOpcion(recorrido, opcion)
  avanzarHastaDecidir(recorrido)
}

// La ruta más rápida desde el origen, para mostrarla al final.
export function rutaOptima(recorrido) {
  const { grafo, faltan, llegadas, ruta } = recorrido
  const mejorSalida = ruta.origen.aristas.reduce((mejor, salida) =>
    segundosDesdeElOrigen(grafo, faltan, llegadas, salida) <
    segundosDesdeElOrigen(grafo, faltan, llegadas, mejor)
      ? salida
      : mejor,
  )
  const aristas = [mejorSalida.arista]
  while (!llegadas.has(aristas.at(-1)) && aristas.length < grafo.cantidadDeAristas) {
    const actual = aristas.at(-1)
    let mejor = null
    let mejorSegundos = Infinity
    for (const siguiente of salientesDe(grafo, grafo.hasta[actual])) {
      if (!giroPermitido(grafo, actual, siguiente)) continue
      const segundos = segundosDeGiro(grafo, actual, siguiente) + faltan[siguiente]
      if (segundos < mejorSegundos) {
        mejor = siguiente
        mejorSegundos = segundos
      }
    }
    if (mejor === null) break
    aristas.push(mejor)
  }
  return aristas
}

export function resultadoDelRecorrido(recorrido) {
  const { fin, segundos, optimoSegundos } = recorrido
  return {
    fin,
    segundos,
    optimoSegundos,
    puntaje: fin === 'llegada' ? puntajeDeLaRuta(optimoSegundos, segundos) : 0,
    aristas: [...recorrido.intentos.flatMap(intento => intento.aristas), ...recorrido.aristas],
    intentos: [...recorrido.intentos.map(intento => intento.aristas), recorrido.aristas],
    reinicios: recorrido.reinicios,
  }
}

// Cuánto tiempo se pierde en cada decisión: la opción elegida frente a la mejor de ese momento.
export function analisisDeLasDecisiones(recorrido) {
  const hechas = [...recorrido.intentos.flatMap(intento => intento.historial), ...recorrido.historial]
  return hechas.map(({ decision, elegida }) => {
    const mejor = decision.opciones.reduce((a, b) => (b.segundosQueFaltan < a.segundosQueFaltan ? b : a))
    const opcionElegida = decision.opciones.find(opcion => opcion.id === elegida)
    return {
      numero: decision.numero,
      elegida: opcionElegida.texto,
      mejor: mejor.texto,
      perdidaEnSegundos: Math.round(opcionElegida.segundosQueFaltan - mejor.segundosQueFaltan),
    }
  })
}

// Dónde se perdió más tiempo (lo que cuesta menos de unos segundos no cuenta).
export function peoresDecisiones(recorrido, cantidad = 3) {
  return analisisDeLasDecisiones(recorrido)
    .filter(decision => decision.perdidaEnSegundos >= SEGUNDOS_QUE_NO_SE_CUENTAN_COMO_PERDIDA)
    .toSorted((a, b) => b.perdidaEnSegundos - a.perdidaEnSegundos)
    .slice(0, cantidad)
}
