import { settings } from '../core/store.js'
import { drawMetro, outlineComunas } from './draw.js'
import { map } from './map.js'

// Ayudas del modo fácil: los bordes de las comunas y las líneas del metro, dibujados aparte de la pregunta para
// poder encenderlos y apagarlos en pleno juego. En una ronda oficial el modo es siempre difícil: no se dibuja nada.
const aidsLayer = L.layerGroup().addTo(map)
let requested = null

// borders: comunas a delinear (los juegos donde las comunas son la pregunta no las delinean); metro: líneas del metro.
export function showAids({ borders = null, metro = true } = {}) {
  requested = { borders, metro }
  redrawAids()
}

export function redrawAids() {
  aidsLayer.clearLayers()
  if (!requested || !settings.easy) return
  if (requested.borders) outlineComunas(requested.borders).addTo(aidsLayer)
  if (requested.metro) drawMetro(aidsLayer, { dots: false, weight: 3, opacity: 0.55 })
}

export function clearAids() {
  requested = null
  aidsLayer.clearLayers()
}
