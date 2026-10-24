// Cómo se llega a un lugar emblemático y por dónde se sale de él, sobre el grafo vial. Un recinto (un mall, un campus, un parque)
// tiene varias entradas: vale llegar por cualquiera de las calles que tocan su huella (el polígono de OpenStreetMap), y al partir
// se elige por cuál calle salir. Un lugar sin huella (un punto) usa las calles más cercanas.

import { BANDERA, distanciaEnMetros, puntosDeArista } from '../../compartido/grafoVial.js'
import { empezarEn } from './conduccion.js'
import { aristasCercaDe } from './indiceDeAristas.js'
import { prepararMision, rutaOptima } from './mision.js'
import { esCallejon, nombreDeCalle } from './cruces.js'
import { proyectarEnElTrazado } from './trazado.js'

// Una calle toca la huella si pasa por dentro o a menos de esto de su borde.
const METROS_AL_BORDE_DE_LA_HUELLA = 25
const METROS_DE_MARGEN_SIN_HUELLA = 40
const METROS_MAXIMOS_SIN_HUELLA = 400
const MAXIMO_DE_CALLES_DE_SALIDA = 6
const RANGO_DE_LAS_AUTOPISTAS = 1

// ¿Está el punto dentro del polígono? (trazado cerrado de [lat, lon])
function estaDentro([latitud, longitud], poligono) {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [latitudI, longitudI] = poligono[i]
    const [latitudJ, longitudJ] = poligono[j]
    if (
      latitudI > latitud !== latitudJ > latitud &&
      longitud < ((longitudJ - longitudI) * (latitud - latitudI)) / (latitudJ - latitudI) + longitudI
    )
      dentro = !dentro
  }
  return dentro
}

// En una autopista no se entra a un lugar ni se sale de él, y una rampa tampoco es una entrada.
const sirveParaEntrarOSalir = (grafo, arista) =>
  grafo.rango[arista] > RANGO_DE_LAS_AUTOPISTAS && !(grafo.banderas[arista] & BANDERA.ENLACE)

// Qué tan lejos de la huella pasa una calle (0 si pasa por dentro).
function metrosAlaHuella(puntos, huella) {
  const cerrada = [...huella, huella[0]]
  const muestras = puntos.flatMap((punto, indice) =>
    indice
      ? [punto, [(punto[0] + puntos[indice - 1][0]) / 2, (punto[1] + puntos[indice - 1][1]) / 2]]
      : [punto],
  )
  return Math.min(
    ...muestras.map(muestra =>
      estaDentro(muestra, huella) ? 0 : proyectarEnElTrazado(cerrada, muestra).distanciaMetros,
    ),
  )
}

// Las calles que tocan la huella. Si ninguna la toca (la huella de OSM es solo el edificio, como en un estadio dentro de un parque),
// las más cercanas a ella.
function aristasQueTocanLaHuella(grafo, huella) {
  const latitudes = huella.map(([latitud]) => latitud)
  const longitudes = huella.map(([, longitud]) => longitud)
  const centro = [
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  ]
  const radio =
    Math.max(...huella.map(vertice => distanciaEnMetros(centro, vertice))) + METROS_MAXIMOS_SIN_HUELLA
  const cercanas = [...aristasCercaDe(grafo, centro, radio)]
    .filter(arista => sirveParaEntrarOSalir(grafo, arista))
    .map(arista => ({ arista, metros: metrosAlaHuella(puntosDeArista(grafo, arista), huella) }))
    .filter(({ metros }) => metros <= METROS_MAXIMOS_SIN_HUELLA)
  const masCerca = Math.min(...cercanas.map(({ metros }) => metros))
  const limite =
    masCerca <= METROS_AL_BORDE_DE_LA_HUELLA
      ? METROS_AL_BORDE_DE_LA_HUELLA
      : masCerca + METROS_DE_MARGEN_SIN_HUELLA
  return cercanas.filter(({ metros }) => metros <= limite).map(({ arista }) => arista)
}

function aristasMasCercanasAlPunto(grafo, punto) {
  const cercanas = [...aristasCercaDe(grafo, punto, METROS_MAXIMOS_SIN_HUELLA)]
    .filter(arista => sirveParaEntrarOSalir(grafo, arista))
    .map(arista => ({
      arista,
      distanciaMetros: proyectarEnElTrazado(puntosDeArista(grafo, arista), punto).distanciaMetros,
    }))
    .filter(({ distanciaMetros }) => distanciaMetros <= METROS_MAXIMOS_SIN_HUELLA)
  const masCerca = Math.min(...cercanas.map(({ distanciaMetros }) => distanciaMetros))
  return cercanas
    .filter(({ distanciaMetros }) => distanciaMetros <= masCerca + METROS_DE_MARGEN_SIN_HUELLA)
    .map(({ arista }) => arista)
}

// Las calles por las que se llega al lugar (vacío si el grafo no cubre esa zona).
export function accesosDelLugar(grafo, lugar, huella) {
  const aristas = huella
    ? aristasQueTocanLaHuella(grafo, huella)
    : aristasMasCercanasAlPunto(grafo, [lugar.lat, lugar.lon])
  return new Set(aristas)
}

// Una calle sin salida (un pasaje, un acceso) no sirve para salir de un lugar: se ignora en sus dos sentidos. Si el lugar está dentro
// de una (o solo hay de esas), valen todas.
function salidasQueLlevanAAlgunaParte(grafo, accesos) {
  const utiles = [...accesos].filter(
    arista =>
      !esCallejon(grafo, arista) &&
      (grafo.inversa[arista] === -1 || !esCallejon(grafo, grafo.inversa[arista])),
  )
  return utiles.length ? utiles : [...accesos]
}

// Las salidas del lugar: las calles más cercanas a su centro (una por calle) y, de cada una, los dos sentidos si los tiene. Cada
// salida con el punto de la calle donde se parte, en el punto de esa calle más cercano al centro del lugar.
export function salidasDelLugar(grafo, accesos, centro) {
  const masCercanaPorCalle = new Map()
  for (const arista of salidasQueLlevanAAlgunaParte(grafo, accesos)) {
    const { fraccion, punto } = proyectarEnElTrazado(puntosDeArista(grafo, arista), centro)
    const distancia = distanciaEnMetros(punto, centro)
    const calle = nombreDeCalle(grafo, arista)
    if (!masCercanaPorCalle.has(calle) || distancia < masCercanaPorCalle.get(calle).distancia)
      masCercanaPorCalle.set(calle, { arista, fraccion, punto, distancia })
  }
  return [...masCercanaPorCalle.values()]
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, MAXIMO_DE_CALLES_DE_SALIDA)
    .flatMap(({ arista, fraccion, punto }) => [
      { arista, fraccion, punto },
      ...(grafo.inversa[arista] === -1
        ? []
        : [{ arista: grafo.inversa[arista], fraccion: 1 - fraccion, punto }]),
    ])
}

// La ruta de un lugar a otro ({ id, lat, lon } cada uno; `huellas` = { id: polígono }): se llega por cualquier calle que toque el
// destino y al partir se elige por cuál calle salir del origen. null si el grafo no cubre alguno de los dos o no hay camino.
export function prepararRuta(grafo, origen, destino, huellas = {}) {
  const llegada = accesosDelLugar(grafo, destino, huellas[destino.id])
  const salidas = salidasDelLugar(grafo, accesosDelLugar(grafo, origen, huellas[origen.id]), [
    origen.lat,
    origen.lon,
  ])
  if (!llegada.size || !salidas.length) return null
  const mision = prepararMision(grafo, llegada)
  const estado = empezarEn(grafo, [origen.lat, origen.lon], { mision, salidas })
  const optima = estado && rutaOptima(grafo, mision, estado.opcionesDePartida)
  return optima ? { mision, estado, optima } : null
}
