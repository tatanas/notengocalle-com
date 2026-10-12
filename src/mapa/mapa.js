import { ajustes } from '../nucleo/almacen.js'
import { comunasDelAlcance } from '../datos/datos.js'
import { panel } from '../interfaz/panel.js'

const CENTRO_DE_SANTIAGO = [-33.46, -70.64]
const ZOOM_DE_SANTIAGO = 11
const AREA_URBANA = [
  [-33.64, -70.82],
  [-33.33, -70.49],
]
const LIMITES_DE_REGIONES = [
  [-34.3, -71.8],
  [-32.8, -69.7],
]
const LIMITES_DE_DESPLAZAMIENTO_CHILE = [
  [-66, -150],
  [-5, 8],
]
const CHILE_CONTINENTAL = [
  [-44, -76],
  [-17.5, -66.5],
]
const ANCHO_CELULAR = 760

const enlace = (href, texto) => `<a href="${href}" target="_blank" rel="noopener">${texto}</a>`
const CREDITO_OSM = `&copy; ${enlace('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}`
const CREDITO_DEL_MAPA_BASE = `${enlace('https://openfreemap.org', 'OpenFreeMap')} &copy; ${enlace('https://www.openmaptiles.org/', 'OpenMapTiles')} ${CREDITO_OSM}`

export const mapa = L.map('map', {
  zoomControl: true,
  minZoom: 9,
  maxZoom: 18,
  maxBounds: LIMITES_DE_REGIONES,
  maxBoundsViscosity: 0.8,
  tap: true,
}).setView(CENTRO_DE_SANTIAGO, ZOOM_DE_SANTIAGO)
mapa.attributionControl.setPrefix('')

// El orden fija qué se dibuja encima de qué.
;['comunas', 'streets', 'routes', 'metro', 'points'].forEach((panelDeMapa, indice) => {
  mapa.createPane(panelDeMapa)
  mapa.getPane(panelDeMapa).style.zIndex = 410 + indice * 20
})

// Todo lo que dibuja la pregunta o pantalla actual vive en esta capa, para borrarlo de una vez.
export const capa = L.layerGroup().addTo(mapa)

export function limpiarCapa() {
  capa.clearLayers()
  mapa.off('click')
}

// ----- mapa base (vectorial); sin WebGL se cae a las teselas raster de OSM, que siempre traen nombres
let mapaVectorial = null
try {
  const capaBase = L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/positron',
    attribution: CREDITO_DEL_MAPA_BASE,
  }).addTo(mapa)
  mapaVectorial = capaBase.getMaplibreMap()
} catch {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: CREDITO_OSM,
  }).addTo(mapa)
}

// ----- nombres del mapa: 'plain' sin nombres, 'streets' solo calles, 'labels' todo
export let modoDeEtiquetas = 'plain'

const esNombreDeLugar = capaDeEstilo => capaDeEstilo.id.startsWith('label_')

function aplicarModoDeEtiquetas() {
  if (!mapaVectorial?.getStyle()) return
  for (const capaDeEstilo of mapaVectorial.getStyle().layers) {
    if (capaDeEstilo.type !== 'symbol') continue
    const visible =
      modoDeEtiquetas === 'labels' || (modoDeEtiquetas === 'streets' && !esNombreDeLugar(capaDeEstilo))
    fijarVisibilidad(capaDeEstilo.id, visible)
  }
}

function fijarVisibilidad(idDeCapa, visible) {
  const valor = visible ? 'visible' : 'none'
  if (mapaVectorial.getLayoutProperty(idDeCapa, 'visibility') !== valor)
    mapaVectorial.setLayoutProperty(idDeCapa, 'visibility', valor)
}

export function fijarModoDeEtiquetas(modo) {
  modoDeEtiquetas = modo
  aplicarModoDeEtiquetas()
}

// ----- relieve sombreado (AWS Terrain Tiles)
let relieveDeseado = false

function agregarCapaDeRelieve() {
  mapaVectorial.addSource('dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 13,
  })
  const primeraCapaDeNombres = mapaVectorial
    .getStyle()
    .layers.find(capaDeEstilo => capaDeEstilo.type === 'symbol')
  mapaVectorial.addLayer(
    {
      id: 'relief',
      type: 'hillshade',
      source: 'dem',
      layout: { visibility: 'none' },
      paint: {
        'hillshade-exaggeration': 0.55,
        'hillshade-shadow-color': '#4b5d58',
        'hillshade-highlight-color': '#ffffff',
      },
    },
    primeraCapaDeNombres?.id,
  )
}

function aplicarRelieve() {
  if (!mapaVectorial?.isStyleLoaded()) return
  if (!mapaVectorial.getSource('dem')) agregarCapaDeRelieve()
  fijarVisibilidad('relief', relieveDeseado)
}

export function fijarRelieve(on) {
  relieveDeseado = on
  aplicarRelieve()
  if (mapaVectorial && !mapaVectorial.isStyleLoaded()) mapaVectorial.once('idle', aplicarRelieve)
}

if (mapaVectorial) {
  mapaVectorial.on('styledata', aplicarModoDeEtiquetas)
  mapaVectorial.on('load', aplicarRelieve)
}

// ----- encuadres: dejan libre la parte del mapa que tapa el panel
// Con Street View a la vista, el panorama ocupa la mitad izquierda (la parte de arriba en el celular).
function rellenoConPanorama(panorama) {
  return innerWidth <= ANCHO_CELULAR
    ? { paddingTopLeft: [20, panorama.offsetHeight + 20], paddingBottomRight: [20, panel.offsetHeight + 16] }
    : { paddingTopLeft: [panorama.offsetWidth + 20, 20], paddingBottomRight: [20, 20] }
}

function relleno() {
  const panorama = document.getElementById('panorama')
  if (panorama && !panorama.hidden) return rellenoConPanorama(panorama)
  if (panel.classList.contains('hidden')) return { padding: [20, 20] }
  return innerWidth <= ANCHO_CELULAR
    ? { paddingTopLeft: [20, 20], paddingBottomRight: [20, panel.offsetHeight + 16] }
    : { paddingTopLeft: [50, 20], paddingBottomRight: [panel.offsetWidth + 30, 20] }
}

// Leaflet ignora un zoom animado pedido mientras otro sigue en curso (dura unos 250 ms) y deja el mapa donde estaba:
// si el encuadre llega en ese instante, se espera a que termine el anterior. Solo cambia ese caso.
let encuadrePendiente = null

export function encuadrar(limites, zoomMaximo = 15) {
  if (mapa._animatingZoom) {
    if (!encuadrePendiente)
      mapa.once('zoomend', () => {
        const siguiente = encuadrePendiente
        encuadrePendiente = null
        encuadrar(siguiente.bounds, siguiente.maxZoom)
      })
    encuadrePendiente = { bounds: limites, maxZoom: zoomMaximo }
    return
  }
  mapa.fitBounds(limites, { maxZoom: zoomMaximo, animate: true, ...relleno() })
}

// Cuántos kilómetros ocupan unos píxeles de dedo en este lugar y zoom del mapa.
export function kmDeDedo(latlng, pixeles = 14) {
  const dedo = mapa.containerPointToLatLng(mapa.latLngToContainerPoint(latlng).add([pixeles, 0]))
  return latlng.distanceTo(dedo) / 1000
}

export const limitesDeRasgos = rasgos =>
  L.geoJSON({ type: 'FeatureCollection', features: rasgos }).getBounds()

// En las rondas oficiales hay una cuenta regresiva en la que se puede acomodar el mapa. Si la persona lo movió,
// el encuadre general del comienzo (ciudad o Chile) ya no lo pisa.
let siguiendoAjustes = false
let vistaAjustada = false
const marcarAjustada = () => {
  if (siguiendoAjustes) vistaAjustada = true
}
for (const gesto of ['pointerdown', 'wheel']) mapa.getContainer().addEventListener(gesto, marcarAjustada)

export function vigilarAjustesDeVista(on) {
  siguiendoAjustes = on
  if (on) vistaAjustada = false
}

export function olvidarAjustesDeVista() {
  siguiendoAjustes = false
  vistaAjustada = false
}

// Con el Gran Santiago se encuadra la mancha urbana: el polígono de Lo Barnechea es enorme y achicaría todo.
export function encuadrarCiudad() {
  if (vistaAjustada) return
  encuadrar(ajustes.scope === 'core' ? L.latLngBounds(AREA_URBANA) : limitesDeRasgos(comunasDelAlcance()), 13)
}

// Como fit, pero sin redondear el zoom hacia abajo al entero: la región llena la pantalla en vez de quedar lejos.
function encuadrarDeCerca(limites, zoomMaximo) {
  const ajuste = mapa.options.zoomSnap
  mapa.options.zoomSnap = 0
  try {
    encuadrar(limites, zoomMaximo)
  } finally {
    mapa.options.zoomSnap = ajuste
  }
}

// Vista inicial de "completa el mapa": solo el Gran Santiago, de cerca; con la periferia (Colina, Lampa…), más lejos.
export function encuadrarGranSantiago() {
  if (ajustes.scope === 'core') encuadrarDeCerca(L.latLngBounds(AREA_URBANA).pad(-0.08), 14)
  else encuadrar(limitesDeRasgos(comunasDelAlcance()), 13)
}

// ----- los juegos de calles dejan correr el mapa un poco más allá de la región.
// Un río o una autopista larga (el Maipo) queda pegado al borde, y para dejarlo sobre el panel de alternativas el
// mapa necesita espacio hacia ese lado: con el límite normal, Leaflet lo empuja de vuelta y la calle queda tapada.
const LIMITES_DE_DESPLAZAMIENTO_CALLES = [
  [-35.3, -72.8],
  [-31.8, -68.7],
]
let desplazamientoAmplio = false

export function fijarDesplazamientoAmplio(on) {
  if (on === desplazamientoAmplio || mostrandoChile) return
  desplazamientoAmplio = on
  mapa.setMaxBounds(on ? LIMITES_DE_DESPLAZAMIENTO_CALLES : LIMITES_DE_REGIONES)
}

// ----- el mapa normalmente está limitado a la RM; los juegos de Chile lo abren a todo el país
export let mostrandoChile = false

export function fijarChile(on) {
  if (on === mostrandoChile) return
  mostrandoChile = on
  if (on) {
    mapa.setMinZoom(3)
    mapa.setMaxBounds(LIMITES_DE_DESPLAZAMIENTO_CHILE)
  } else {
    mapa.setMaxBounds(LIMITES_DE_REGIONES)
    mapa.setMinZoom(9)
    mapa.setView(CENTRO_DE_SANTIAGO, ZOOM_DE_SANTIAGO, { animate: false })
  }
}

// Se espera un instante a que el panel tenga su tamaño final antes de encuadrar.
export function encuadrarChile() {
  if (vistaAjustada) return
  setTimeout(() => {
    mapa.invalidateSize()
    mapa.fitBounds(L.latLngBounds(CHILE_CONTINENTAL), { maxZoom: 6, animate: false, ...relleno() })
  }, 80)
}

window.addEventListener('resize', () => mapa.invalidateSize())
