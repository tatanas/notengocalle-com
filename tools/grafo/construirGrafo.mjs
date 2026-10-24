// Convierte lo que devuelve Overpass (calles, cruces y restricciones de giro) en el grafo dirigido de "Ruta libre".
// El formato de salida lo lee compartido/grafoVial.js (cargarGrafo).

import {
  BANDERA,
  KMH_POR_RANGO,
  RANGO_POR_CLASE_DE_OSM,
  distanciaEnMetros,
} from '../../compartido/grafoVial.js'
import { decodificarPolilinea } from '../../compartido/rutaEnAuto.js'

const METROS_DONDE_SE_ACEPTAN_CALLES_DE_SERVICIO = 450
const METROS_MAXIMOS_A_LA_ENTRADA = 40
const METROS_MAXIMOS_A_LA_ENTRADA_SI_NO_HAY_NINGUNA = 90
const METROS_DE_MARGEN_ENTRE_CANDIDATAS = 12
const METROS_PARA_CONSIDERAR_EL_PUNTO_SOBRE_LA_CALLE = 6
const FACTOR_DE_VELOCIDAD_EN_LA_CIUDAD = 0.8
const KMH_EN_ROTONDA = 20
const KMH_MAXIMO_EN_ENLACE = 50
const SERVICIOS_QUE_NO_SON_CALLE = new Set(['parking_aisle', 'drive-through', 'emergency_access'])

export function codificarPolilinea(puntos) {
  let anteriorLatitud = 0
  let anteriorLongitud = 0
  let texto = ''
  const codificar = valor => {
    let numero = valor < 0 ? ~(valor << 1) : valor << 1
    while (numero >= 0x20) {
      texto += String.fromCharCode((0x20 | (numero & 0x1f)) + 63)
      numero >>= 5
    }
    texto += String.fromCharCode(numero + 63)
  }
  for (const [latitud, longitud] of puntos) {
    const latitudEntera = Math.round(latitud * 1e6)
    const longitudEntera = Math.round(longitud * 1e6)
    codificar(latitudEntera - anteriorLatitud)
    codificar(longitudEntera - anteriorLongitud)
    anteriorLatitud = latitudEntera
    anteriorLongitud = longitudEntera
  }
  return texto
}

function clasificarCalle(etiquetas) {
  const clase = etiquetas.highway
  if (!clase) return null
  const enlace = clase.endsWith('_link')
  const rango = RANGO_POR_CLASE_DE_OSM[enlace ? clase.slice(0, -5) : clase]
  if (rango === undefined) return null
  if (['no', 'private'].includes(etiquetas.motor_vehicle) || ['no', 'private'].includes(etiquetas.motorcar))
    return null
  if (rango === 7 && SERVICIOS_QUE_NO_SON_CALLE.has(etiquetas.service)) return null
  return { rango, enlace, esPrivada: ['no', 'private'].includes(etiquetas.access) }
}

// 1 = solo en el sentido del trazado, -1 = solo al revés, 0 = ambos.
function sentidoUnicoDe(etiquetas) {
  const { oneway, junction, highway } = etiquetas
  if (['-1', 'reverse'].includes(oneway)) return -1
  if (['yes', 'true', '1'].includes(oneway)) return 1
  if (oneway === 'no') return 0
  if (junction === 'roundabout' || junction === 'circular') return 1
  if (highway === 'motorway' || highway === 'motorway_link') return 1
  return 0
}

function velocidadDe(etiquetas, rango, enlace, esRotonda) {
  if (esRotonda) return KMH_EN_ROTONDA
  const maximaIndicada = parseInt(etiquetas.maxspeed, 10)
  const kmh = Number.isFinite(maximaIndicada)
    ? maximaIndicada * FACTOR_DE_VELOCIDAD_EN_LA_CIUDAD
    : KMH_POR_RANGO[rango]
  return Math.round(enlace ? Math.min(kmh, KMH_MAXIMO_EN_ENLACE) : kmh)
}

function textoDeDestino(etiquetas) {
  const destino = etiquetas.destination ?? etiquetas.exit_to ?? etiquetas['destination:ref']
  return destino ? destino.split(';').slice(0, 2).join(' / ') : null
}

// Componentes fuertemente conexas (Tarjan, sin recursión). Devuelve el componente de cada nodo.
function componentesConexos(cantidadDeNodos, desde, hasta) {
  const salientes = Array.from({ length: cantidadDeNodos }, () => [])
  desde.forEach((nodo, arista) => salientes[nodo].push(hasta[arista]))
  const indice = new Int32Array(cantidadDeNodos).fill(-1)
  const bajo = new Int32Array(cantidadDeNodos)
  const enPila = new Uint8Array(cantidadDeNodos)
  const componente = new Int32Array(cantidadDeNodos).fill(-1)
  const pila = []
  let contador = 0
  let cantidadDeComponentes = 0
  for (let raiz = 0; raiz < cantidadDeNodos; raiz++) {
    if (indice[raiz] !== -1) continue
    const llamadas = [[raiz, 0]]
    indice[raiz] = bajo[raiz] = contador++
    pila.push(raiz)
    enPila[raiz] = 1
    while (llamadas.length) {
      const llamada = llamadas.at(-1)
      const [nodo] = llamada
      if (llamada[1] < salientes[nodo].length) {
        const vecino = salientes[nodo][llamada[1]++]
        if (indice[vecino] === -1) {
          indice[vecino] = bajo[vecino] = contador++
          pila.push(vecino)
          enPila[vecino] = 1
          llamadas.push([vecino, 0])
        } else if (enPila[vecino]) bajo[nodo] = Math.min(bajo[nodo], indice[vecino])
      } else {
        llamadas.pop()
        if (llamadas.length) {
          const [padre] = llamadas.at(-1)
          bajo[padre] = Math.min(bajo[padre], bajo[nodo])
        }
        if (bajo[nodo] === indice[nodo]) {
          let miembro
          do {
            miembro = pila.pop()
            enPila[miembro] = 0
            componente[miembro] = cantidadDeComponentes
          } while (miembro !== nodo)
          cantidadDeComponentes++
        }
      }
    }
  }
  return { componente, cantidadDeComponentes }
}

function proyeccionEnPolilinea(punto, puntos) {
  let mejor = { metros: Infinity, fraccion: 0, lado: 0 }
  let largoTotal = 0
  const largos = []
  for (let i = 1; i < puntos.length; i++) {
    largos.push(distanciaEnMetros(puntos[i - 1], puntos[i]))
    largoTotal += largos.at(-1)
  }
  let acumulado = 0
  for (let i = 1; i < puntos.length; i++) {
    const metrosPorGradoDeLongitud = 111320 * Math.cos((puntos[i][0] * Math.PI) / 180)
    const ax = (puntos[i - 1][1] - punto[1]) * metrosPorGradoDeLongitud
    const ay = (puntos[i - 1][0] - punto[0]) * 111200
    const dx = (puntos[i][1] - puntos[i - 1][1]) * metrosPorGradoDeLongitud
    const dy = (puntos[i][0] - puntos[i - 1][0]) * 111200
    const cuadrado = dx * dx + dy * dy
    const t = cuadrado ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / cuadrado)) : 0
    const metros = Math.hypot(ax + t * dx, ay + t * dy)
    if (metros < mejor.metros) {
      const haciaElPuntoX = -(ax + t * dx)
      const haciaElPuntoY = -(ay + t * dy)
      const productoCruz = dx * haciaElPuntoY - dy * haciaElPuntoX
      mejor = {
        metros,
        fraccion: largoTotal ? (acumulado + t * largos[i - 1]) / largoTotal : 0,
        lado: productoCruz < 0 ? 1 : -1,
      }
    }
    acumulado += largos[i - 1]
  }
  return mejor
}

export function construirGrafo(elementos, { area, extremos }) {
  const nodosOsm = new Map()
  const callesOsm = []
  const restricciones = []
  for (const elemento of elementos) {
    if (elemento.type === 'node') nodosOsm.set(elemento.id, elemento)
    else if (elemento.type === 'way') callesOsm.push(elemento)
    else if (elemento.type === 'relation' && elemento.tags?.type === 'restriction')
      restricciones.push(elemento)
  }
  const puntoDe = id => [nodosOsm.get(id).lat, nodosOsm.get(id).lon]
  const estaCercaDeLosExtremos = ids =>
    ids.some(id =>
      extremos.some(
        extremo => distanciaEnMetros(puntoDe(id), extremo) <= METROS_DONDE_SE_ACEPTAN_CALLES_DE_SERVICIO,
      ),
    )

  const calles = []
  for (const calle of callesOsm) {
    if (!calle.nodes.every(id => nodosOsm.has(id))) continue
    const clasificacion = clasificarCalle(calle.tags ?? {})
    if (!clasificacion) continue
    const cercaDeLosExtremos = estaCercaDeLosExtremos(calle.nodes)
    if (clasificacion.rango === 7 && !cercaDeLosExtremos) continue
    if (clasificacion.esPrivada && !cercaDeLosExtremos) continue
    calles.push({ calle, ...clasificacion })
  }

  const usosDelNodo = new Map()
  for (const { calle } of calles)
    for (const id of calle.nodes) usosDelNodo.set(id, (usosDelNodo.get(id) ?? 0) + 1)

  const tablaDeNombres = new Map()
  const nombres = []
  const indiceDelNombre = etiquetas => {
    const clave = `${etiquetas.name ?? ''}|${etiquetas.ref ?? ''}`
    if (!tablaDeNombres.has(clave)) {
      tablaDeNombres.set(clave, nombres.length)
      nombres.push({ n: etiquetas.name ?? '', r: etiquetas.ref ?? '' })
    }
    return tablaDeNombres.get(clave)
  }

  const aristas = []
  const agregarArista = arista => aristas.push({ ...arista, inversa: -1 }) - 1
  for (const { calle, rango, enlace } of calles) {
    const etiquetas = calle.tags
    const sentido = sentidoUnicoDe(etiquetas)
    const esRotonda = etiquetas.junction === 'roundabout' || etiquetas.junction === 'circular'
    const kmh = velocidadDe(etiquetas, rango, enlace, esRotonda)
    const nombre = indiceDelNombre(etiquetas)
    const destino = enlace ? textoDeDestino(etiquetas) : null
    const banderasDeLaCalle =
      (esRotonda ? BANDERA.ROTONDA : 0) |
      (enlace ? BANDERA.ENLACE : 0) |
      (sentido !== 0 ? BANDERA.SENTIDO_UNICO : 0)

    let inicio = 0
    for (let i = 1; i < calle.nodes.length; i++) {
      const esCruce = i === calle.nodes.length - 1 || usosDelNodo.get(calle.nodes[i]) > 1
      if (!esCruce) continue
      const idsDelTramo = calle.nodes.slice(inicio, i + 1)
      const puntos = idsDelTramo.map(puntoDe)
      let metros = 0
      for (let j = 1; j < puntos.length; j++) metros += distanciaEnMetros(puntos[j - 1], puntos[j])
      const etiquetasDelFinal = nodosOsm.get(idsDelTramo.at(-1)).tags ?? {}
      const etiquetasDelInicio = nodosOsm.get(idsDelTramo[0]).tags ?? {}
      const haySemaforoEnElTramo = idsDelTramo.some(
        id => nodosOsm.get(id).tags?.highway === 'traffic_signals',
      )
      const hayPareAlFinal = ['stop', 'give_way'].includes(etiquetasDelFinal.highway)
      const base = {
        metros: Math.max(0.5, +metros.toFixed(1)),
        kmh,
        rango,
        nombre,
        calleOsm: calle.id,
        destino,
        numeroDeSalida:
          enlace && etiquetasDelInicio.highway === 'motorway_junction'
            ? (etiquetasDelInicio.ref ?? etiquetasDelInicio['junction:ref'] ?? null)
            : null,
      }
      const banderasDelTramo =
        (haySemaforoEnElTramo ? BANDERA.SEMAFORO : 0) | (hayPareAlFinal ? BANDERA.PARE : 0)
      const intermedios = puntos.slice(1, -1)
      const adelante =
        sentido !== -1
          ? agregarArista({
              ...base,
              desde: idsDelTramo[0],
              hasta: idsDelTramo.at(-1),
              intermedios,
              banderas: banderasDeLaCalle | banderasDelTramo,
            })
          : -1
      const atras =
        sentido !== 1
          ? agregarArista({
              ...base,
              desde: idsDelTramo.at(-1),
              hasta: idsDelTramo[0],
              intermedios: [...intermedios].reverse(),
              banderas: banderasDeLaCalle | banderasDelTramo,
            })
          : -1
      if (adelante !== -1 && atras !== -1) {
        aristas[adelante].inversa = atras
        aristas[atras].inversa = adelante
      }
      inicio = i
    }
  }

  const aristasPorCalleYNodo = (campoDelNodo, campoDeLaCalle = 'calleOsm') => {
    const indice = new Map()
    aristas.forEach((arista, numero) => {
      const clave = `${arista[campoDeLaCalle]}:${arista[campoDelNodo]}`
      if (!indice.has(clave)) indice.set(clave, [])
      indice.get(clave).push(numero)
    })
    return indice
  }
  const queLleganACruce = aristasPorCalleYNodo('hasta')
  const queSalenDelCruce = aristasPorCalleYNodo('desde')
  const salenDeNodo = new Map()
  aristas.forEach((arista, numero) => {
    if (!salenDeNodo.has(arista.desde)) salenDeNodo.set(arista.desde, [])
    salenDeNodo.get(arista.desde).push(numero)
  })

  const giros = new Set()
  const prohibir = (entrada, salida) => giros.add(`${entrada},${salida}`)
  for (const restriccion of restricciones) {
    const tipo = restriccion.tags.restriction
    if (
      !tipo ||
      restriccion.tags.except?.split(';').some(medio => ['motorcar', 'motor_vehicle'].includes(medio))
    )
      continue
    const desde = restriccion.members.find(miembro => miembro.role === 'from' && miembro.type === 'way')
    const hacia = restriccion.members.find(miembro => miembro.role === 'to' && miembro.type === 'way')
    const via = restriccion.members.find(miembro => miembro.role === 'via' && miembro.type === 'node')
    if (!desde || !hacia || !via) continue
    const entradas = queLleganACruce.get(`${desde.ref}:${via.ref}`) ?? []
    const salidas = queSalenDelCruce.get(`${hacia.ref}:${via.ref}`) ?? []
    if (tipo === 'no_u_turn') {
      for (const entrada of entradas)
        if (aristas[entrada].inversa !== -1) prohibir(entrada, aristas[entrada].inversa)
    } else if (tipo.startsWith('no_')) {
      for (const entrada of entradas) for (const salida of salidas) prohibir(entrada, salida)
    } else if (tipo.startsWith('only_')) {
      for (const entrada of entradas)
        for (const otra of salenDeNodo.get(via.ref) ?? [])
          if (!salidas.includes(otra)) prohibir(entrada, otra)
    }
  }

  const idsDeNodo = [...new Set(aristas.flatMap(arista => [arista.desde, arista.hasta]))]
  const numeroDeNodo = new Map(idsDeNodo.map((id, numero) => [id, numero]))
  const { componente, cantidadDeComponentes } = componentesConexos(
    idsDeNodo.length,
    aristas.map(arista => numeroDeNodo.get(arista.desde)),
    aristas.map(arista => numeroDeNodo.get(arista.hasta)),
  )
  const tamanos = new Int32Array(cantidadDeComponentes)
  componente.forEach(c => tamanos[c]++)
  const componentePrincipal = tamanos.indexOf(Math.max(...tamanos))
  const nodoEnElComponente = id => componente[numeroDeNodo.get(id)] === componentePrincipal

  const conservadas = []
  const numeroNuevoDeArista = new Map()
  aristas.forEach((arista, numero) => {
    if (!nodoEnElComponente(arista.desde) || !nodoEnElComponente(arista.hasta)) return
    numeroNuevoDeArista.set(numero, conservadas.length)
    conservadas.push(arista)
  })
  const nodosConservados = [...new Set(conservadas.flatMap(arista => [arista.desde, arista.hasta]))]
  const numeroFinalDeNodo = new Map(nodosConservados.map((id, numero) => [id, numero]))

  const fueraDelArea = id => {
    const [latitud, longitud] = puntoDe(id)
    return latitud < area.sur || latitud > area.norte || longitud < area.oeste || longitud > area.este
  }
  const datos = {
    version: 1,
    nodos: {
      lat: nodosConservados.map(id => Math.round(puntoDe(id)[0] * 1e5)),
      lon: nodosConservados.map(id => Math.round(puntoDe(id)[1] * 1e5)),
    },
    aristas: { desde: [], hasta: [], metros: [], kmh: [], rango: [], nombre: [], banderas: [], inversa: [] },
    nombres,
    formas: {},
    etiquetas: {},
    salidas: {},
    giros: [],
  }
  conservadas.forEach((arista, numero) => {
    datos.aristas.desde.push(numeroFinalDeNodo.get(arista.desde))
    datos.aristas.hasta.push(numeroFinalDeNodo.get(arista.hasta))
    datos.aristas.metros.push(arista.metros)
    datos.aristas.kmh.push(arista.kmh)
    datos.aristas.rango.push(arista.rango)
    datos.aristas.nombre.push(arista.nombre)
    datos.aristas.banderas.push(arista.banderas | (fueraDelArea(arista.hasta) ? BANDERA.FUERA_DEL_AREA : 0))
    datos.aristas.inversa.push(arista.inversa === -1 ? -1 : (numeroNuevoDeArista.get(arista.inversa) ?? -1))
    if (arista.intermedios.length) datos.formas[numero] = codificarPolilinea(arista.intermedios)
    if (arista.destino) datos.etiquetas[numero] = arista.destino
    if (arista.numeroDeSalida) datos.salidas[numero] = arista.numeroDeSalida
  })
  for (const clave of giros) {
    const [entrada, salida] = clave.split(',').map(Number)
    if (numeroNuevoDeArista.has(entrada) && numeroNuevoDeArista.has(salida))
      datos.giros.push([numeroNuevoDeArista.get(entrada), numeroNuevoDeArista.get(salida)])
  }
  return datos
}

// Las aristas por las que se entra al punto: las que pasan a menos de ~40 m y, en una calle con bandejón, solo la calzada
// que deja el punto a la derecha. Cada una con el punto (0 a 1) de la arista en que queda.
export function aristasCercaDelPunto(
  datos,
  punto,
  { puedeUsar = () => true, radioMaximoM = METROS_MAXIMOS_A_LA_ENTRADA_SI_NO_HAY_NINGUNA } = {},
) {
  const forma = arista => {
    const desde = [
      datos.nodos.lat[datos.aristas.desde[arista]] / 1e5,
      datos.nodos.lon[datos.aristas.desde[arista]] / 1e5,
    ]
    const hasta = [
      datos.nodos.lat[datos.aristas.hasta[arista]] / 1e5,
      datos.nodos.lon[datos.aristas.hasta[arista]] / 1e5,
    ]
    return [desde, ...(datos.formas[arista] ? decodificarPolilinea(datos.formas[arista]) : []), hasta]
  }
  const encontradas = []
  for (let arista = 0; arista < datos.aristas.desde.length; arista++) {
    if (!puedeUsar(arista)) continue
    const proyeccion = proyeccionEnPolilinea(punto, forma(arista))
    if (proyeccion.metros > radioMaximoM) continue
    encontradas.push({ arista, ...proyeccion })
  }
  const cercanas = encontradas.filter(candidata => candidata.metros <= METROS_MAXIMOS_A_LA_ENTRADA)
  const reunidas = cercanas.length ? cercanas : encontradas
  if (!reunidas.length) return []
  const masCercana = Math.min(...reunidas.map(candidata => candidata.metros))
  const delasMasCercanas = reunidas.filter(
    candidata => candidata.metros <= masCercana + METROS_DE_MARGEN_ENTRE_CANDIDATAS,
  )
  // En una calle con bandejón solo vale la calzada que deja el punto a la derecha; pero si ninguna cumple (un lugar rodeado de
  // calles de un solo sentido, como una plaza del centro), valen las más cercanas.
  const quedanDelLadoCorrecto = delasMasCercanas.filter(candidata => {
    const tieneSentidoContrario = datos.aristas.inversa[candidata.arista] !== -1
    return (
      tieneSentidoContrario ||
      candidata.lado === 1 ||
      candidata.metros <= METROS_PARA_CONSIDERAR_EL_PUNTO_SOBRE_LA_CALLE
    )
  })
  return (quedanDelLadoCorrecto.length ? quedanDelLadoCorrecto : delasMasCercanas).map(
    ({ arista, fraccion, metros }) => ({
      arista,
      fraccion: +fraccion.toFixed(3),
      metros: +metros.toFixed(1),
    }),
  )
}
