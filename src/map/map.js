import { settings } from '../core/store.js'
import { scopeComunas } from '../data/dataset.js'
import { panel } from '../ui/panel.js'

const SANTIAGO_CENTER = [-33.46, -70.64]
const SANTIAGO_ZOOM = 11
const URBAN_AREA = [
  [-33.64, -70.82],
  [-33.33, -70.49],
]
const REGION_BOUNDS = [
  [-34.3, -71.8],
  [-32.8, -69.7],
]
const CHILE_PAN_LIMITS = [
  [-66, -150],
  [-5, 8],
]
const CONTINENTAL_CHILE = [
  [-44, -76],
  [-17.5, -66.5],
]
const MOBILE_WIDTH = 760

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`
const OSM_CREDIT = `&copy; ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}`
const BASEMAP_CREDIT = `${link('https://openfreemap.org', 'OpenFreeMap')} &copy; ${link('https://www.openmaptiles.org/', 'OpenMapTiles')} ${OSM_CREDIT}`

export const map = L.map('map', {
  zoomControl: true,
  minZoom: 9,
  maxZoom: 18,
  maxBounds: REGION_BOUNDS,
  maxBoundsViscosity: 0.8,
  tap: true,
}).setView(SANTIAGO_CENTER, SANTIAGO_ZOOM)
map.attributionControl.setPrefix('')

// El orden fija qué se dibuja encima de qué.
;['comunas', 'streets', 'routes', 'metro', 'points'].forEach((pane, index) => {
  map.createPane(pane)
  map.getPane(pane).style.zIndex = 410 + index * 20
})

// Todo lo que dibuja la pregunta o pantalla actual vive en esta capa, para borrarlo de una vez.
export const layer = L.layerGroup().addTo(map)

export function clearLayer() {
  layer.clearLayers()
  map.off('click')
}

// ----- mapa base (vectorial); sin WebGL se cae a las teselas raster de OSM, que siempre traen nombres
let vectorMap = null
try {
  const baseLayer = L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/positron',
    attribution: BASEMAP_CREDIT,
  }).addTo(map)
  vectorMap = baseLayer.getMaplibreMap()
} catch {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: OSM_CREDIT,
  }).addTo(map)
}

// ----- nombres del mapa: 'plain' sin nombres, 'streets' solo calles, 'labels' todo
export let labelMode = 'plain'

const isPlaceName = styleLayer => styleLayer.id.startsWith('label_')

function applyLabelMode() {
  if (!vectorMap?.getStyle()) return
  for (const styleLayer of vectorMap.getStyle().layers) {
    if (styleLayer.type !== 'symbol') continue
    const visible = labelMode === 'labels' || (labelMode === 'streets' && !isPlaceName(styleLayer))
    setVisibility(styleLayer.id, visible)
  }
}

function setVisibility(layerId, visible) {
  const value = visible ? 'visible' : 'none'
  if (vectorMap.getLayoutProperty(layerId, 'visibility') !== value)
    vectorMap.setLayoutProperty(layerId, 'visibility', value)
}

export function setLabelMode(mode) {
  labelMode = mode
  applyLabelMode()
}

// ----- relieve sombreado (AWS Terrain Tiles)
let reliefWanted = false

function addReliefLayer() {
  vectorMap.addSource('dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 13,
  })
  const firstNameLayer = vectorMap.getStyle().layers.find(styleLayer => styleLayer.type === 'symbol')
  vectorMap.addLayer(
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
    firstNameLayer?.id,
  )
}

function applyRelief() {
  if (!vectorMap?.isStyleLoaded()) return
  if (!vectorMap.getSource('dem')) addReliefLayer()
  setVisibility('relief', reliefWanted)
}

export function setRelief(on) {
  reliefWanted = on
  applyRelief()
  if (vectorMap && !vectorMap.isStyleLoaded()) vectorMap.once('idle', applyRelief)
}

if (vectorMap) {
  vectorMap.on('styledata', applyLabelMode)
  vectorMap.on('load', applyRelief)
}

// ----- encuadres: dejan libre la parte del mapa que tapa el panel
function panelPadding() {
  if (panel.classList.contains('hidden')) return { padding: [20, 20] }
  return innerWidth <= MOBILE_WIDTH
    ? { paddingTopLeft: [20, 20], paddingBottomRight: [20, panel.offsetHeight + 16] }
    : { paddingTopLeft: [50, 20], paddingBottomRight: [panel.offsetWidth + 30, 20] }
}

export function fit(bounds, maxZoom = 15) {
  map.fitBounds(bounds, { maxZoom, animate: true, ...panelPadding() })
}

export const boundsOfFeatures = features => L.geoJSON({ type: 'FeatureCollection', features }).getBounds()

// Con el Gran Santiago se encuadra la mancha urbana: el polígono de Lo Barnechea es enorme y achicaría todo.
export function fitCity() {
  fit(settings.scope === 'core' ? L.latLngBounds(URBAN_AREA) : boundsOfFeatures(scopeComunas()), 13)
}

// ----- el mapa normalmente está limitado a la RM; los juegos de Chile lo abren a todo el país
export let showingChile = false

export function setChile(on) {
  if (on === showingChile) return
  showingChile = on
  if (on) {
    map.setMinZoom(3)
    map.setMaxBounds(CHILE_PAN_LIMITS)
  } else {
    map.setMaxBounds(REGION_BOUNDS)
    map.setMinZoom(9)
    map.setView(SANTIAGO_CENTER, SANTIAGO_ZOOM, { animate: false })
  }
}

// Se espera un instante a que el panel tenga su tamaño final antes de encuadrar.
export function fitChile() {
  setTimeout(() => {
    map.invalidateSize()
    map.fitBounds(L.latLngBounds(CONTINENTAL_CHILE), { maxZoom: 6, animate: false, ...panelPadding() })
  }, 80)
}

window.addEventListener('resize', () => map.invalidateSize())
